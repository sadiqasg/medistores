export type Currency = { code: string; symbol: string };

export const DEFAULT_CURRENCY: Currency = { code: "NGN", symbol: "₦" };

export function formatMoney(
  value: number | string | null | undefined,
  currency: Currency = DEFAULT_CURRENCY,
  opts: { decimals?: number; sign?: boolean } = {},
) {
  const n = Number(value ?? 0);
  const decimals = opts.decimals ?? 2;
  const abs = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const prefix = n < 0 ? "-" : opts.sign && n > 0 ? "+" : "";
  return `${prefix}${currency.symbol}${abs}`;
}

export function formatNumber(value: number | string | null | undefined, decimals = 0) {
  return Number(value ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatPercent(value: number | null | undefined, decimals = 1) {
  if (value === null || value === undefined || !isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}%`;
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
