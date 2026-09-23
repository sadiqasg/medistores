import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useMe } from "@/hooks/useMe";
import { useSales, useExpenses, useProducts, useSaleItems, useDistributions } from "@/hooks/useMedinaData";
import { PageHeader, StatCard, Sheet, Empty, Money, Delta, Tag } from "@/components/ledger";
import { PeriodFilter } from "@/components/medina/shared";
import { buildPeriod, previousPeriod, lastNMonths, monthKey, monthLabel, type Period } from "@/lib/period";
import { formatDate, formatNumber } from "@/lib/money";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

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

const chartConfig: ChartConfig = {
  revenue: { label: "Revenue", color: "var(--color-chart-1)" },
};

function DashboardPage() {
  const me = useMe();
  const role = me.data?.role;
  const [period, setPeriod] = useState<Period>(() => buildPeriod("month"));

  const sales = useSales(period.from, period.to);
  const expenses = useExpenses(period.from, period.to);
  const products = useProducts();

  // Previous period for deltas
  const prev = useMemo(() => previousPeriod(period), [period]);
  const prevSales = useSales(prev.from, prev.to);
  const prevExpenses = useExpenses(prev.from, prev.to);

  // All sales for the 12-month trend (unfiltered by period)
  const trendSales = useSales();

  // Sale items for top products, distributions for admin feed
  const saleItems = useSaleItems();
  const distributions = useDistributions();

  const rows = (sales.data ?? []).filter((s: any) => !s.is_voided);
  const revenue = rows.reduce((sum: number, s: any) => sum + Number(s.total_amount ?? 0), 0);
  const cogs = rows.reduce((sum: number, s: any) => sum + Number(s.total_cost ?? 0), 0);
  const opex = (expenses.data ?? []).reduce((sum: number, e: any) => sum + Number(e.amount ?? 0), 0);
  const grossProfit = revenue - cogs;
  const netProfit = grossProfit - opex;
  const stockValue = (products.data ?? []).reduce(
    (sum: number, p: any) => sum + Number(p.quantity_on_hand ?? 0) * Number(p.cost_price ?? 0),
    0,
  );
  const lowStock = (products.data ?? []).filter(
    (p: any) => Number(p.quantity_on_hand ?? 0) <= Number(p.reorder_threshold ?? 0),
  ).length;

  // Previous period metrics
  const prevRows = (prevSales.data ?? []).filter((s: any) => !s.is_voided);
  const prevRevenue = prevRows.reduce((sum: number, s: any) => sum + Number(s.total_amount ?? 0), 0);
  const prevCogs = prevRows.reduce((sum: number, s: any) => sum + Number(s.total_cost ?? 0), 0);
  const prevOpex = (prevExpenses.data ?? []).reduce((sum: number, e: any) => sum + Number(e.amount ?? 0), 0);
  const prevGrossProfit = prevRevenue - prevCogs;
  const prevNetProfit = prevGrossProfit - prevOpex;

  // 12-month revenue trend data
  const trendData = useMemo(() => {
    const months = lastNMonths(12);
    const allRows = (trendSales.data ?? []).filter((s: any) => !s.is_voided);
    return months.map((mk) => ({
      month: monthLabel(mk),
      revenue: allRows
        .filter((s: any) => monthKey(s.sale_date) === mk)
        .reduce((sum: number, s: any) => sum + Number(s.total_amount ?? 0), 0),
    }));
  }, [trendSales.data]);

  // Top products by revenue within the selected period
  const topProducts = useMemo(() => {
    const validSaleIds = new Set(rows.map((s: any) => s.id));
    const items = (saleItems.data ?? []).filter((si: any) => validSaleIds.has(si.sale_id));
    const byProduct = new Map<string, { name: string; units: number; revenue: number }>();
    for (const si of items) {
      const name = si.products?.name ?? "Unknown product";
      const existing = byProduct.get(si.product_id) ?? { name, units: 0, revenue: 0 };
      existing.units += Number(si.quantity ?? 0);
      existing.revenue += Number(si.subtotal ?? 0);
      byProduct.set(si.product_id, existing);
    }
    return Array.from(byProduct.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [saleItems.data, rows]);

  // Recent distributions (admin only, last 5)
  const recentDistributions = useMemo(() => {
    return (distributions.data ?? []).slice(0, 5);
  }, [distributions.data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`${period.label} · ${formatDate(period.from)} – ${formatDate(period.to)}`}
        action={<PeriodFilter period={period} onChange={setPeriod} />}
      />

      <div className="grid gap-px bg-rule sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Revenue"
          value={<Money value={revenue} />}
          sub={<Delta current={revenue} previous={prevRevenue} />}
        />
        <StatCard
          label="Cost of goods"
          value={<Money value={cogs} />}
          sub={<Delta current={cogs} previous={prevCogs} />}
        />
        <StatCard
          label="Gross profit"
          value={<Money value={grossProfit} tone="auto" />}
          sub={<Delta current={grossProfit} previous={prevGrossProfit} />}
          tone="positive"
        />
        <StatCard
          label="Net profit"
          value={<Money value={netProfit} tone="auto" />}
          sub={<Delta current={netProfit} previous={prevNetProfit} />}
          tone="positive"
        />
      </div>

      <div className="grid gap-px bg-rule sm:grid-cols-2">
        <StatCard label="Inventory value" value={<Money value={stockValue} />} />
        {lowStock ? (
          <StatCard label="Low stock items" value={formatNumber(lowStock)} tone="warning" />
        ) : (
          <StatCard label="Low stock items" value={formatNumber(lowStock)} />
        )}
      </div>

      {/* 12-month revenue trend */}
      <Sheet title="Revenue trend" >
        {trendSales.isLoading ? (
          <div className="flex h-[280px] items-center justify-center">
            <span className="text-sm text-muted-foreground">Loading chart…</span>
          </div>
        ) : trendData.every((d) => d.revenue === 0) ? (
          <Empty>No sales recorded in the last 12 months.</Empty>
        ) : (
          <div className="px-2 pb-3 pt-4">
            <ChartContainer config={chartConfig} className="h-[280px] w-full">
              <AreaChart data={trendData} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  vertical={false}
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  strokeOpacity={0.5}
                />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  width={70}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)
                  }
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      indicator="dot"
                      labelKey="month"
                      formatter={(value) => (
                        <span className="font-mono font-medium tabular-nums text-foreground">
                          {Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      )}
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--color-chart-1)"
                  strokeWidth={2}
                  fill="url(#fillRevenue)"
                  dot={{ r: 3, fill: "var(--color-chart-1)", strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: "var(--color-chart-1)", strokeWidth: 2, stroke: "var(--color-background)" }}
                />
              </AreaChart>
            </ChartContainer>
          </div>
        )}
      </Sheet>

      {role !== "family_viewer" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Recent sales */}
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
                    <tr key={s.id} className="transition-colors duration-200 ease-in-out">
                      <td>{formatDate(s.sale_date)}</td>
                      <td>{s.customer_name || "—"}</td>
                      <td>
                        <Tag
                          tone={
                            s.payment_status === "paid"
                              ? "positive"
                              : s.payment_status === "partial"
                                ? "warning"
                                : "danger"
                          }
                        >
                          {s.payment_status}
                        </Tag>
                      </td>
                      <td className="col-num">
                        <Money value={Number(s.total_amount ?? 0)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Sheet>

          {/* Top products by revenue */}
          <Sheet title="Top products">
            {topProducts.length === 0 ? (
              <Empty>No product sales in this period.</Empty>
            ) : (
              <table className="ledger">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="col-num">Units</th>
                    <th className="col-num">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((p, i) => (
                    <tr key={i} className="transition-colors duration-200 ease-in-out">
                      <td>{p.name}</td>
                      <td className="col-num">{formatNumber(p.units)}</td>
                      <td className="col-num">
                        <Money value={p.revenue} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Sheet>
        </div>
      ) : null}

      {/* Admin-only recent distributions */}
      {role === "admin" ? (
        <Sheet title="Recent distributions">
          {recentDistributions.length === 0 ? (
            <Empty>No profit distributions recorded yet.</Empty>
          ) : (
            <table className="ledger">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Stakeholder</th>
                  <th>Status</th>
                  <th className="col-num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {recentDistributions.map((d: any) => (
                  <tr key={d.id} className="transition-colors duration-200 ease-in-out">
                    <td>{formatDate(d.date)}</td>
                    <td>{d.ownership_shares?.stakeholder_name ?? "—"}</td>
                    <td>
                      <Tag
                        tone={
                          d.status === "confirmed"
                            ? "positive"
                            : d.status === "sent"
                              ? "steel"
                              : "warning"
                        }
                      >
                        <span className="transition-opacity duration-200 ease-in-out">
                          {d.status}
                        </span>
                      </Tag>
                    </td>
                    <td className="col-num">
                      <Money value={Number(d.amount ?? 0)} tone="auto" />
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
