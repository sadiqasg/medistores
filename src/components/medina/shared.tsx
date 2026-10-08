import { useState, type FormEvent, type ReactNode } from "react";
import { CalendarDays, Download, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildPeriod, type Period, type PeriodKey } from "@/lib/period";
import { useCurrency } from "@/hooks/useMe";

export const today = () => new Date().toISOString().slice(0, 10);

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}{hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}</div>;
}

export function PeriodFilter({ period, onChange }: { period: Period; onChange: (period: Period) => void }) {
  const setKey = (key: PeriodKey) => onChange(buildPeriod(key, period.from, period.to));
  return <div className="flex flex-wrap items-center gap-2">
    <CalendarDays className="h-4 w-4 text-muted-foreground" />
    <Select value={period.key} onValueChange={(v) => setKey(v as PeriodKey)}>
      <SelectTrigger className="w-40 bg-card"><SelectValue /></SelectTrigger>
      <SelectContent>{(["week","month","quarter","year","custom"] as const).map((key) => <SelectItem value={key} key={key}>{key === "custom" ? "Custom range" : `This ${key}`}</SelectItem>)}</SelectContent>
    </Select>
    {period.key === "custom" ? <>
      <Input aria-label="From date" type="date" value={period.from} onChange={(e) => onChange(buildPeriod("custom", e.target.value, period.to))} className="w-auto bg-card" />
      <span className="text-xs text-muted-foreground">to</span>
      <Input aria-label="To date" type="date" value={period.to} onChange={(e) => onChange(buildPeriod("custom", period.from, e.target.value))} className="w-auto bg-card" />
    </> : <span className="num text-xs text-muted-foreground">{period.from} — {period.to}</span>}
  </div>;
}

export function AsyncButton({ busy, children, ...props }: React.ComponentProps<typeof Button> & { busy?: boolean }) {
  return <Button disabled={busy || props.disabled} {...props}>{busy ? <LoaderCircle className="animate-spin" /> : null}{children}</Button>;
}

export function FormError({ message }: { message?: string | null }) {
  return message ? <div role="alert" className="border-l-2 border-primary bg-primary/5 px-3 py-2 text-sm text-primary">{message}</div> : null;
}

export function exportCsv(filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  const csv = [headers, ...rows].map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
  toast.success(`${filename} downloaded`);
}

export function ExportButton({ onClick, label = "Export CSV" }: { onClick: () => void; label?: string }) {
  return <Button variant="outline" onClick={onClick}><Download />{label}</Button>;
}

export function useSubmit(action: () => Promise<void>, onDone?: () => void) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const submit = async (event?: FormEvent) => { event?.preventDefault(); setBusy(true); setError(null); try { await action(); onDone?.(); } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong"); } finally { setBusy(false); } };
  return { busy, error, submit };
}

export function AmountField({
  label,
  value,
  onChange,
  hint,
  placeholder = "0.00",
}: {
  label: string;
  value: string;
  onChange: (raw: string) => void;
  hint?: string;
  placeholder?: string;
}) {
  const currency = useCurrency();
  return (
    <Field label={`${label} (${currency.code})`} hint={hint}>
      <AmountInput value={value} onChange={onChange} placeholder={placeholder} />
    </Field>
  );
}

export function parseFormattedNumber(value: string): number {
  return Number(value.replace(/,/g, "")) || 0;
}

export function formatInputAmount(value: string): string {
  const n = parseFormattedNumber(value);
  if (!n) return "";
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function AmountInput({
  value,
  onChange,
  placeholder = "0.00",
  ...props
}: {
  value: string;
  onChange: (raw: string) => void;
  placeholder?: string;
} & Omit<React.ComponentProps<typeof Input>, "value" | "onChange">) {
  const display = value ? formatInputAmount(value) : "";
  return (
    <Input
      type="text"
      inputMode="decimal"
      value={display}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^0-9.]/g, "");
        onChange(raw);
      }}
      placeholder={placeholder}
      className="num"
      {...props}
    />
  );
}
