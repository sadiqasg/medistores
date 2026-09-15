export type PeriodKey = "week" | "month" | "quarter" | "year" | "custom";

export type Period = { key: PeriodKey; from: string; to: string; label: string };

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function buildPeriod(key: PeriodKey, from?: string, to?: string): Period {
  const now = new Date();
  let start: Date;
  let end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let label = "";

  switch (key) {
    case "week": {
      const day = (now.getDay() + 6) % 7;
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
      label = "This week";
      break;
    }
    case "quarter": {
      const q = Math.floor(now.getMonth() / 3) * 3;
      start = new Date(now.getFullYear(), q, 1);
      label = "This quarter";
      break;
    }
    case "year": {
      start = new Date(now.getFullYear(), 0, 1);
      label = "This year";
      break;
    }
    case "custom": {
      return {
        key,
        from: from ?? iso(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: to ?? iso(end),
        label: "Custom range",
      };
    }
    default: {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      label = "This month";
    }
  }
  return { key, from: iso(start), to: iso(end), label };
}

export function previousPeriod(p: Period): { from: string; to: string } {
  const from = new Date(p.from);
  const to = new Date(p.to);
  const span = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);
  const prevTo = new Date(from.getTime() - 86400000);
  const prevFrom = new Date(prevTo.getTime() - (span - 1) * 86400000);
  return { from: iso(prevFrom), to: iso(prevTo) };
}

export function monthKey(date: string) {
  return date.slice(0, 7);
}

export function lastNMonths(n: number) {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-GB", {
    month: "short",
    year: "2-digit",
  });
}
