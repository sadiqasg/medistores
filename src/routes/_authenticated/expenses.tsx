import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useSettings } from "@/hooks/useMe";
import { useExpenses } from "@/hooks/useMedinaData";
import { PageHeader, Sheet, Empty, Money, Tag, StatCard } from "@/components/ledger";
import { PeriodFilter, Field, FormError, AsyncButton, useSubmit, today, exportCsv, ExportButton } from "@/components/medina/shared";
import { buildPeriod, type Period } from "@/lib/period";
import { formatDate, formatNumber } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/expenses")({
  head: () => ({
    meta: [
      { title: "Expenses — Medina Stores" },
      { name: "description", content: "Track operating expenses by category, date and amount." },
      { property: "og:title", content: "Expenses — Medina Stores" },
      { property: "og:description", content: "Track operating expenses by category, date and amount." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExpensesPage,
});

const PAGE_SIZE = 15;

function ExpensesPage() {
  const me = useMe();
  const role = me.data?.role;
  const queryClient = useQueryClient();
  const { data: settings } = useSettings();
  const expenseCategories = settings?.expense_categories ?? ["Rent", "Transport", "Salaries", "Utilities", "Maintenance", "Other"];

  const [period, setPeriod] = useState<Period>(() => buildPeriod("month"));
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");

  const expenses = useExpenses(period.from, period.to);

  // New expense dialog
  const [open, setOpen] = useState(false);
  const [expDate, setExpDate] = useState(today());
  const [expCategory, setExpCategory] = useState(expenseCategories[0] ?? "Other");
  const [expAmount, setExpAmount] = useState("");
  const [expDesc, setExpDesc] = useState("");

  const canWrite = role === "admin";

  const filtered = useMemo(() => {
    let rows = expenses.data ?? [];
    if (catFilter !== "all") rows = rows.filter((e: any) => e.category === catFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((e: any) =>
        (e.description ?? "").toLowerCase().includes(q) || e.category.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [expenses.data, catFilter, search]);

  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // KPIs
  const totalAmount = (expenses.data ?? []).reduce((sum: number, e: any) => sum + Number(e.amount ?? 0), 0);
  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of (expenses.data ?? [])) {
      map.set(e.category, (map.get(e.category) ?? 0) + Number(e.amount ?? 0));
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [expenses.data]);
  const topCategory = byCategory[0];

  const resetForm = () => {
    setExpDate(today()); setExpCategory(expenseCategories[0] ?? "Other");
    setExpAmount(""); setExpDesc("");
  };

  const submitExpense = useSubmit(async () => {
    if (!expAmount || Number(expAmount) <= 0) throw new Error("Enter a valid amount.");
    const { error } = await supabase.from("expenses").insert({
      date: expDate,
      category: expCategory,
      amount: Number(expAmount),
      description: expDesc || null,
    });
    if (error) throw error;
    toast.success("Expense logged");
    queryClient.invalidateQueries({ queryKey: ["expenses"] });
    resetForm();
    setOpen(false);
  });

  const handleExport = () => {
    exportCsv("expenses.csv", ["Date", "Category", "Description", "Amount"],
      filtered.map((e: any) => [formatDate(e.date), e.category, e.description ?? "", e.amount]),
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        description={`${period.label} · ${formatDate(period.from)} – ${formatDate(period.to)}`}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <PeriodFilter period={period} onChange={(p) => { setPeriod(p); setPage(0); }} />
            <ExportButton onClick={handleExport} label="Export" />
            {canWrite ? (
              <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
                <DialogTrigger asChild>
                  <Button><Plus /> Log expense</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Log a new expense</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={submitExpense.submit} className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Expense date">
                        <Input type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} required />
                      </Field>
                      <Field label="Category">
                        <Select value={expCategory} onValueChange={setExpCategory}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {expenseCategories.map((cat: string) => (
                              <SelectItem value={cat} key={cat}>{cat}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                    <Field label="Amount">
                      <Input type="number" min={0} step="0.01" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} placeholder="0.00" className="num" required />
                    </Field>
                    <Field label="Description (optional)">
                      <Textarea value={expDesc} onChange={(e) => setExpDesc(e.target.value)} rows={2} placeholder="e.g. Monthly warehouse rent, fuel for delivery truck…" />
                    </Field>
                    <FormError message={submitExpense.error} />
                    <div className="flex justify-end pt-2">
                      <AsyncButton busy={submitExpense.busy} onClick={submitExpense.submit}>Save expense</AsyncButton>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            ) : null}
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid gap-px bg-rule sm:grid-cols-3">
        <StatCard label="Total expenses" value={<Money value={totalAmount} />} />
        <StatCard label="Entries" value={formatNumber(expenses.data?.length ?? 0)} />
        <StatCard
          label="Top category"
          value={topCategory ? topCategory[0] : "—"}
          sub={topCategory ? <Money value={topCategory[1]} /> : null}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search description or category…"
            className="w-56 pl-9"
          />
        </div>
        <Select value={catFilter} onValueChange={(v) => { setCatFilter(v); setPage(0); }}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {expenseCategories.map((cat: string) => (
              <SelectItem value={cat} key={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Expenses ledger */}
      <Sheet title={`Expense ledger — ${formatNumber(filtered.length)} entries`}>
        {filtered.length === 0 ? (
          <Empty>No expenses match your filters for this period.</Empty>
        ) : (
          <table className="ledger">
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Description</th>
                <th className="col-num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((e: any) => (
                <tr key={e.id} className="transition-colors duration-200 ease-in-out">
                  <td>{formatDate(e.date)}</td>
                  <td>
                    <Tag tone="neutral">{e.category}</Tag>
                  </td>
                  <td className="text-muted-foreground">{e.description || "—"}</td>
                  <td className="col-num"><Money value={Number(e.amount ?? 0)} tone="negative" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-rule px-4 py-3">
            <span className="text-xs text-muted-foreground">
              Page {page + 1} of {totalPages} — {formatNumber(filtered.length)} total
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
