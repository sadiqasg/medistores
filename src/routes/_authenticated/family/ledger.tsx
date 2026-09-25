import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, Download } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { useShares, useDistributions } from "@/hooks/useMedinaData";
import { PageHeader, Sheet, Empty, Money, Tag, StatCard } from "@/components/ledger";
import { Field, FormError, AsyncButton, useSubmit, today, exportCsv, ExportButton } from "@/components/medina/shared";
import { formatDate, formatNumber, formatPercent, formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";

export const Route = createFileRoute("/_authenticated/family/ledger")({
  head: () => ({
    meta: [
      { title: "Family Capital Ledger — Medina Stores" },
      { name: "description", content: "Equity tracking, inheritance shares, capital accounts and shareholder distributions." },
      { property: "og:title", content: "Family Capital Ledger — Medina Stores" },
      { property: "og:description", content: "Equity tracking, inheritance shares, capital accounts and shareholder distributions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FamilyLedgerPage,
});

const PAGE_SIZE = 15;

type Shareholder = {
  id: string;
  stakeholder_name: string;
  share_percentage: number;
  capital_contribution: number;
};

type Distribution = {
  id: string;
  stakeholder_id: string;
  amount: number;
  date: string;
  source_period: string | null;
  payment_reference: string | null;
  status: "pending" | "sent" | "confirmed";
  notes: string | null;
  distribution_type: string;
  created_at: string;
  ownership_shares: { stakeholder_name: string; share_percentage: number } | null;
};

function FamilyLedgerPage() {
  const me = useMe();
  const role = me.data?.role;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const shares = useShares();
  const distributions = useDistributions();

  // New distribution drawer state
  const [open, setOpen] = useState(false);
  const [distShareholder, setDistShareholder] = useState("");
  const [distDate, setDistDate] = useState(today());
  const [distType, setDistType] = useState("withdrawal");
  const [distAmount, setDistAmount] = useState("");
  const [distReference, setDistReference] = useState("");
  const [distNotes, setDistNotes] = useState("");

  const canWrite = role === "admin";

  // ---- Capital account calculations ----
  const shareholders: Shareholder[] = useMemo(() => {
    return (shares.data ?? [])
      .filter((s: any) => s.effective_to === null)
      .map((s: any) => ({
        id: s.id,
        stakeholder_name: s.stakeholder_name,
        share_percentage: Number(s.share_percentage ?? 0),
        capital_contribution: Number(s.capital_contribution ?? 0),
      }))
      .sort((a, b) => b.share_percentage - a.share_percentage);
  }, [shares.data]);

  const allDistributions: Distribution[] = (distributions.data ?? []) as Distribution[];

  // Calculate total capital pool (sum of all capital_contribution)
  const totalCapitalPool = shareholders.reduce((sum, s) => sum + s.capital_contribution, 0);

  // Calculate total withdrawn and reinvested per shareholder from distributions
  const distributionByShareholder = useMemo(() => {
    const map = new Map<string, { withdrawn: number; reinvested: number; count: number }>();
    for (const d of allDistributions) {
      const existing = map.get(d.stakeholder_id) ?? { withdrawn: 0, reinvested: 0, count: 0 };
      if (d.distribution_type === "reinvestment") {
        existing.reinvested += Number(d.amount ?? 0);
      } else {
        existing.withdrawn += Number(d.amount ?? 0);
      }
      existing.count += 1;
      map.set(d.stakeholder_id, existing);
    }
    return map;
  }, [allDistributions]);

  // Enriched shareholder rows with both metrics
  const shareholderRows = useMemo(() => {
    return shareholders.map((s) => {
      const dist = distributionByShareholder.get(s.id) ?? { withdrawn: 0, reinvested: 0, count: 0 };
      const totalCapital = s.capital_contribution + dist.reinvested;
      const currentCapitalSharePct = totalCapitalPool > 0 ? (totalCapital / totalCapitalPool) * 100 : 0;
      return {
        ...s,
        totalCapitalContributed: totalCapital,
        totalWithdrawn: dist.withdrawn,
        reinvestedAmount: dist.reinvested,
        distributionCount: dist.count,
        currentCapitalSharePct,
        baseInheritancePct: s.share_percentage,
      };
    });
  }, [shareholders, distributionByShareholder, totalCapitalPool]);

  // Filtered distributions for the ledger
  const filteredDistributions = useMemo(() => {
    let rows = allDistributions;
    if (typeFilter !== "all") {
      rows = rows.filter((d) => d.distribution_type === typeFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((d) => {
        const name = d.ownership_shares?.stakeholder_name ?? "";
        return name.toLowerCase().includes(q) || (d.notes ?? "").toLowerCase().includes(q);
      });
    }
    return rows;
  }, [allDistributions, typeFilter, search]);

  // Pagination
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(filteredDistributions.length / PAGE_SIZE));
  const pageRows = filteredDistributions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // KPIs
  const totalDistributed = allDistributions
    .filter((d) => d.distribution_type === "withdrawal")
    .reduce((sum, d) => sum + Number(d.amount ?? 0), 0);
  const totalReinvested = allDistributions
    .filter((d) => d.distribution_type === "reinvestment")
    .reduce((sum, d) => sum + Number(d.amount ?? 0), 0);
  const totalCapital = totalCapitalPool + totalReinvested;

  const resetForm = () => {
    setDistShareholder(""); setDistDate(today()); setDistType("withdrawal");
    setDistAmount(""); setDistReference(""); setDistNotes("");
  };

  const submitDistribution = useSubmit(async () => {
    if (!distShareholder) throw new Error("Select a shareholder.");
    const amount = Number(distAmount);
    if (!amount || amount <= 0) throw new Error("Enter a valid amount.");

    const { error } = await supabase.from("profit_distributions").insert({
      stakeholder_id: distShareholder,
      date: distDate,
      amount,
      distribution_type: distType,
      payment_reference: distReference || null,
      notes: distNotes || null,
      status: "sent",
    });
    if (error) throw error;

    // If reinvestment, credit the capital_contribution on ownership_shares
    if (distType === "reinvestment") {
      const { error: updateError } = await supabase.rpc("increment_capital_contribution", {
        p_shareholder_id: distShareholder,
        p_amount: amount,
      });
      if (updateError) {
        // Non-fatal: the distribution was recorded, but capital wasn't updated
        toast.error("Distribution recorded, but capital update failed: " + updateError.message);
      }
    }

    toast.success(distType === "reinvestment" ? "Reinvestment recorded" : "Distribution recorded");
    queryClient.invalidateQueries({ queryKey: ["profit_distributions"] });
    queryClient.invalidateQueries({ queryKey: ["ownership_shares"] });
    resetForm();
    setOpen(false);
  });

  const handleExport = () => {
    exportCsv(
      "shareholder-distributions.csv",
      ["Date", "Shareholder", "Type", "Amount", "Reference", "Status", "Notes"],
      filteredDistributions.map((d) => [
        formatDate(d.date),
        d.ownership_shares?.stakeholder_name ?? "—",
        d.distribution_type === "reinvestment" ? "Reinvestment" : "Withdrawal",
        d.amount,
        d.payment_reference ?? "",
        d.status,
        d.notes ?? "",
      ]),
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Family Capital Ledger"
        description="Equity tracking, capital accounts and shareholder distributions"
        action={
          <div className="flex flex-wrap items-center gap-3">
            <ExportButton onClick={handleExport} label="Export" />
            {canWrite ? (
              <Drawer open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
                <DrawerTrigger asChild>
                  <Button><Plus /> Log payout</Button>
                </DrawerTrigger>
                <DrawerContent className="max-w-lg">
                  <DrawerHeader>
                    <DrawerTitle>Record a shareholder payout</DrawerTitle>
                  </DrawerHeader>
                  <form onSubmit={submitDistribution.submit} className="space-y-4 px-4">
                    <Field label="Shareholder">
                      <Select value={distShareholder} onValueChange={setDistShareholder}>
                        <SelectTrigger><SelectValue placeholder="Select shareholder…" /></SelectTrigger>
                        <SelectContent>
                          {shareholders.map((s) => (
                            <SelectItem value={s.id} key={s.id}>
                              {s.stakeholder_name} <span className="num text-xs text-muted-foreground">({formatPercent(s.share_percentage, 1)})</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Date">
                        <Input type="date" value={distDate} onChange={(e) => setDistDate(e.target.value)} required />
                      </Field>
                      <Field label="Type">
                        <Select value={distType} onValueChange={setDistType}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="withdrawal">Cash withdrawal</SelectItem>
                            <SelectItem value="reinvestment">Reinvestment</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Amount">
                        <Input type="number" min={0} step="0.01" value={distAmount} onChange={(e) => setDistAmount(e.target.value)} placeholder="0.00" className="num" required />
                      </Field>
                      <Field label="Reference (optional)">
                        <Input value={distReference} onChange={(e) => setDistReference(e.target.value)} placeholder="Payment ref" />
                      </Field>
                    </div>
                    <Field label="Notes (optional)" hint='e.g. "Monthly fixed draw", "Emergency asset draw"'>
                      <Textarea value={distNotes} onChange={(e) => setDistNotes(e.target.value)} rows={2} />
                    </Field>
                    <FormError message={submitDistribution.error} />
                    <DrawerFooter>
                      <AsyncButton busy={submitDistribution.busy} onClick={submitDistribution.submit}>
                        {distType === "reinvestment" ? "Record reinvestment" : "Record payout"}
                      </AsyncButton>
                      <DrawerClose asChild>
                        <Button variant="outline">Cancel</Button>
                      </DrawerClose>
                    </DrawerFooter>
                  </form>
                </DrawerContent>
              </Drawer>
            ) : null}
          </div>
        }
      />

      {/* KPI cards */}
      <div className="grid gap-px bg-rule sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Shareholders" value={formatNumber(shareholders.length)} />
        <StatCard label="Total capital pool" value={<Money value={totalCapital} />} />
        <StatCard label="Total distributed" value={<Money value={totalDistributed} />} tone="primary" />
        <StatCard label="Total reinvested" value={<Money value={totalReinvested} />} tone="positive" />
      </div>

      {/* Inheritance & Capital Matrix */}
      <Sheet title="Base inheritance & capital accounts">
        {shareholderRows.length === 0 ? (
          <Empty>No shareholders configured.</Empty>
        ) : (
          <table className="ledger">
            <thead>
              <tr>
                <th>Shareholder</th>
                <th className="col-num">Base inheritance %</th>
                <th className="col-num">Capital contributed</th>
                <th className="col-num">Reinvested (from distributions)</th>
                <th className="col-num">Total capital account</th>
                <th className="col-num">Current capital share %</th>
                <th className="col-num">Total withdrawn</th>
                <th>Distributions</th>
              </tr>
            </thead>
            <tbody>
              {shareholderRows.map((s) => (
                <tr key={s.id} className="transition-colors duration-200 ease-in-out">
                  <td className="font-medium">{s.stakeholder_name}</td>
                  <td className="col-num">
                    <span className="num font-mono tabular-nums">{formatPercent(s.baseInheritancePct, 1)}</span>
                  </td>
                  <td className="col-num"><Money value={s.capital_contribution} /></td>
                  <td className="col-num">
                    <Money value={s.reinvestedAmount} tone={s.reinvestedAmount > 0 ? "positive" : "muted"} />
                  </td>
                  <td className="col-num">
                    <Money value={s.totalCapitalContributed} tone="auto" />
                  </td>
                  <td className="col-num">
                    <div className="flex items-center justify-end gap-2">
                      <span className="num font-mono tabular-nums font-medium">
                        {formatPercent(s.currentCapitalSharePct, 1)}
                      </span>
                      {s.currentCapitalSharePct > s.baseInheritancePct ? (
                        <Tag tone="positive">+</Tag>
                      ) : s.currentCapitalSharePct < s.baseInheritancePct && s.currentCapitalSharePct > 0 ? (
                        <Tag tone="warning">-</Tag>
                      ) : null}
                    </div>
                  </td>
                  <td className="col-num">
                    <Money value={s.totalWithdrawn} tone={s.totalWithdrawn > 0 ? "negative" : "muted"} />
                  </td>
                  <td className="text-muted-foreground">{formatNumber(s.distributionCount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink">
                <td className="font-serif font-semibold">Total</td>
                <td className="col-num font-mono tabular-nums font-semibold">
                  {formatPercent(shareholderRows.reduce((sum, s) => sum + s.baseInheritancePct, 0), 1)}
                </td>
                <td className="col-num"><Money value={shareholderRows.reduce((sum, s) => sum + s.capital_contribution, 0)} /></td>
                <td className="col-num"><Money value={totalReinvested} tone="positive" /></td>
                <td className="col-num"><Money value={totalCapital} /></td>
                <td className="col-num font-mono tabular-nums font-semibold">
                  {totalCapital > 0 ? formatPercent(100, 1) : "—"}
                </td>
                <td className="col-num"><Money value={totalDistributed} tone="negative" /></td>
                <td className="text-muted-foreground">{formatNumber(allDistributions.length)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </Sheet>

      {/* Distribution filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search shareholder or notes…"
            className="w-56 pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="withdrawal">Withdrawals</SelectItem>
            <SelectItem value="reinvestment">Reinvestments</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Shareholder Distributions Ledger */}
      <Sheet title={`Shareholder distributions ledger — ${formatNumber(filteredDistributions.length)} entries`}>
        {filteredDistributions.length === 0 ? (
          <Empty>No distributions recorded yet.</Empty>
        ) : (
          <table className="ledger">
            <thead>
              <tr>
                <th>Date</th>
                <th>Shareholder</th>
                <th>Type</th>
                <th className="col-num">Amount</th>
                <th>Reference</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((d) => (
                <tr key={d.id} className="transition-colors duration-200 ease-in-out">
                  <td>{formatDate(d.date)}</td>
                  <td className="font-medium">{d.ownership_shares?.stakeholder_name ?? "—"}</td>
                  <td>
                    <Tag tone={d.distribution_type === "reinvestment" ? "positive" : "steel"}>
                      {d.distribution_type === "reinvestment" ? "Reinvestment" : "Withdrawal"}
                    </Tag>
                  </td>
                  <td className="col-num">
                    <Money
                      value={Number(d.amount ?? 0)}
                      tone={d.distribution_type === "reinvestment" ? "positive" : "negative"}
                    />
                  </td>
                  <td className="text-muted-foreground">{d.payment_reference || "—"}</td>
                  <td>
                    <Tag tone={d.status === "confirmed" ? "positive" : d.status === "sent" ? "steel" : "warning"}>
                      {d.status}
                    </Tag>
                  </td>
                  <td className="text-muted-foreground">{d.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-rule px-4 py-3">
            <span className="text-xs text-muted-foreground">
              Page {page + 1} of {totalPages} — {formatNumber(filteredDistributions.length)} total
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        ) : null}
      </Sheet>

      <p className="text-xs text-muted-foreground">
        Capital share % is calculated dynamically from each shareholder's total capital account balance relative to the pool. Reinvestments increase a shareholder's capital account; withdrawals reduce available profit but do not retroactively adjust the capital contributed balance.
      </p>
    </div>
  );
}
