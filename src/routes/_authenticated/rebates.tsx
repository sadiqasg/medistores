import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRebates } from "@/hooks/useMedinaData";
import { PageHeader, Sheet, Empty, Money, Tag, StatCard } from "@/components/ledger";
import { PeriodFilter, Field, FormError, AsyncButton, useSubmit, today } from "@/components/medina/shared";
import { buildPeriod, type Period } from "@/lib/period";
import { formatDate, formatNumber } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/rebates")({
  head: () => ({
    meta: [
      { title: "Coca-Cola Rebates — Medina Stores" },
      { name: "description", content: "Track monthly Coca-Cola rebates by type, amount and status." },
      { property: "og:title", content: "Coca-Cola Rebates — Medina Stores" },
      { property: "og:description", content: "Track monthly Coca-Cola rebates by type, amount and status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RebatesPage,
});

const REBATE_TYPE_LABELS: Record<string, string> = {
  cash: "Cash",
  stock_credit: "Stock credit",
  discount: "Discount",
};

function RebatesPage() {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<Period>(() => buildPeriod("year"));
  const rebates = useRebates(period.from, period.to);

  // New rebate dialog state
  const [open, setOpen] = useState(false);
  const [rebateMonth, setRebateMonth] = useState(today().slice(0, 7));
  const [rebateType, setRebateType] = useState("cash");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("pending");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const rows = rebates.data ?? [];

  const totalAmount = rows.reduce((sum: number, r: any) => sum + Number(r.amount ?? 0), 0);
  const pendingCount = rows.filter((r: any) => r.status === "pending").length;
  const receivedAmount = rows
    .filter((r: any) => r.status === "received")
    .reduce((sum: number, r: any) => sum + Number(r.amount ?? 0), 0);

  const submit = useSubmit(async () => {
    if (!amount || Number(amount) <= 0) throw new Error("Enter a valid rebate amount.");
    const { error } = await supabase.from("rebates").insert({
      rebate_month: rebateMonth + "-01",
      rebate_type: rebateType,
      amount: Number(amount),
      status,
      reference: reference || null,
      notes: notes || null,
    });
    if (error) throw error;
    toast.success("Rebate recorded");
    queryClient.invalidateQueries({ queryKey: ["rebates"] });
    setAmount(""); setReference(""); setNotes(""); setStatus("pending"); setRebateType("cash");
    setOpen(false);
  });

  const updateStatus = async (id: string, newStatus: string) => {
    const { error } = await supabase.from("rebates").update({ status: newStatus }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Status updated");
    queryClient.invalidateQueries({ queryKey: ["rebates"] });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Coca-Cola Rebates"
        description={`${period.label} · ${formatDate(period.from)} – ${formatDate(period.to)}`}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <PeriodFilter period={period} onChange={setPeriod} />
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><Plus /> Record rebate</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Record a Coca-Cola rebate</DialogTitle>
                </DialogHeader>
                <form onSubmit={submit.submit} className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Rebate month">
                      <Input type="month" value={rebateMonth} onChange={(e) => setRebateMonth(e.target.value)} required />
                    </Field>
                    <Field label="Amount">
                      <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="num" required />
                    </Field>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Rebate type">
                      <Select value={rebateType} onValueChange={setRebateType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="stock_credit">Stock credit</SelectItem>
                          <SelectItem value="discount">Discount</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Status">
                      <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="received">Received</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                  <Field label="Reference (optional)">
                    <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Invoice or reference number" />
                  </Field>
                  <Field label="Notes (optional)">
                    <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
                  </Field>
                  <FormError message={submit.error} />
                  <div className="flex justify-end pt-2">
                    <AsyncButton busy={submit.busy} onClick={submit.submit}>Save rebate</AsyncButton>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid gap-px bg-rule sm:grid-cols-3">
        <StatCard label="Total rebates" value={<Money value={totalAmount} />} />
        <StatCard label="Received" value={<Money value={receivedAmount} />} tone="positive" />
        <StatCard
          label="Pending"
          value={formatNumber(pendingCount)}
          tone={pendingCount > 0 ? "warning" : undefined}
        />
      </div>

      {/* Rebates ledger */}
      <Sheet title={`Rebate ledger — ${formatNumber(rows.length)} entries`}>
        {rows.length === 0 ? (
          <Empty>No rebates recorded in this period.</Empty>
        ) : (
          <table className="ledger">
            <thead>
              <tr>
                <th>Month</th>
                <th>Type</th>
                <th>Status</th>
                <th>Reference</th>
                <th className="col-num">Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} className="transition-colors duration-200 ease-in-out">
                  <td>{formatDate(r.rebate_month).replace(/ \d{2}$/, "")}</td>
                  <td>
                    <Tag tone={r.rebate_type === "cash" ? "positive" : r.rebate_type === "stock_credit" ? "steel" : "neutral"}>
                      {REBATE_TYPE_LABELS[r.rebate_type] ?? r.rebate_type}
                    </Tag>
                  </td>
                  <td>
                    <Tag tone={r.status === "received" ? "positive" : "warning"}>
                      <span className="transition-opacity duration-200 ease-in-out">{r.status}</span>
                    </Tag>
                  </td>
                  <td className="text-muted-foreground">{r.reference || "—"}</td>
                  <td className="col-num"><Money value={Number(r.amount ?? 0)} /></td>
                  <td>
                    {r.status === "pending" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-positive hover:text-positive transition-colors duration-200 ease-in-out"
                        onClick={() => updateStatus(r.id, "received")}
                      >
                        Mark received
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Sheet>
    </div>
  );
}
