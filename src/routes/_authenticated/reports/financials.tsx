import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Wallet, Banknote } from "lucide-react";
import { useMe, useSettings } from "@/hooks/useMe";
import { useSales, useExpenses, useRebates, useDistributions } from "@/hooks/useMedinaData";
import { PageHeader, Sheet, Empty, Money, Tag, StatCard } from "@/components/ledger";
import { formatMoney, formatNumber, formatPercent } from "@/lib/money";
import { monthKey, monthLabel } from "@/lib/period";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/hooks/useMe";

export const Route = createFileRoute("/_authenticated/reports/financials")({
  head: () => ({
    meta: [
      { title: "Financial Statements — Medina Stores" },
      { name: "description", content: "Balance sheet, multi-period P&L breakdown and revenue cash realization tracker." },
      { property: "og:title", content: "Financial Statements — Medina Stores" },
      { property: "og:description", content: "Balance sheet, multi-period P&L breakdown and revenue cash realization tracker." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FinancialsPage,
});

type Tab = "balance" | "pnl" | "realization";

function FinancialsPage() {
  const me = useMe();
  const role = me.data?.role;
  const [tab, setTab] = useState<Tab>("balance");

  const canView = role === "admin" || role === "staff";

  // All-time data for balance sheet
  const allSales = useSales();
  const allExpenses = useExpenses();
  const allRebates = useRebates();
  const allDistributions = useDistributions();
  const settings = useSettings();

  if (!canView) {
    return (
      <div className="space-y-6">
        <PageHeader title="Financial Statements" description="Restricted to admin and staff" />
        <Empty>You do not have access to view financial reports.</Empty>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial Statements"
        description="Balance sheet, profit & loss breakdown and cash realization"
      />

      {/* Tab switcher */}
      <div className="flex items-center gap-1 border-b border-rule">
        <TabButton active={tab === "balance"} onClick={() => setTab("balance")}>Balance Sheet</TabButton>
        <TabButton active={tab === "pnl"} onClick={() => setTab("pnl")}>P&L Breakdown</TabButton>
        <TabButton active={tab === "realization"} onClick={() => setTab("realization")}>Cash Realization</TabButton>
      </div>

      {tab === "balance" && (
        <BalanceSheet
          sales={allSales.data}
          expenses={allExpenses.data}
          rebates={allRebates.data}
          distributions={allDistributions.data}
          settings={settings.data}
        />
      )}
      {tab === "pnl" && (
        <PnlBreakdown
          sales={allSales.data}
          expenses={allExpenses.data}
          rebates={allRebates.data}
        />
      )}
      {tab === "realization" && <RealizationTracker sales={allSales.data} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab button
// ---------------------------------------------------------------------------
function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-4 py-2 text-sm font-medium border-b-2 transition-colors duration-200 ease-in-out",
        active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// 1. Balance Sheet
// ---------------------------------------------------------------------------
function BalanceSheet({ sales, expenses, rebates, distributions, settings }: any) {
  const currency = useCurrency();
  const openingCashAtHand = Number(settings?.opening_cash_at_hand ?? 0);
  const openingCashInBank = Number(settings?.opening_cash_in_bank ?? 0);

  const calc = useMemo(() => {
    const saleRows = (sales ?? []).filter((s: any) => !s.is_voided);
    const totalSalesReceived = saleRows.reduce((sum: number, s: any) => sum + Number(s.amount_paid ?? 0), 0);
    const totalSalesInvoiced = saleRows.reduce((sum: number, s: any) => sum + Number(s.total_amount ?? 0), 0);
    const outstandingReceivables = totalSalesInvoiced - totalSalesReceived;

    const rebateRows = rebates ?? [];
    const rebatesReceived = rebateRows
      .filter((r: any) => r.status === "received")
      .reduce((sum: number, r: any) => sum + Number(r.amount ?? 0), 0);

    const totalExpenses = (expenses ?? []).reduce((sum: number, e: any) => sum + Number(e.amount ?? 0), 0);

    const distRows = distributions ?? [];
    const totalDisbursed = distRows
      .filter((d: any) => d.distribution_type === "withdrawal")
      .reduce((sum: number, d: any) => sum + Number(d.amount ?? 0), 0);

    const totalCashInflow = totalSalesReceived + rebatesReceived;
    const totalCashOutflow = totalExpenses + totalDisbursed;
    const netCashPosition = totalCashInflow - totalCashOutflow;

    // Use opening balances from settings + net cash position
    const cashAtHand = openingCashAtHand + netCashPosition;
    const cashInBank = openingCashInBank;

    const inventoryValue = 0; // placeholder — would come from products table

    const totalAssets = cashAtHand + cashInBank + outstandingReceivables + inventoryValue;
    const totalLiabilities = 0; // no liabilities tracked yet
    const netEquity = totalAssets - totalLiabilities;

    return {
      totalSalesReceived, totalSalesInvoiced, outstandingReceivables,
      rebatesReceived, totalExpenses, totalDisbursed,
      totalCashInflow, totalCashOutflow, netCashPosition,
      cashAtHand, cashInBank, inventoryValue,
      totalAssets, totalLiabilities, netEquity,
    };
  }, [sales, expenses, rebates, distributions, openingCashAtHand, openingCashInBank]);

  return (
    <div className="space-y-6">
      {/* Cash position KPIs */}
      <div className="grid gap-px bg-rule sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total cash position"
          value={<Money value={calc.netCashPosition} tone="auto" />}
          tone={calc.netCashPosition >= 0 ? "positive" : "primary"}
        />
        <div className="sheet px-4 py-3.5 border-l-2 border-l-ink">
          <div className="flex items-center gap-2">
            <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="stat-label">Cash at hand</span>
          </div>
          <div className="num mt-1.5 font-mono text-xl font-medium tabular-nums">
            {formatMoney(calc.cashAtHand, currency)}
          </div>
        </div>
        <div className="sheet px-4 py-3.5 border-l-2 border-l-ink">
          <div className="flex items-center gap-2">
            <Banknote className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="stat-label">Cash in bank</span>
          </div>
          <div className="num mt-1.5 font-mono text-xl font-medium tabular-nums">
            {formatMoney(calc.cashInBank, currency)}
          </div>
        </div>
        <StatCard
          label="Outstanding receivables"
          value={<Money value={calc.outstandingReceivables} />}
          tone={calc.outstandingReceivables > 0 ? "warning" : undefined}
        />
      </div>

      {/* Cash flow calculation */}
      <Sheet title="Cash position calculation">
        <table className="ledger">
          <thead>
            <tr>
              <th>Cash inflows</th>
              <th className="col-num">Amount</th>
            </tr>
          </thead>
          <tbody>
            <PnlRow label="Sales cash received (amount_paid)" amount={calc.totalSalesReceived} kind="positive" />
            <PnlRow label="Coca-Cola rebates received" amount={calc.rebatesReceived} kind="positive" />
            <tr className="border-t border-rule bg-ink/[0.02] transition-colors duration-200 ease-in-out">
              <td className="font-medium">Total cash inflows</td>
              <td className="col-num"><Money value={calc.totalCashInflow} tone="positive" /></td>
            </tr>
          </tbody>
        </table>
        <div className="border-t border-rule" />
        <table className="ledger">
          <thead>
            <tr>
              <th>Cash outflows</th>
              <th className="col-num">Amount</th>
            </tr>
          </thead>
          <tbody>
            <PnlRow label="Operating expenses paid" amount={-calc.totalExpenses} kind="negative" />
            <PnlRow label="Shareholder payouts disbursed" amount={-calc.totalDisbursed} kind="negative" />
            <tr className="border-t border-rule bg-ink/[0.02] transition-colors duration-200 ease-in-out">
              <td className="font-medium">Total cash outflows</td>
              <td className="col-num"><Money value={calc.totalCashOutflow} tone="negative" /></td>
            </tr>
          </tbody>
        </table>
        <div className="border-t-2 border-ink bg-ink/[0.04]">
          <table className="ledger">
            <tbody>
              <tr className="transition-colors duration-200 ease-in-out">
                <td className="py-3.5 font-serif text-base font-semibold">Net cash position</td>
                <td className="col-num py-3.5">
                  <span
                    className={cn(
                      "num font-mono text-lg font-semibold tabular-nums",
                      calc.netCashPosition >= 0 ? "text-positive" : "text-primary",
                    )}
                  >
                    {formatMoney(calc.netCashPosition, currency)}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Sheet>

      {/* Assets vs Liabilities */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Sheet title="Assets">
          <table className="ledger">
            <thead>
              <tr>
                <th>Line item</th>
                <th className="col-num">Amount</th>
              </tr>
            </thead>
            <tbody>
              <PnlRow label="Cash at hand" amount={calc.cashAtHand} kind="positive" />
              <PnlRow label="Cash in bank" amount={calc.cashInBank} kind="positive" />
              <PnlRow label="Outstanding receivables" amount={calc.outstandingReceivables} kind="neutral" />
              <PnlRow label="Inventory at cost" amount={calc.inventoryValue} kind="neutral" />
              <tr className="border-t-2 border-ink bg-ink/[0.04] transition-colors duration-200 ease-in-out">
                <td className="font-serif font-semibold">Total assets</td>
                <td className="col-num font-mono tabular-nums font-semibold">
                  {formatMoney(calc.totalAssets, currency)}
                </td>
              </tr>
            </tbody>
          </table>
        </Sheet>

        <Sheet title="Liabilities & equity">
          <table className="ledger">
            <thead>
              <tr>
                <th>Line item</th>
                <th className="col-num">Amount</th>
              </tr>
            </thead>
            <tbody>
              <PnlRow label="Accounts payable" amount={0} kind="neutral" />
              <PnlRow label="Shareholder capital accounts" amount={0} kind="neutral" />
              <tr className="border-t border-rule bg-ink/[0.02] transition-colors duration-200 ease-in-out">
                <td className="font-medium">Total liabilities</td>
                <td className="col-num"><Money value={calc.totalLiabilities} /></td>
              </tr>
              <tr className="border-t-2 border-ink bg-ink/[0.04] transition-colors duration-200 ease-in-out">
                <td className="font-serif font-semibold">Net equity (Assets - Liabilities)</td>
                <td className="col-num font-mono tabular-nums font-semibold">
                  <span className={calc.netEquity >= 0 ? "text-positive" : "text-primary"}>
                    {formatMoney(calc.netEquity, currency)}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </Sheet>
      </div>

      <p className="text-xs text-muted-foreground">
        Cash position = Opening balances + (Received sales + Received rebates) - (Expenses + Shareholder payouts).
        Set your opening cash at hand and cash in bank in Settings to get accurate figures.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Multi-Period P&L Breakdown
// ---------------------------------------------------------------------------
function PnlBreakdown({ sales, expenses, rebates }: any) {
  const currency = useCurrency();

  // Build period boundaries
  const now = new Date();
  const todayStart = now.toISOString().slice(0, 10);
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const yearStart = `${now.getFullYear()}-01-01`;

  const calcForRange = (from: string, to: string) => {
    const saleRows = (sales ?? []).filter((s: any) => !s.is_voided && s.sale_date >= from && s.sale_date <= to);
    const revenue = saleRows.reduce((sum: number, s: any) => sum + Number(s.total_amount ?? 0), 0);
    const cogs = saleRows.reduce((sum: number, s: any) => sum + Number(s.total_cost ?? 0), 0);
    const expRows = (expenses ?? []).filter((e: any) => e.date >= from && e.date <= to);
    const totalExp = expRows.reduce((sum: number, e: any) => sum + Number(e.amount ?? 0), 0);
    const rebRows = (rebates ?? []).filter((r: any) => r.rebate_month >= from && r.rebate_month <= to);
    const rebReceived = rebRows
      .filter((r: any) => r.status === "received")
      .reduce((sum: number, r: any) => sum + Number(r.amount ?? 0), 0);
    const netProfit = revenue - cogs + rebReceived - totalExp;
    return { revenue, cogs, totalExp, rebReceived, netProfit };
  };

  const todayCalc = calcForRange(todayStart, todayStart);
  const monthCalc = calcForRange(monthStart, todayStart);
  const yearCalc = calcForRange(yearStart, todayStart);

  // Previous years
  const prevYears = useMemo(() => {
    const years = new Set<number>();
    for (const s of (sales ?? [])) {
      if (s.sale_date) years.add(Number(s.sale_date.slice(0, 4)));
    }
    for (const e of (expenses ?? [])) {
      if (e.date) years.add(Number(e.date.slice(0, 4)));
    }
    const currentYear = now.getFullYear();
    return Array.from(years).filter((y) => y < currentYear).sort((a, b) => b - a);
  }, [sales, expenses]);

  const prevYearCalcs = prevYears.map((year) => {
    const yStart = `${year}-01-01`;
    const yEnd = `${year}-12-31`;
    return { year, ...calcForRange(yStart, yEnd) };
  });

  // Monthly summary (last 12 months)
  const monthlySummary = useMemo(() => {
    const map = new Map<string, { revenue: number; cogs: number; expenses: number; rebates: number }>();
    for (const s of (sales ?? [])) {
      if (s.is_voided) continue;
      const mk = monthKey(s.sale_date);
      const entry = map.get(mk) ?? { revenue: 0, cogs: 0, expenses: 0, rebates: 0 };
      entry.revenue += Number(s.total_amount ?? 0);
      entry.cogs += Number(s.total_cost ?? 0);
      map.set(mk, entry);
    }
    for (const e of (expenses ?? [])) {
      const mk = monthKey(e.date);
      const entry = map.get(mk) ?? { revenue: 0, cogs: 0, expenses: 0, rebates: 0 };
      entry.expenses += Number(e.amount ?? 0);
      map.set(mk, entry);
    }
    for (const r of (rebates ?? [])) {
      if (r.status !== "received") continue;
      const mk = monthKey(r.rebate_month);
      const entry = map.get(mk) ?? { revenue: 0, cogs: 0, expenses: 0, rebates: 0 };
      entry.rebates += Number(r.amount ?? 0);
      map.set(mk, entry);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 12)
      .map(([mk, data]) => ({
        monthKey: mk,
        label: monthLabel(mk),
        ...data,
        netProfit: data.revenue - data.cogs + data.rebates - data.expenses,
      }));
  }, [sales, expenses, rebates]);

  // Yearly summary
  const yearlySummary = useMemo(() => {
    const map = new Map<number, { revenue: number; cogs: number; expenses: number; rebates: number }>();
    for (const s of (sales ?? [])) {
      if (s.is_voided) continue;
      const y = Number(s.sale_date?.slice(0, 4) ?? 0);
      if (!y) continue;
      const entry = map.get(y) ?? { revenue: 0, cogs: 0, expenses: 0, rebates: 0 };
      entry.revenue += Number(s.total_amount ?? 0);
      entry.cogs += Number(s.total_cost ?? 0);
      map.set(y, entry);
    }
    for (const e of (expenses ?? [])) {
      const y = Number(e.date?.slice(0, 4) ?? 0);
      if (!y) continue;
      const entry = map.get(y) ?? { revenue: 0, cogs: 0, expenses: 0, rebates: 0 };
      entry.expenses += Number(e.amount ?? 0);
      map.set(y, entry);
    }
    for (const r of (rebates ?? [])) {
      if (r.status !== "received") continue;
      const y = Number(r.rebate_month?.slice(0, 4) ?? 0);
      if (!y) continue;
      const entry = map.get(y) ?? { revenue: 0, cogs: 0, expenses: 0, rebates: 0 };
      entry.rebates += Number(r.amount ?? 0);
      map.set(y, entry);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([year, data]) => ({
        year,
        label: String(year),
        ...data,
        netProfit: data.revenue - data.cogs + data.rebates - data.expenses,
      }));
  }, [sales, expenses, rebates]);

  const [summaryView, setSummaryView] = useState<"monthly" | "yearly">("monthly");

  return (
    <div className="space-y-6">
      {/* 4 time horizon cards */}
      <div className="grid gap-px bg-rule sm:grid-cols-2 xl:grid-cols-4">
        <PeriodCard label="Today" calc={todayCalc} currency={currency} />
        <PeriodCard label="This month" calc={monthCalc} currency={currency} />
        <PeriodCard label="This year" calc={yearCalc} currency={currency} />
        <div className="sheet px-4 py-3.5 border-l-2 border-l-ink">
          <span className="stat-label">Previous years</span>
          {prevYearCalcs.length === 0 ? (
            <div className="num mt-1.5 font-mono text-xl font-medium tabular-nums text-muted-foreground">—</div>
          ) : (
            <div className="mt-1.5 space-y-1">
              {prevYearCalcs.map((y) => (
                <div key={y.year} className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{y.year}</span>
                  <span
                    className={cn(
                      "num font-mono text-sm font-medium tabular-nums",
                      y.netProfit >= 0 ? "text-positive" : "text-primary",
                    )}
                  >
                    {formatMoney(y.netProfit, currency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Summary table toggle */}
      <div className="flex items-center gap-1 border-b border-rule">
        <TabButton
          active={summaryView === "monthly"}
          onClick={() => setSummaryView("monthly")}
        >
          Monthly (last 12)
        </TabButton>
        <TabButton
          active={summaryView === "yearly"}
          onClick={() => setSummaryView("yearly")}
        >
          Yearly
        </TabButton>
      </div>

      <Sheet title={summaryView === "monthly" ? "Monthly P&L summary" : "Yearly P&L summary"}>
        {summaryView === "monthly" ? (
          monthlySummary.length === 0 ? (
            <Empty>No sales data recorded yet.</Empty>
          ) : (
            <table className="ledger">
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="col-num">Revenue</th>
                  <th className="col-num">COGS</th>
                  <th className="col-num">Expenses</th>
                  <th className="col-num">Rebates</th>
                  <th className="col-num">Net profit</th>
                </tr>
              </thead>
              <tbody>
                {monthlySummary.map((m) => (
                  <tr key={m.monthKey} className="transition-colors duration-200 ease-in-out">
                    <td className="font-medium">{m.label}</td>
                    <td className="col-num"><Money value={m.revenue} /></td>
                    <td className="col-num"><Money value={m.cogs} tone="negative" /></td>
                    <td className="col-num"><Money value={m.expenses} tone="negative" /></td>
                    <td className="col-num"><Money value={m.rebates} tone="positive" /></td>
                    <td className="col-num">
                      <Money value={m.netProfit} tone="auto" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : yearlySummary.length === 0 ? (
          <Empty>No sales data recorded yet.</Empty>
        ) : (
          <table className="ledger">
            <thead>
              <tr>
                <th>Year</th>
                <th className="col-num">Revenue</th>
                <th className="col-num">COGS</th>
                <th className="col-num">Expenses</th>
                <th className="col-num">Rebates</th>
                <th className="col-num">Net profit</th>
              </tr>
            </thead>
            <tbody>
              {yearlySummary.map((y) => (
                <tr key={y.year} className="transition-colors duration-200 ease-in-out">
                  <td className="font-medium">{y.label}</td>
                  <td className="col-num"><Money value={y.revenue} /></td>
                  <td className="col-num"><Money value={y.cogs} tone="negative" /></td>
                  <td className="col-num"><Money value={y.expenses} tone="negative" /></td>
                  <td className="col-num"><Money value={y.rebates} tone="positive" /></td>
                  <td className="col-num">
                    <Money value={y.netProfit} tone="auto" />
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

function PeriodCard({
  label,
  calc,
  currency,
}: {
  label: string;
  calc: { revenue: number; netProfit: number };
  currency: { code: string; symbol: string };
}) {
  return (
    <div
      className={cn(
        "sheet px-4 py-3.5 border-l-2 transition-all duration-200 ease-in-out",
        calc.netProfit >= 0 ? "border-l-positive" : "border-l-primary",
      )}
    >
      <span className="stat-label">{label}</span>
      <div className="num mt-1.5 font-mono text-xl font-medium tabular-nums">
        {formatMoney(calc.netProfit, currency)}
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        {calc.netProfit >= 0 ? (
          <TrendingUp className="h-3 w-3 text-positive" />
        ) : (
          <TrendingDown className="h-3 w-3 text-primary" />
        )}
        <span className="text-xs text-muted-foreground">
          Rev: {formatMoney(calc.revenue, currency)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Revenue & Cash Realization Tracker
// ---------------------------------------------------------------------------
function RealizationTracker({ sales }: any) {
  const currency = useCurrency();

  // Monthly realization data (last 12 months)
  const monthlyData = useMemo(() => {
    const map = new Map<string, { invoiced: number; received: number }>();
    for (const s of (sales ?? [])) {
      if (s.is_voided) continue;
      const mk = monthKey(s.sale_date);
      const entry = map.get(mk) ?? { invoiced: 0, received: 0 };
      entry.invoiced += Number(s.total_amount ?? 0);
      entry.received += Number(s.amount_paid ?? 0);
      map.set(mk, entry);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([mk, data]) => ({
        monthKey: mk,
        label: monthLabel(mk),
        ...data,
        outstanding: data.invoiced - data.received,
        realizationPct: data.invoiced > 0 ? (data.received / data.invoiced) * 100 : 0,
      }));
  }, [sales]);

  // Yearly realization data
  const yearlyData = useMemo(() => {
    const map = new Map<number, { invoiced: number; received: number }>();
    for (const s of (sales ?? [])) {
      if (s.is_voided) continue;
      const y = Number(s.sale_date?.slice(0, 4) ?? 0);
      if (!y) continue;
      const entry = map.get(y) ?? { invoiced: 0, received: 0 };
      entry.invoiced += Number(s.total_amount ?? 0);
      entry.received += Number(s.amount_paid ?? 0);
      map.set(y, entry);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([year, data]) => ({
        year,
        label: String(year),
        ...data,
        outstanding: data.invoiced - data.received,
        realizationPct: data.invoiced > 0 ? (data.received / data.invoiced) * 100 : 0,
      }));
  }, [sales]);

  // Totals
  const totals = useMemo(() => {
    const saleRows = (sales ?? []).filter((s: any) => !s.is_voided);
    const totalInvoiced = saleRows.reduce((sum: number, s: any) => sum + Number(s.total_amount ?? 0), 0);
    const totalReceived = saleRows.reduce((sum: number, s: any) => sum + Number(s.amount_paid ?? 0), 0);
    const totalOutstanding = totalInvoiced - totalReceived;
    const overallPct = totalInvoiced > 0 ? (totalReceived / totalInvoiced) * 100 : 0;
    return { totalInvoiced, totalReceived, totalOutstanding, overallPct };
  }, [sales]);

  const [view, setView] = useState<"monthly" | "yearly">("yearly");
  const chartData = view === "monthly" ? monthlyData : yearlyData;

  // Find max for bar scaling
  const maxVal = Math.max(...chartData.map((d) => Math.max(d.invoiced, d.received)), 1);

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid gap-px bg-rule sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Gross invoiced (all time)" value={<Money value={totals.totalInvoiced} />} />
        <StatCard label="Cash received (all time)" value={<Money value={totals.totalReceived} />} tone="positive" />
        <StatCard
          label="Outstanding"
          value={<Money value={totals.totalOutstanding} />}
          tone={totals.totalOutstanding > 0 ? "warning" : undefined}
        />
        <div className="sheet px-4 py-3.5 border-l-2 border-l-ink">
          <span className="stat-label">Realization rate</span>
          <div className="num mt-1.5 font-mono text-xl font-medium tabular-nums">
            {formatPercent(totals.overallPct, 1)}
          </div>
          <div className="mt-2 h-1.5 w-full bg-rule">
            <div
              className="h-full bg-positive transition-all duration-500 ease-in-out"
              style={{ width: `${Math.min(totals.overallPct, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-1 border-b border-rule">
        <TabButton active={view === "yearly"} onClick={() => setView("yearly")}>Annual</TabButton>
        <TabButton active={view === "monthly"} onClick={() => setView("monthly")}>Monthly (last 12)</TabButton>
      </div>

      {/* Bar chart */}
      <Sheet title={view === "yearly" ? "Annual revenue vs. cash received" : "Monthly revenue vs. cash received"}>
        {chartData.length === 0 ? (
          <Empty>No sales data recorded yet.</Empty>
        ) : (
          <div className="space-y-3 px-4 py-6">
            {chartData.map((d) => (
              <div key={d.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{d.label}</span>
                  <span className="num font-mono tabular-nums text-muted-foreground">
                    {formatPercent(d.realizationPct, 1)} realized
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Invoiced bar */}
                  <div className="flex-1">
                    <div
                      className="h-6 bg-accent/30 border border-accent/40 transition-all duration-500 ease-in-out"
                      style={{ width: `${(d.invoiced / maxVal) * 100}%` }}
                    >
                      <span className="num inline-block h-full px-2 text-[0.65rem] font-mono tabular-nums leading-6 text-foreground/70">
                        {formatMoney(d.invoiced, currency, { decimals: 0 })}
                      </span>
                    </div>
                  </div>
                  {/* Received bar */}
                  <div className="flex-1">
                    <div
                      className="h-6 bg-positive/30 border border-positive/40 transition-all duration-500 ease-in-out"
                      style={{ width: `${(d.received / maxVal) * 100}%` }}
                    >
                      <span className="num inline-block h-full px-2 text-[0.65rem] font-mono tabular-nums leading-6 text-positive">
                        {formatMoney(d.received, currency, { decimals: 0 })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <div className="flex items-center gap-4 pt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 bg-accent/30 border border-accent/40" />
                Gross invoiced
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 bg-positive/30 border border-positive/40" />
                Cash received
              </span>
            </div>
          </div>
        )}
      </Sheet>

      {/* Detailed table */}
      <Sheet title="Realization breakdown">
        {chartData.length === 0 ? (
          <Empty>No sales data recorded yet.</Empty>
        ) : (
          <table className="ledger">
            <thead>
              <tr>
                <th>{view === "yearly" ? "Year" : "Month"}</th>
                <th className="col-num">Gross invoiced</th>
                <th className="col-num">Cash received</th>
                <th className="col-num">Outstanding</th>
                <th className="col-num">Realization %</th>
              </tr>
            </thead>
            <tbody>
              {chartData.map((d) => (
                <tr key={d.label} className="transition-colors duration-200 ease-in-out">
                  <td className="font-medium">{d.label}</td>
                  <td className="col-num"><Money value={d.invoiced} /></td>
                  <td className="col-num"><Money value={d.received} tone="positive" /></td>
                  <td className="col-num">
                    <Money value={d.outstanding} tone={d.outstanding > 0 ? "warning" : "muted"} />
                  </td>
                  <td className="col-num">
                    <span
                      className={cn(
                        "num font-mono tabular-nums font-medium",
                        d.realizationPct >= 90 ? "text-positive" : d.realizationPct >= 70 ? "text-warning" : "text-primary",
                      )}
                    >
                      {formatPercent(d.realizationPct, 1)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink">
                <td className="font-serif font-semibold">Total</td>
                <td className="col-num"><Money value={totals.totalInvoiced} /></td>
                <td className="col-num"><Money value={totals.totalReceived} tone="positive" /></td>
                <td className="col-num"><Money value={totals.totalOutstanding} tone="warning" /></td>
                <td className="col-num font-mono tabular-nums font-semibold">
                  {formatPercent(totals.overallPct, 1)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </Sheet>

      <p className="text-xs text-muted-foreground">
        Gross invoiced volume uses the total_amount column; cash received uses amount_paid. The gap between them
        represents outstanding receivables from partial payments and credit sales.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared P&L row helper
// ---------------------------------------------------------------------------
function PnlRow({
  label,
  amount,
  kind,
}: {
  label: string;
  amount: number;
  kind: "positive" | "negative" | "neutral";
}) {
  const tone = kind === "positive" ? "positive" : kind === "negative" ? "negative" : "muted";
  return (
    <tr className="transition-colors duration-200 ease-in-out">
      <td>{label}</td>
      <td className="col-num"><Money value={amount} tone={tone} /></td>
    </tr>
  );
}
