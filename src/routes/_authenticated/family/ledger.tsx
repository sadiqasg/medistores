import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, Info } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { useShares, useDistributions, useSales, useExpenses, useRebates } from "@/hooks/useMedinaData";
import { PageHeader, Sheet, Empty, Money, Tag, StatCard } from "@/components/ledger";
import { PeriodFilter, Field, FormError, AsyncButton, useSubmit, today, exportCsv, ExportButton } from "@/components/medina/shared";
import { buildPeriod, type Period } from "@/lib/period";
import { formatDate, formatNumber, formatPercent } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  const [period, setPeriod] = useState<Period>(() => buildPeriod("month"));
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const shares = useShares();
  const distributions = useDistributions();
  const sales = useSales(period.from, period.to);
  const expenses = useExpenses(period.from, period.to);
  const rebates = useRebates(period.from, period.to);

  // New distribution drawer state
  const [open, setOpen] = useState(false);
  const [distShareholder, setDistShareholder] = useState("");
  const [distDate, setDistDate] = useState(today());
  const [distType, setDistType] = useState("withdrawal");
  const [distAmount, setDistAmount] = useState("");
  const [distReference, setDistReference] = useState("");
  const [distNotes, setDistNotes] = useState("");

  const canWrite = role === "admin";

  // ---- Current period net profit calculation ----
  const netProfit = useMemo(() => {
    const saleRows = (sales.data ?? []).filter((s: any) => !s.is_voided);
    const revenue = saleRows.reduce((sum: number, s: any) => sum + Number(s.total_amount ?? 0), 0);
    const cogs = saleRows.reduce((sum: number, s: any) => sum + Number(s.total_cost ?? 0), 0);
    const rebateTotal = (rebates.data ?? [])
      .filter((r: any) => r.status === "received")
      .reduce((sum: number, r: any) => sum + Number(r.amount ?? 0), 0);
    const totalOpex = (expenses.data ?? []).reduce((sum: number, e: any) => sum + Number(e.amount ?? 0), 0);
    return revenue - cogs + rebateTotal - totalOpex;
  }, [sales.data, expenses.data, rebates.data]);

  // ---- Shareholder data ----
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

  // Total capital pool (sum of all capital_contribution + all reinvestments)
  const totalReinvestedAllTime = allDistributions
    .filter((d) => d.distribution_type === "reinvestment")
    .reduce((sum, d) => sum + Number(d.amount ?? 0), 0);
  const totalCapitalBase = shareholders.reduce((sum, s) => sum + s.capital_contribution, 0);
  const totalCapitalPool = totalCapitalBase + totalReinvestedAllTime;

  // Per-shareholder distribution aggregates
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

  // Current period distributions per shareholder
  const periodDistributions = useMemo(() => {
    const map = new Map<string, { drawn: number; reinvested: number }>();
    for (const d of allDistributions) {
      if (d.date >= period.from && d.date <= period.to) {
        const existing = map.get(d.stakeholder_id) ?? { drawn: 0, reinvested: 0 };
        if (d.distribution_type === "reinvestment") {
          existing.reinvested += Number(d.amount ?? 0);
        } else {
          existing.drawn += Number(d.amount ?? 0);
        }
        map.set(d.stakeholder_id, existing);
      }
    }
    return map;
  }, [allDistributions, period]);

  // Enriched shareholder rows
  const shareholderRows = useMemo(() => {
    return shareholders.map((s) => {
      const dist = distributionByShareholder.get(s.id) ?? { withdrawn: 0, reinvested: 0, count: 0 };
      const periodDist = periodDistributions.get(s.id) ?? { drawn: 0, reinvested: 0 };
      const totalCapital = s.capital_contribution + dist.reinvested;
      const currentCapitalSharePct = totalCapitalPool > 0 ? (totalCapital / totalCapitalPool) * 100 : 0;
      const monthlyShare = (netProfit * s.share_percentage) / 100;
      const remainingAfterDraw = monthlyShare - periodDist.drawn - periodDist.reinvested;
      return {
        ...s,
        totalCapitalContributed: totalCapital,
        totalWithdrawn: dist.withdrawn,
        reinvestedAmount: dist.reinvested,
        distributionCount: dist.count,
        currentCapitalSharePct,
        baseInheritancePct: s.share_percentage,
        monthlyShare,
        drawnThisPeriod: periodDist.drawn,
        reinvestedThisPeriod: periodDist.reinvested,
        remainingAfterDraw,
      };
    });
  }, [shareholders, distributionByShareholder, periodDistributions, totalCapitalPool, netProfit]);

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
  const totalReinvested = totalReinvestedAllTime;
  const totalCapital = totalCapitalPool;

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

    if (distType === "reinvestment") {
      const { error: updateError } = await supabase.rpc("increment_capital_contribution", {
        p_shareholder_id: distShareholder,
        p_amount: amount,
      });
      if (updateError) {
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
        description={`${period.label} · ${formatDate(period.from)} – ${formatDate(period.to)}`}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <PeriodFilter period={period} onChange={(p) => { setPeriod(p); setPage(0); }} />
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

      {/* Inheritance transfer callout */}
      <div className="flex items-start gap-3 border-l-2 border-accent bg-accent/[0.06] px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <p className="text-sm leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Note:</span> MUHAMMED and HAMZA willingly transferred 5% each
          from their base inheritance to SMALL MUMMY and BIG MUMMY respectively in recognition of their active roles
          managing the store.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid gap-px bg-rule sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Shareholders" value={formatNumber(shareholders.length)} />
        <StatCard
          label={`Net profit — ${period.label.toLowerCase()}`}
          value={<Money value={netProfit} tone="auto" />}
          tone={netProfit >= 0 ? "positive" : "primary"}
        />
        <StatCard label="Total distributed (all time)" value={<Money value={totalDistributed} />} tone="primary" />
        <StatCard label="Total reinvested (all time)" value={<Money value={totalReinvested} />} tone="positive" />
      </div>

      {/* Inheritance & Capital Matrix with Monthly Profit Split */}
      <Sheet title="Inheritance matrix & monthly profit split">
        {shareholderRows.length === 0 ? (
          <Empty>No shareholders configured.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Shareholder</th>
                  <th className="col-num">Base %</th>
                  <th className="col-num">Monthly share</th>
                  <th className="col-num">Drawn (period)</th>
                  <th className="col-num">Reinvested (period)</th>
                  <th className="col-num">Remaining</th>
                  <th className="col-num">Capital account</th>
                  <th className="col-num">Capital share %</th>
                  <th className="col-num">Total drawn (all time)</th>
                </tr>
              </thead>
              <tbody>
                {shareholderRows.map((s) => (
                  <tr key={s.id} className="transition-colors duration-200 ease-in-out">
                    <td className="font-medium whitespace-nowrap">{s.stakeholder_name}</td>
                    <td className="col-num">
                      <span className="num font-mono tabular-nums">{formatPercent(s.baseInheritancePct, 1)}</span>
                    </td>
                    <td className="col-num">
                      <Money value={s.monthlyShare} tone="auto" />
                    </td>
                    <td className="col-num">
                      <Money value={s.drawnThisPeriod} tone={s.drawnThisPeriod > 0 ? "negative" : "muted"} />
                    </td>
                    <td className="col-num">
                      <Money value={s.reinvestedThisPeriod} tone={s.reinvestedThisPeriod > 0 ? "positive" : "muted"} />
                    </td>
                    <td className="col-num">
                      <Money
                        value={s.remainingAfterDraw}
                        tone={s.remainingAfterDraw > 0 ? "positive" : s.remainingAfterDraw < 0 ? "negative" : "muted"}
                      />
                    </td>
                    <td className="col-num">
                      <Money value={s.totalCapitalContributed} />
                    </td>
                    <td className="col-num">
                      <div className="flex items-center justify-end gap-2">
                        <span className="num font-mono tabular-nums font-medium">
                          {formatPercent(s.currentCapitalSharePct, 1)}
                        </span>
                        {s.currentCapitalSharePct > s.baseInheritancePct + 0.01 ? (
                          <Tag tone="positive">+</Tag>
                        ) : s.currentCapitalSharePct < s.baseInheritancePct - 0.01 && s.currentCapitalSharePct > 0 ? (
                          <Tag tone="warning">-</Tag>
                        ) : null}
                      </div>
                    </td>
                    <td className="col-num">
                      <Money value={s.totalWithdrawn} tone={s.totalWithdrawn > 0 ? "negative" : "muted"} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink">
                  <td className="font-serif font-semibold">Total</td>
                  <td className="col-num font-mono tabular-nums font-semibold">
                    {formatPercent(shareholderRows.reduce((sum, s) => sum + s.baseInheritancePct, 0), 1)}
                  </td>
                  <td className="col-num"><Money value={netProfit} tone="auto" /></td>
                  <td className="col-num">
                    <Money value={shareholderRows.reduce((sum, s) => sum + s.drawnThisPeriod, 0)} tone="negative" />
                  </td>
                  <td className="col-num">
                    <Money value={shareholderRows.reduce((sum, s) => sum + s.reinvestedThisPeriod, 0)} tone="positive" />
                  </td>
                  <td className="col-num">
                    <Money
                      value={shareholderRows.reduce((sum, s) => sum + s.remainingAfterDraw, 0)}
                      tone="auto"
                    />
                  </td>
                  <td className="col-num"><Money value={totalCapital} /></td>
                  <td className="col-num font-mono tabular-nums font-semibold">
                    {totalCapital > 0 ? formatPercent(100, 1) : "—"}
                  </td>
                  <td className="col-num"><Money value={totalDistributed} tone="negative" /></td>
                </tr>
              </tfoot>
            </table>
          </div>
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
        Monthly share = Net Profit × Base %. Drawn amounts (e.g. MAMA's ₦30k monthly draw, NANA's full share) are
        deducted directly from the calculated share; the remainder flows into the rolling reinvested capital account
        balance. Capital share % is dynamic, reflecting each member's total capital account relative to the pool.
      </p>
    </div>
  );
}
