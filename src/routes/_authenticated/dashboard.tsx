import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useMe } from "@/hooks/useMe";
import { useSales, useExpenses, useProducts } from "@/hooks/useMedinaData";
import { PageHeader, StatCard, Sheet, Empty, Money } from "@/components/ledger";
import { buildPeriod } from "@/lib/period";
import { formatDate, formatNumber } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Medina Stores" },
      { name: "description", content: "Revenue, cost of goods, profit and stock position at a glance." },
      { property: "og:title", content: "Dashboard — Medina Stores" },
      { property: "og:description", content: "Revenue, cost of goods, profit and stock position at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { role } = useMe();
  const period = useMemo(() => buildPeriod("month"), []);
  const sales = useSales(period.from, period.to);
  const expenses = useExpenses(period.from, period.to);
  const products = useProducts();

  const rows = (sales.data ?? []).filter((s: any) => !s.is_voided);
  const revenue = rows.reduce((sum: number, s: any) => sum + Number(s.total_amount ?? 0), 0);
  const cogs = rows.reduce((sum: number, s: any) => sum + Number(s.total_cost ?? 0), 0);
  const opex = (expenses.data ?? []).reduce((sum: number, e: any) => sum + Number(e.amount ?? 0), 0);
  const stockValue = (products.data ?? []).reduce(
    (sum: number, p: any) => sum + Number(p.quantity_on_hand ?? 0) * Number(p.cost_price ?? 0),
    0,
  );
  const lowStock = (products.data ?? []).filter(
    (p: any) => Number(p.quantity_on_hand ?? 0) <= Number(p.reorder_threshold ?? 0),
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle={`This month · ${formatDate(period.from)} – ${formatDate(period.to)}`} />

      <div className="grid gap-px bg-rule sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Revenue" value={revenue} />
        <StatCard label="Cost of goods" value={cogs} />
        <StatCard label="Gross profit" value={revenue - cogs} tone="positive" />
        <StatCard label="Net profit" value={revenue - cogs - opex} tone="positive" />
      </div>

      <div className="grid gap-px bg-rule sm:grid-cols-2">
        <StatCard label="Inventory value" value={stockValue} />
        <StatCard label="Low stock items" value={lowStock} format="number" />
      </div>

      {role !== "family_viewer" ? (
        <Sheet title="Recent sales">
          {rows.length === 0 ? (
            <Empty>No sales recorded in this period.</Empty>
          ) : (
            <table className="ledger">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th className="col-num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 8).map((s: any) => (
                  <tr key={s.id}>
                    <td>{formatDate(s.sale_date)}</td>
                    <td>{s.customer_name || "—"}</td>
                    <td>{s.payment_status}</td>
                    <td className="col-num">
                      <Money value={Number(s.total_amount ?? 0)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Sheet>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {formatNumber(rows.length)} sales recorded this period.
      </p>
    </div>
  );
}
