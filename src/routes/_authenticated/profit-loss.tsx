import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Minus, ChevronDown, ChevronRight } from "lucide-react";
import { useMe } from "@/hooks/useMe";
import { useCurrency } from "@/hooks/useMe";
import { useSales, useExpenses, useRebates } from "@/hooks/useMedinaData";
import { PageHeader, Sheet, Empty, Money, Tag } from "@/components/ledger";
import { PeriodFilter, exportCsv, ExportButton } from "@/components/medina/shared";
import { buildPeriod, previousPeriod, type Period } from "@/lib/period";
import { formatDate, formatNumber, formatPercent } from "@/lib/money";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/profit-loss")({
  head: () => ({
    meta: [
      { title: "Profit & Loss — Medina Stores" },
      { name: "description", content: "Financial health dashboard: revenue, COGS, rebates, expenses and net profit." },
      { property: "og:title", content: "Profit & Loss — Medina Stores" },
      { property: "og:description", content: "Financial health dashboard: revenue, COGS, rebates, expenses and net profit." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfitLossPage,
});

type SectionRow = {
  label: string;
  amount: number;
  kind: "positive" | "negative" | "neutral" | "subtotal" | "total";
  indent?: boolean;
};

function ProfitLossPage() {
  const me = useMe();
  const role = me.data?.role;
  const [period, setPeriod] = useState<Period>(() => buildPeriod("month"));

  const currency = useCurrency();
  const sales = useSales(period.from, period.to);
  const expenses = useExpenses(period.from, period.to);
  const rebates = useRebates(period.from, period.to);

  // Previous period for comparison
  const prev = useMemo(() => previousPeriod(period), [period]);
  const prevSales = useSales(prev.from, prev.to);
  const prevExpenses = useExpenses(prev.from, prev.to);
  const prevRebates = useRebates(prev.from, prev.to);

  const loading = sales.isLoading || expenses.isLoading || rebates.isLoading;

  // Current period calculations
  const calc = useMemo(() => {
    const saleRows = (sales.data ?? []).filter((s: any) => !s.is_voided);
    const revenue = saleRows.reduce((sum: number, s: any) => sum + Number(s.total_amount ?? 0), 0);
    const cogs = saleRows.reduce((sum: number, s: any) => sum + Number(s.total_cost ?? 0), 0);

    const rebateRows = rebates.data ?? [];
    const rebateTotal = rebateRows
      .filter((r: any) => r.status === "received")
      .reduce((sum: number, r: any) => sum + Number(r.amount ?? 0), 0);
    const rebatePending = rebateRows
      .filter((r: any) => r.status === "pending")
      .reduce((sum: number, r: any) => sum + Number(r.amount ?? 0), 0);

    const expenseRows = expenses.data ?? [];
    const totalOpex = expenseRows.reduce((sum: number, e: any) => sum + Number(e.amount ?? 0), 0);

    // Group expenses by category
    const expenseByCategory = new Map<string, number>();
    for (const e of expenseRows) {
      const cat = e.category ?? "Other";
      expenseByCategory.set(cat, (expenseByCategory.get(cat) ?? 0) + Number(e.amount ?? 0));
    }
    const expenseCategories = Array.from(expenseByCategory.entries()).sort((a, b) => b[1] - a[1]);

    const grossProfit = revenue - cogs;
    const adjustedGrossProfit = grossProfit + rebateTotal;
    const netProfit = adjustedGrossProfit - totalOpex;

    return {
      revenue, cogs, grossProfit, rebateTotal, rebatePending,
      totalOpex, netProfit, expenseCategories,
      salesCount: saleRows.length, expenseCount: expenseRows.length, rebateCount: rebateRows.length,
    };
  }, [sales.data, expenses.data, rebates.data]);

  // Previous period for delta comparison
  const prevCalc = useMemo(() => {
    const saleRows = (prevSales.data ?? []).filter((s: any) => !s.is_voided);
    const revenue = saleRows.reduce((sum: number, s: any) => sum + Number(s.total_amount ?? 0), 0);
    const cogs = saleRows.reduce((sum: number, s: any) => sum + Number(s.total_cost ?? 0), 0);
    const rebateTotal = (prevRebates.data ?? [])
      .filter((r: any) => r.status === "received")
      .reduce((sum: number, r: any) => sum + Number(r.amount ?? 0), 0);
    const totalOpex = (prevExpenses.data ?? []).reduce((sum: number, e: any) => sum + Number(e.amount ?? 0), 0);
    return {
      revenue, cogs,
      grossProfit: revenue - cogs,
      adjustedGrossProfit: revenue - cogs + rebateTotal,
      totalOpex,
      netProfit: revenue - cogs + rebateTotal - totalOpex,
    };
  }, [prevSales.data, prevExpenses.data, prevRebates.data]);

  // Collapsible sections
  const [expandRevenue, setExpandRevenue] = useState(true);
  const [expandExpenses, setExpandExpenses] = useState(true);

  // P&L rows for the statement
  const revenueRows: SectionRow[] = [
    { label: "Gross sales revenue", amount: calc.revenue, kind: "positive" },
    { label: "Cost of goods sold (COGS)", amount: -calc.cogs, kind: "negative" },
    { label: "Gross profit", amount: calc.grossProfit, kind: "subtotal" },
    { label: "Coca-Cola rebates received", amount: calc.rebateTotal, kind: "positive", indent: true },
    { label: "Rebates pending", amount: calc.rebatePending, kind: "neutral", indent: true },
    { label: "Adjusted gross profit", amount: calc.adjustedGrossProfit, kind: "subtotal" },
  ];

  const expenseRows: SectionRow[] = [
    ...calc.expenseCategories.map(([cat, amt]): SectionRow => ({
      label: cat, amount: -amt, kind: "negative", indent: true,
    })),
    { label: "Total operating expenses", amount: -calc.totalOpex, kind: "subtotal" },
  ];

  const handleExport = () => {
    const rows: Array<Array<string | number | null>> = [];
    rows.push(["REVENUE", "", ""]);
    rows.push(["Gross sales revenue", "", calc.revenue]);
    rows.push(["Cost of goods sold (COGS)", "", -calc.cogs]);
    rows.push(["Gross profit", "", calc.grossProfit]);
    rows.push(["Coca-Cola rebates received", "", calc.rebateTotal]);
    rows.push(["Adjusted gross profit", "", calc.adjustedGrossProfit]);
    rows.push(["", "", ""]);
    rows.push(["OPERATING EXPENSES", "", ""]);
    for (const [cat, amt] of calc.expenseCategories) {
      rows.push([cat, "", -amt]);
    }
    rows.push(["Total operating expenses", "", -calc.totalOpex]);
    rows.push(["", "", ""]);
    rows.push(["NET PROFIT", "", calc.netProfit]);
    exportCsv("profit-loss-report.csv", ["Section", "", "Amount"], rows);
  };

  const canView = role === "admin" || role === "staff";

  if (!canView) {
    return (
      <div className="space-y-6">
        <PageHeader title="Profit & Loss" description="Restricted to admin and staff" />
        <Empty>You do not have access to view financial reports.</Empty>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profit & Loss"
        description={`${period.label} · ${formatDate(period.from)} – ${formatDate(period.to)}`}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <ExportButton onClick={handleExport} label="Export report" />
            <PeriodFilter period={period} onChange={setPeriod} />
          </div>
        }
      />

      {/* Headline KPI cards */}
      <div className={cn("grid gap-px bg-rule transition-all duration-300 ease-in-out sm:grid-cols-2 xl:grid-cols-4", loading && "opacity-60")}>
        <HeadlineCard
          label="Gross revenue"
          value={calc.revenue}
          delta={calc.revenue - prevCalc.revenue}
          icon="up"
        />
        <HeadlineCard
          label="Adjusted gross profit"
          value={calc.adjustedGrossProfit}
          delta={calc.adjustedGrossProfit - prevCalc.adjustedGrossProfit}
          icon={calc.adjustedGrossProfit >= 0 ? "up" : "down"}
        />
        <HeadlineCard
          label="Total expenses"
          value={calc.totalOpex}
          delta={calc.totalOpex - prevCalc.totalOpex}
          icon="down"
        />
        <HeadlineCard
          label="Net profit"
          value={calc.netProfit}
          delta={calc.netProfit - prevCalc.netProfit}
          icon={calc.netProfit >= 0 ? "up" : "down"}
          emphasize
        />
      </div>

      {/* P&L Statement */}
      <div className={cn("transition-all duration-300 ease-in-out", loading && "opacity-60")}>
        <Sheet title="Statement of profit & loss">
          {/* Revenue section */}
          <div className="border-b border-rule">
            <SectionHeader
              label="Revenue"
              expanded={expandRevenue}
              onToggle={() => setExpandRevenue((v) => !v)}
            />
            <div className={cn("overflow-hidden transition-all duration-300 ease-in-out", expandRevenue ? "max-h-[2000px]" : "max-h-0")}>
              <table className="ledger">
                <tbody>
                  {revenueRows.map((row, i) => (
                    <PnlRow key={i} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Operating expenses section */}
          <div className="border-b border-rule">
            <SectionHeader
              label="Operating expenses"
              expanded={expandExpenses}
              onToggle={() => setExpandExpenses((v) => !v)}
            />
            <div className={cn("overflow-hidden transition-all duration-300 ease-in-out", expandExpenses ? "max-h-[2000px]" : "max-h-0")}>
              {expenseRows.length > 1 ? (
                <table className="ledger">
                  <tbody>
                    {expenseRows.map((row, i) => (
                      <PnlRow key={i} row={row} />
                    ))}
                  </tbody>
                </table>
              ) : (
                <Empty>No operating expenses recorded in this period.</Empty>
              )}
            </div>
          </div>

          {/* Net profit final row */}
          <div className="bg-ink/[0.03]">
            <table className="ledger">
              <tbody>
                <tr className="transition-colors duration-200 ease-in-out">
                  <td className="py-4 font-serif text-base font-semibold">Net profit</td>
                  <td className="col-num py-4">
                    <span
                      className={cn(
                        "num font-mono text-lg font-semibold tracking-tight tabular-nums",
                        calc.netProfit >= 0 ? "text-positive" : "text-primary",
                      )}
                    >
                      {formatMoneySigned(calc.netProfit, currency)}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Sheet>
      </div>

      {/* Summary breakdown */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Sheet title="Revenue breakdown">
          <table className="ledger">
            <tbody>
              <tr className="transition-colors duration-200 ease-in-out">
                <td>Sales transactions</td>
                <td className="col-num">{formatNumber(calc.salesCount)}</td>
                <td className="col-num"><Money value={calc.revenue} /></td>
              </tr>
              <tr className="transition-colors duration-200 ease-in-out">
                <td>Cost of goods sold</td>
                <td className="col-num text-muted-foreground">({formatNumber(calc.salesCount)})</td>
                <td className="col-num"><Money value={calc.cogs} tone="negative" /></td>
              </tr>
              <tr className="transition-colors duration-200 ease-in-out">
                <td className="font-medium">Gross profit</td>
                <td className="col-num text-muted-foreground">{formatPercent(calc.revenue > 0 ? (calc.grossProfit / calc.revenue) * 100 : 0)} margin</td>
                <td className="col-num"><Money value={calc.grossProfit} tone="auto" /></td>
              </tr>
              <tr className="transition-colors duration-200 ease-in-out">
                <td>Coca-Cola rebates</td>
                <td className="col-num">{formatNumber(calc.rebateCount)}</td>
                <td className="col-num"><Money value={calc.rebateTotal} tone="positive" /></td>
              </tr>
              <tr className="transition-colors duration-200 ease-in-out">
                <td className="font-medium">Adjusted gross profit</td>
                <td className="col-num text-muted-foreground">{formatPercent(calc.revenue > 0 ? (calc.adjustedGrossProfit / calc.revenue) * 100 : 0)} margin</td>
                <td className="col-num"><Money value={calc.adjustedGrossProfit} tone="auto" /></td>
              </tr>
            </tbody>
          </table>
        </Sheet>

        <Sheet title="Expense breakdown">
          {calc.expenseCategories.length === 0 ? (
            <Empty>No expenses in this period.</Empty>
          ) : (
            <table className="ledger">
              <tbody>
                {calc.expenseCategories.map(([cat, amt]) => {
                  const pct = calc.totalOpex > 0 ? (amt / calc.totalOpex) * 100 : 0;
                  return (
                    <tr key={cat} className="transition-colors duration-200 ease-in-out">
                      <td>
                        <Tag tone="neutral">{cat}</Tag>
                      </td>
                      <td className="col-num text-muted-foreground">{formatPercent(pct)}</td>
                      <td className="col-num"><Money value={amt} tone="negative" /></td>
                    </tr>
                  );
                })}
                <tr className="transition-colors duration-200 ease-in-out">
                  <td className="font-medium">Total</td>
                  <td className="col-num text-muted-foreground">100%</td>
                  <td className="col-num"><Money value={calc.totalOpex} tone="negative" /></td>
                </tr>
              </tbody>
            </table>
          )}
        </Sheet>
      </div>

      <p className="text-xs text-muted-foreground">
        Figures reflect {formatNumber(calc.salesCount)} sales, {formatNumber(calc.expenseCount)} expenses and {formatNumber(calc.rebateCount)} rebates for {period.label.toLowerCase()}.
      </p>
    </div>
  );
}

function formatMoneySigned(value: number, currency: { code: string; symbol: string } = { code: "NGN", symbol: "₦" }): string {
  if (!isFinite(value)) return `${currency.symbol}0.00`;
  const abs = Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${value < 0 ? "-" : ""}${currency.symbol}${abs}`;
}

function HeadlineCard({
  label,
  value,
  delta,
  icon,
  emphasize,
}: {
  label: string;
  value: number;
  delta: number;
  icon: "up" | "down";
  emphasize?: boolean;
}) {
  const currency = useCurrency();
  const Icon = icon === "up" ? TrendingUp : TrendingDown;
  const deltaPositive = delta >= 0;
  return (
    <div
      className={cn(
        "sheet px-4 py-3.5 border-l-2 transition-all duration-200 ease-in-out",
        emphasize ? (value >= 0 ? "border-l-positive" : "border-l-primary") : "border-l-ink",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="stat-label">{label}</span>
        <Icon
          className={cn(
            "h-3.5 w-3.5 transition-colors duration-200",
            icon === "up" ? "text-positive" : "text-primary",
          )}
        />
      </div>
      <div
        className={cn(
          "num mt-1.5 font-mono text-xl font-medium tracking-tight tabular-nums",
          emphasize && value < 0 && "text-primary",
          emphasize && value > 0 && "text-positive",
        )}
      >
        {formatMoneySigned(value, currency)}
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        {delta !== 0 ? (
          <>
            <span
              className={cn(
                "num text-xs font-mono tabular-nums transition-colors duration-200",
                deltaPositive ? "text-positive" : "text-primary",
              )}
            >
              {deltaPositive ? "+" : ""}{formatMoneySigned(delta, currency).replace(/^-/, "")}
            </span>
            <span className="text-xs text-muted-foreground">vs last period</span>
          </>
        ) : (
          <span className="num text-xs text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );
}

function SectionHeader({
  label,
  expanded,
  onToggle,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors duration-200 ease-in-out hover:bg-ink/[0.02]"
    >
      {expanded ? (
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
      ) : (
        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
      )}
      <span className="font-serif text-sm font-semibold uppercase tracking-wider">{label}</span>
    </button>
  );
}

function PnlRow({ row }: { row: SectionRow }) {
  const currency = useCurrency();
  const isSubtotal = row.kind === "subtotal";
  const isTotal = row.kind === "total";
  return (
    <tr
      className={cn(
        "transition-colors duration-200 ease-in-out",
        isSubtotal && "border-t border-rule bg-ink/[0.02]",
        isTotal && "border-t-2 border-ink bg-ink/[0.04]",
      )}
    >
      <td
        className={cn(
          row.indent && "pl-8",
          isSubtotal && "font-medium",
          isTotal && "font-serif font-semibold",
        )}
      >
        {row.label}
      </td>
      <td className="col-num">
        <span
          className={cn(
            "num font-mono tabular-nums",
            row.kind === "positive" && "text-positive",
            row.kind === "negative" && "text-primary",
            row.kind === "neutral" && "text-muted-foreground",
            isSubtotal && "font-medium",
            isTotal && "font-semibold text-base",
          )}
        >
          {formatMoneySigned(row.amount, currency)}
        </span>
      </td>
    </tr>
  );
}
