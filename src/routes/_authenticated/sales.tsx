import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, Ban } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { useSales, useProducts } from "@/hooks/useMedinaData";
import { PageHeader, Sheet, Empty, Money, Tag } from "@/components/ledger";
import { PeriodFilter, Field, FormError, AsyncButton, useSubmit, today } from "@/components/medina/shared";
import { buildPeriod, type Period } from "@/lib/period";
import { formatDate, formatNumber } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/sales")({
  head: () => ({
    meta: [
      { title: "Sales — Medina Stores" },
      { name: "description", content: "Record sales, track outstanding balances and review transaction history." },
      { property: "og:title", content: "Sales — Medina Stores" },
      { property: "og:description", content: "Record sales, track outstanding balances and review transaction history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SalesPage,
});

const PAGE_SIZE = 15;

type CartItem = {
  product_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  max_stock: number;
};

function SalesPage() {
  const me = useMe();
  const role = me.data?.role;
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<Period>(() => buildPeriod("month"));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const sales = useSales(period.from, period.to);
  const products = useProducts(true);

  // New sale dialog state
  const [open, setOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState("");
  const [saleDate, setSaleDate] = useState(today());
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentStatus, setPaymentStatus] = useState("paid");
  const [amountPaid, setAmountPaid] = useState("");
  const [notes, setNotes] = useState("");
  const [voidTarget, setVoidTarget] = useState<{ id: string; ref: string } | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidBusy, setVoidBusy] = useState(false);

  const allRows = (sales.data ?? []).filter((s: any) => !s.is_voided);

  const filtered = useMemo(() => {
    let rows = allRows;
    if (statusFilter !== "all") {
      rows = rows.filter((s: any) => s.payment_status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((s: any) =>
        (s.customer_name ?? "").toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [allRows, statusFilter, search]);

  // Pagination
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // KPIs
  const totalDue = allRows.reduce((sum: number, s: any) => sum + Number(s.total_amount ?? 0), 0);
  const totalPaid = allRows.reduce((sum: number, s: any) => sum + Number(s.amount_paid ?? 0), 0);
  const totalBalance = totalDue - totalPaid;
  const owingCount = allRows.filter((s: any) => s.payment_status === "owing").length;
  const partialCount = allRows.filter((s: any) => s.payment_status === "partial").length;

  // Cart helpers
  const cartTotal = cart.reduce((sum, ci) => sum + ci.quantity * ci.unit_price, 0);

  const addToCart = (p: any) => {
    setCart((prev) => {
      const existing = prev.find((ci) => ci.product_id === p.id);
      if (existing) {
        return prev.map((ci) =>
          ci.product_id === p.id
            ? { ...ci, quantity: Math.min(ci.quantity + 1, ci.max_stock) }
            : ci,
        );
      }
      return [...prev, { product_id: p.id, name: p.name, quantity: 1, unit_price: Number(p.selling_price), max_stock: p.quantity_on_hand }];
    });
  };

  const updateQty = (id: string, qty: number) => {
    setCart((prev) => prev.map((ci) => (ci.product_id === id ? { ...ci, quantity: Math.max(1, Math.min(qty, ci.max_stock)) } : ci)));
  };

  const updatePrice = (id: string, price: number) => {
    setCart((prev) => prev.map((ci) => (ci.product_id === id ? { ...ci, unit_price: Math.max(0, price) } : ci)));
  };

  const removeFromCart = (id: string) => setCart((prev) => prev.filter((ci) => ci.product_id !== id));

  const resetForm = () => {
    setCart([]); setCustomer(""); setSaleDate(today()); setPaymentMethod("cash");
    setPaymentStatus("paid"); setAmountPaid(""); setNotes("");
  };

  const submitSale = useSubmit(async () => {
    if (cart.length === 0) throw new Error("Add at least one product to the sale.");
    const items = cart.map((ci) => ({ product_id: ci.product_id, quantity: ci.quantity, unit_price: ci.unit_price }));
    const { data, error } = await supabase.rpc("record_sale", {
      p_sale_date: saleDate,
      p_customer_name: customer,
      p_payment_method: paymentMethod as any,
      p_payment_status: paymentStatus as any,
      p_amount_paid: paymentStatus === "paid" ? cartTotal : Number(amountPaid) || 0,
      p_notes: notes,
      p_items: items as any,
    });
    if (error) throw error;
    toast.success("Sale recorded successfully");
    queryClient.invalidateQueries({ queryKey: ["sales"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
    resetForm();
    setOpen(false);
  });

  const submitVoid = async () => {
    if (!voidTarget || !voidReason.trim()) return;
    setVoidBusy(true);
    try {
      const { error } = await supabase.rpc("void_sale", { p_sale_id: voidTarget.id, p_reason: voidReason });
      if (error) throw error;
      toast.success("Sale voided");
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setVoidTarget(null);
      setVoidReason("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to void sale");
    } finally {
      setVoidBusy(false);
    }
  };

  const canRecord = role === "admin" || role === "staff";
  const canVoid = role === "admin";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales"
        description={`${period.label} · ${formatDate(period.from)} – ${formatDate(period.to)}`}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <PeriodFilter period={period} onChange={(p) => { setPeriod(p); setPage(0); }} />
            {canRecord ? (
              <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
                <DialogTrigger asChild>
                  <Button><Plus /> New sale</Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Record a new sale</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Customer / reference">
                        <Input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Walk-in customer" />
                      </Field>
                      <Field label="Sale date">
                        <Input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
                      </Field>
                    </div>

                    <div>
                      <div className="mb-2 text-sm font-medium">Products</div>
                      <div className="mb-3 flex flex-wrap gap-2">
                        {(products.data ?? []).map((p: any) => (
                          <Button
                            key={p.id}
                            variant="outline"
                            size="sm"
                            onClick={() => addToCart(p)}
                            disabled={p.quantity_on_hand <= 0}
                            className="transition-all duration-200 ease-in-out"
                          >
                            {p.name} <span className="num text-xs text-muted-foreground">{p.quantity_on_hand}</span>
                          </Button>
                        ))}
                      </div>
                      {cart.length > 0 ? (
                        <table className="ledger">
                          <thead>
                            <tr>
                              <th>Product</th>
                              <th className="col-num">Qty</th>
                              <th className="col-num">Unit price</th>
                              <th className="col-num">Subtotal</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {cart.map((ci) => (
                              <tr key={ci.product_id} className="transition-colors duration-200 ease-in-out">
                                <td>{ci.name}</td>
                                <td className="col-num">
                                  <Input
                                    type="number"
                                    min={1}
                                    max={ci.max_stock}
                                    value={ci.quantity}
                                    onChange={(e) => updateQty(ci.product_id, Number(e.target.value))}
                                    className="w-16 text-right num"
                                  />
                                </td>
                                <td className="col-num">
                                  <Input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={ci.unit_price}
                                    onChange={(e) => updatePrice(ci.product_id, Number(e.target.value))}
                                    className="w-24 text-right num"
                                  />
                                </td>
                                <td className="col-num"><Money value={ci.quantity * ci.unit_price} /></td>
                                <td>
                                  <Button variant="ghost" size="sm" onClick={() => removeFromCart(ci.product_id)} className="text-muted-foreground">Remove</Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <Empty>Click a product above to add it to the sale.</Empty>
                      )}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field label="Payment method">
                        <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cash">Cash</SelectItem>
                            <SelectItem value="transfer">Transfer</SelectItem>
                            <SelectItem value="credit">Credit</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Payment status">
                        <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="paid">Paid in full</SelectItem>
                            <SelectItem value="partial">Partial payment</SelectItem>
                            <SelectItem value="owing">Owing</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      {paymentStatus !== "paid" ? (
                        <Field label="Amount paid">
                          <Input type="number" min={0} step="0.01" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} placeholder="0.00" className="num" />
                        </Field>
                      ) : null}
                    </div>

                    <Field label="Notes (optional)">
                      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
                    </Field>

                    <div className="flex items-center justify-between border-t border-rule pt-4">
                      <div>
                        <span className="stat-label">Sale total</span>
                        <div className="num text-xl font-medium"><Money value={cartTotal} /></div>
                      </div>
                      <FormError message={submitSale.error} />
                      <AsyncButton busy={submitSale.busy} onClick={submitSale.submit}>Confirm sale</AsyncButton>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            ) : null}
          </div>
        }
      />

      {/* Payment KPIs */}
      <div className="grid gap-px bg-rule sm:grid-cols-3">
        <div className="sheet px-4 py-3.5 border-l-2 border-l-ink">
          <div className="stat-label">Total amount due</div>
          <div className="num mt-1.5 text-xl font-medium"><Money value={totalDue} /></div>
        </div>
        <div className="sheet px-4 py-3.5 border-l-2 border-l-positive">
          <div className="stat-label">Amount paid</div>
          <div className="num mt-1.5 text-xl font-medium text-positive"><Money value={totalPaid} /></div>
        </div>
        <div className="sheet px-4 py-3.5 border-l-2 border-l-warning">
          <div className="stat-label">Balance outstanding</div>
          <div className="num mt-1.5 text-xl font-medium text-warning"><Money value={totalBalance} /></div>
          {(owingCount > 0 || partialCount > 0) ? (
            <div className="mt-1 text-xs text-muted-foreground">{formatNumber(partialCount)} partial · {formatNumber(owingCount)} owing</div>
          ) : null}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search customer or reference…"
            className="w-56 pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="owing">Owing</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Sales ledger */}
      <Sheet title={`Sales book — ${formatNumber(filtered.length)} transactions`}>
        {filtered.length === 0 ? (
          <Empty>No sales match your filters for this period.</Empty>
        ) : (
          <table className="ledger">
            <thead>
              <tr>
                <th>Date</th>
                <th>Customer</th>
                <th>Method</th>
                <th>Status</th>
                <th className="col-num">Total due</th>
                <th className="col-num">Paid</th>
                <th className="col-num">Balance</th>
                {canVoid ? <th></th> : null}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((s: any) => {
                const balance = Number(s.total_amount ?? 0) - Number(s.amount_paid ?? 0);
                return (
                  <tr key={s.id} className="transition-colors duration-200 ease-in-out">
                    <td>{formatDate(s.sale_date)}</td>
                    <td>{s.customer_name || "—"}</td>
                    <td className="text-muted-foreground">{s.payment_method}</td>
                    <td>
                      <Tag
                        tone={s.payment_status === "paid" ? "positive" : s.payment_status === "partial" ? "warning" : "danger"}
                      >
                        {s.payment_status}
                      </Tag>
                    </td>
                    <td className="col-num"><Money value={Number(s.total_amount ?? 0)} /></td>
                    <td className="col-num"><Money value={Number(s.amount_paid ?? 0)} /></td>
                    <td className="col-num">
                      <Money
                        value={balance}
                        tone={balance > 0 ? "negative" : "muted"}
                      />
                    </td>
                    {canVoid ? (
                      <td>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-primary transition-colors duration-200 ease-in-out"
                          onClick={() => setVoidTarget({ id: s.id, ref: s.customer_name || s.sale_date })}
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-rule px-4 py-3">
            <span className="text-xs text-muted-foreground">
              Page {page + 1} of {totalPages} — {formatNumber(filtered.length)} total
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </Sheet>

      {/* Void dialog */}
      <Dialog open={Boolean(voidTarget)} onOpenChange={(v) => { if (!v) { setVoidTarget(null); setVoidReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void sale</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Voiding this sale will restore all stock to inventory and mark the transaction as voided. This cannot be undone.
          </p>
          <Field label="Reason (required)">
            <Textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)} rows={3} placeholder="e.g. Customer returned goods, duplicate entry…" />
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <AsyncButton busy={voidBusy} onClick={submitVoid} disabled={!voidReason.trim()}>
              <Ban /> Void sale
            </AsyncButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
