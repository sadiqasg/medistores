import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, PackagePlus, ArrowDownUp } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { useProducts, useTransactions } from "@/hooks/useMedinaData";
import { PageHeader, Sheet, Empty, Money, Tag, StatCard } from "@/components/ledger";
import { Field, FormError, AsyncButton, useSubmit, today, exportCsv, ExportButton } from "@/components/medina/shared";
import { formatDate, formatNumber } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — Medina Stores" },
      { name: "description", content: "Track stock levels, log arrivals and adjustments, and monitor low-stock items." },
      { property: "og:title", content: "Inventory — Medina Stores" },
      { property: "og:description", content: "Track stock levels, log arrivals and adjustments, and monitor low-stock items." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InventoryPage,
});

const PAGE_SIZE = 15;

const TXN_TYPE_LABELS: Record<string, string> = {
  stock_in: "Stock in",
  stock_out: "Stock out",
  sale_deduction: "Sale",
  sale_reversal: "Reversal",
  adjustment: "Adjustment",
};

function InventoryPage() {
  const me = useMe();
  const role = me.data?.role;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"stock" | "history">("stock");

  const products = useProducts();
  const transactions = useTransactions();

  // Stock movement dialog
  const [open, setOpen] = useState(false);
  const [txnProduct, setTxnProduct] = useState("");
  const [txnType, setTxnType] = useState("stock_in");
  const [txnQty, setTxnQty] = useState("");
  const [txnUnitCost, setTxnUnitCost] = useState("");
  const [txnSupplier, setTxnSupplier] = useState("");
  const [txnReason, setTxnReason] = useState("");

  const canWrite = role === "admin" || role === "staff";

  // Stock filtering & pagination
  const filteredProducts = useMemo(() => {
    if (!search.trim()) return products.data ?? [];
    const q = search.toLowerCase();
    return (products.data ?? []).filter(
      (p: any) => p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q),
    );
  }, [products.data, search]);

  const [stockPage, setStockPage] = useState(0);
  const stockTotalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const stockRows = filteredProducts.slice(stockPage * PAGE_SIZE, (stockPage + 1) * PAGE_SIZE);

  // Transaction history pagination
  const [txPage, setTxPage] = useState(0);
  const txTotalPages = Math.max(1, Math.ceil((transactions.data?.length ?? 0) / PAGE_SIZE));
  const txRows = (transactions.data ?? []).slice(txPage * PAGE_SIZE, (txPage + 1) * PAGE_SIZE);

  // KPIs
  const totalSkus = (products.data ?? []).length;
  const totalUnits = (products.data ?? []).reduce((sum: number, p: any) => sum + Number(p.quantity_on_hand ?? 0), 0);
  const stockValue = (products.data ?? []).reduce(
    (sum: number, p: any) => sum + Number(p.quantity_on_hand ?? 0) * Number(p.cost_price ?? 0),
    0,
  );
  const lowStockItems = (products.data ?? []).filter(
    (p: any) => Number(p.quantity_on_hand ?? 0) <= Number(p.reorder_threshold ?? 0),
  );

  const resetForm = () => {
    setTxnProduct(""); setTxnType("stock_in"); setTxnQty(""); setTxnUnitCost("");
    setTxnSupplier(""); setTxnReason("");
  };

  const submitTxn = useSubmit(async () => {
    if (!txnProduct) throw new Error("Select a product.");
    const qty = Number(txnQty);
    if (!qty || qty <= 0) throw new Error("Enter a valid quantity.");
    if (txnType === "stock_out" || txnType === "adjustment") {
      const prod = (products.data ?? []).find((p: any) => p.id === txnProduct);
      if (prod && txnType === "stock_out" && qty > prod.quantity_on_hand) {
        throw new Error(`Insufficient stock. Only ${prod.quantity_on_hand} units available.`);
      }
    }
    const { error } = await supabase.from("inventory_transactions").insert({
      product_id: txnProduct,
      type: txnType,
      quantity: qty,
      unit_cost: txnUnitCost ? Number(txnUnitCost) : null,
      supplier: txnSupplier || null,
      reason: txnReason || null,
    });
    if (error) throw error;
    toast.success("Stock movement recorded");
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["inventory_transactions"] });
    resetForm();
    setOpen(false);
  });

  const handleExport = () => {
    exportCsv("inventory-transactions.csv", ["Date", "Product", "Type", "Quantity", "Unit cost", "Supplier", "Reason"],
      (transactions.data ?? []).map((t: any) => [
        formatDate(t.created_at), t.products?.name ?? "—", TXN_TYPE_LABELS[t.type] ?? t.type,
        t.quantity, t.unit_cost ?? "", t.supplier ?? "", t.reason ?? "",
      ]),
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Stock levels, movements and reorder alerts"
        action={
          <div className="flex flex-wrap items-center gap-3">
            <ExportButton onClick={handleExport} label="Export" />
            {canWrite ? (
              <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
                <DialogTrigger asChild>
                  <Button><PackagePlus /> Log stock movement</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Log a stock movement</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={submitTxn.submit} className="space-y-4">
                    <Field label="Product">
                      <Select value={txnProduct} onValueChange={setTxnProduct}>
                        <SelectTrigger><SelectValue placeholder="Select product…" /></SelectTrigger>
                        <SelectContent>
                          {(products.data ?? []).map((p: any) => (
                            <SelectItem value={p.id} key={p.id}>
                              {p.name} <span className="num text-xs text-muted-foreground">({p.quantity_on_hand} in stock)</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Movement type">
                        <Select value={txnType} onValueChange={setTxnType}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="stock_in">Stock in (arrival)</SelectItem>
                            <SelectItem value="stock_out">Stock out (removal)</SelectItem>
                            <SelectItem value="adjustment">Adjustment (+/-)</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Quantity">
                        <Input type="number" min={1} value={txnQty} onChange={(e) => setTxnQty(e.target.value)} placeholder="0" className="num" required />
                      </Field>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Unit cost (optional)">
                        <Input type="number" min={0} step="0.01" value={txnUnitCost} onChange={(e) => setTxnUnitCost(e.target.value)} placeholder="0.00" className="num" />
                      </Field>
                      <Field label="Supplier (optional)">
                        <Input value={txnSupplier} onChange={(e) => setTxnSupplier(e.target.value)} placeholder="Supplier name" />
                      </Field>
                    </div>
                    <Field label="Reason / notes (optional)">
                      <Textarea value={txnReason} onChange={(e) => setTxnReason(e.target.value)} rows={2} placeholder="e.g. Weekly delivery, damaged goods, stock count adjustment…" />
                    </Field>
                    <FormError message={submitTxn.error} />
                    <div className="flex justify-end pt-2">
                      <AsyncButton busy={submitTxn.busy} onClick={submitTxn.submit}>Record movement</AsyncButton>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            ) : null}
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid gap-px bg-rule sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total SKUs" value={formatNumber(totalSkus)} />
        <StatCard label="Units in stock" value={formatNumber(totalUnits)} />
        <StatCard label="Inventory value" value={<Money value={stockValue} />} />
        <StatCard
          label="Low stock alerts"
          value={formatNumber(lowStockItems.length)}
          tone={lowStockItems.length > 0 ? "warning" : undefined}
        />
      </div>

      {/* Tab switcher */}
      <div className="flex items-center gap-1 border-b border-rule">
        <button
          onClick={() => setTab("stock")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors duration-200 ease-in-out ${tab === "stock" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Stock levels
        </button>
        <button
          onClick={() => setTab("history")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors duration-200 ease-in-out ${tab === "history" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Movement history
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setStockPage(0); }}
          placeholder={tab === "stock" ? "Search product name or SKU…" : "Filter is on stock tab only"}
          disabled={tab === "history"}
          className="w-56 pl-9"
        />
      </div>

      {/* Stock levels tab */}
      {tab === "stock" ? (
        <Sheet title={`Stock levels — ${formatNumber(filteredProducts.length)} products`}>
          {filteredProducts.length === 0 ? (
            <Empty>No products match your search.</Empty>
          ) : (
            <table className="ledger">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Category</th>
                  <th>Unit type</th>
                  <th className="col-num">On hand</th>
                  <th className="col-num">Reorder at</th>
                  <th className="col-num">Cost price</th>
                  <th className="col-num">Stock value</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {stockRows.map((p: any) => {
                  const isLow = Number(p.quantity_on_hand ?? 0) <= Number(p.reorder_threshold ?? 0);
                  const value = Number(p.quantity_on_hand ?? 0) * Number(p.cost_price ?? 0);
                  return (
                    <tr key={p.id} className="transition-colors duration-200 ease-in-out">
                      <td className="font-medium">{p.name}</td>
                      <td className="text-muted-foreground">{p.sku || "—"}</td>
                      <td>{p.category}</td>
                      <td className="text-muted-foreground">{p.unit_type}</td>
                      <td className="col-num">{formatNumber(p.quantity_on_hand)}</td>
                      <td className="col-num text-muted-foreground">{formatNumber(p.reorder_threshold)}</td>
                      <td className="col-num"><Money value={Number(p.cost_price ?? 0)} /></td>
                      <td className="col-num"><Money value={value} /></td>
                      <td>
                        {isLow ? (
                          <Tag tone="warning">Low stock</Tag>
                        ) : (
                          <Tag tone="positive">In stock</Tag>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {stockTotalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-rule px-4 py-3">
              <span className="text-xs text-muted-foreground">
                Page {stockPage + 1} of {stockTotalPages} — {formatNumber(filteredProducts.length)} total
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={stockPage === 0} onClick={() => setStockPage((p) => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={stockPage >= stockTotalPages - 1} onClick={() => setStockPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          ) : null}
        </Sheet>
      ) : null}

      {/* Movement history tab */}
      {tab === "history" ? (
        <Sheet title={`Movement history — ${formatNumber(transactions.data?.length ?? 0)} transactions`}>
          {(transactions.data ?? []).length === 0 ? (
            <Empty>No stock movements recorded yet.</Empty>
          ) : (
            <table className="ledger">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Product</th>
                  <th>Type</th>
                  <th className="col-num">Quantity</th>
                  <th className="col-num">Unit cost</th>
                  <th>Supplier</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {txRows.map((t: any) => (
                  <tr key={t.id} className="transition-colors duration-200 ease-in-out">
                    <td>{formatDate(t.created_at)}</td>
                    <td className="font-medium">{t.products?.name ?? "—"}</td>
                    <td>
                      <Tag
                        tone={
                          t.type === "stock_in" || t.type === "sale_reversal"
                            ? "positive"
                            : t.type === "sale_deduction" || t.type === "stock_out"
                              ? "danger"
                              : "steel"
                        }
                      >
                        {TXN_TYPE_LABELS[t.type] ?? t.type}
                      </Tag>
                    </td>
                    <td className="col-num">
                      <span className={t.type === "stock_in" || t.type === "sale_reversal" || (t.type === "adjustment" && t.quantity > 0) ? "text-positive" : "text-primary"}>
                        {t.type === "stock_in" || t.type === "sale_reversal" ? "+" : t.type === "stock_out" || t.type === "sale_deduction" ? "-" : ""}{formatNumber(t.quantity)}
                      </span>
                    </td>
                    <td className="col-num">{t.unit_cost ? <Money value={Number(t.unit_cost)} /> : "—"}</td>
                    <td className="text-muted-foreground">{t.supplier || "—"}</td>
                    <td className="text-muted-foreground">{t.reason || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {txTotalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-rule px-4 py-3">
              <span className="text-xs text-muted-foreground">
                Page {txPage + 1} of {txTotalPages} — {formatNumber(transactions.data?.length ?? 0)} total
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={txPage === 0} onClick={() => setTxPage((p) => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={txPage >= txTotalPages - 1} onClick={() => setTxPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          ) : null}
        </Sheet>
      ) : null}
    </div>
  );
}
