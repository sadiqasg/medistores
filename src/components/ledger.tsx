import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatMoney, formatPercent } from "@/lib/money";
import { useCurrency } from "@/hooks/useMe";

export function Sheet({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("sheet", className)}>
      {(title || action) && (
        <header className="sheet-head flex items-center justify-between gap-3">
          <span>{title}</span>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Money({
  value,
  tone = "default",
  decimals = 2,
  className,
}: {
  value: number | string | null | undefined;
  tone?: "default" | "positive" | "negative" | "auto" | "muted";
  decimals?: number;
  className?: string;
}) {
  const currency = useCurrency();
  const n = Number(value ?? 0);
  const resolved = tone === "auto" ? (n < 0 ? "negative" : n > 0 ? "positive" : "muted") : tone;
  return (
    <span
      className={cn(
        "num",
        resolved === "positive" && "text-positive",
        resolved === "negative" && "text-primary",
        resolved === "muted" && "text-muted-foreground",
        className,
      )}
    >
      {formatMoney(n, currency, { decimals })}
    </span>
  );
}

export function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "positive" | "warning" | "primary";
}) {
  return (
    <div
      className={cn(
        "sheet px-4 py-3.5 border-l-2",
        tone === "positive" && "border-l-positive",
        tone === "warning" && "border-l-warning",
        tone === "primary" && "border-l-primary",
        !tone && "border-l-ink",
      )}
    >
      <div className="stat-label">{label}</div>
      <div className="num mt-1.5 text-xl font-medium">{value}</div>
      {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

export function Delta({ current, previous }: { current: number; previous: number }) {
  if (!previous) return <span className="num text-muted-foreground text-xs">—</span>;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  return (
    <span className={cn("num text-xs", pct >= 0 ? "text-positive" : "text-primary")}>
      {formatPercent(pct)}
    </span>
  );
}

export function Tag({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "positive" | "warning" | "danger" | "steel";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 text-[0.68rem] font-medium uppercase tracking-wider border",
        tone === "neutral" && "border-border text-muted-foreground",
        tone === "positive" && "border-positive text-positive",
        tone === "warning" && "border-warning text-warning",
        tone === "danger" && "border-primary text-primary",
        tone === "steel" && "border-steel text-steel",
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-ink pb-3">
      <div>
        <h1 className="font-serif text-2xl font-semibold">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-muted-foreground">{children}</div>;
}
