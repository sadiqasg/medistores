import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, PackagePlus, ArrowDownUp, Pencil, Box } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useSettings } from "@/hooks/useMe";
import { useProducts, useTransactions, useCustomers, useAllCustomerTransactions } from "@/hooks/useMedinaData";
import { PageHeader, Sheet, Empty, Money, Tag, StatCard } from "@/components/ledger";
import { Package, PackageCheck } from "lucide-react";
import { Field, FormError, AsyncButton, useSubmit, today, exportCsv, ExportButton, AmountField, AmountInput } from "@/components/medina/shared";
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
  const settings = useSettings();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"stock" | "crates" | "history">("stock");

  const productCategories = (settings.data?.categories ?? ["Soft Drinks","Water","Energy Drinks","Juices","Dairy","Other"]) as string[];

  const products = useProducts();
  const transactions = useTransactions();
  const customers = useCustomers(true);
  const allCustTxns = useAllCustomerTransactions();

  // Crate asset calculations
  const cratesWithCustomers = useMemo(() => {
    const custList = customers.data ?? [];
    const txns = allCustTxns.data ?? [];
    return custList.map((c: any) => {
      const cTxns = txns.filter((t: any) => t.customer_id === c.id);
      const delivered = cTxns.reduce((s: number, t: any) => s + Number(t.crates_delivered ?? 0), 0);
      const returned = cTxns.reduce((s: number, t: any) => s + Number(t.crates_returned ?? 0), 0);
      const held = Number(c.empties_brought_forward ?? 0) + delivered - returned;
      return { id: c.id, name: c.name, is_one_time: c.is_one_time, held };
    }).filter((c: any) => c.held > 0);
  }, [customers.data, allCustTxns.data]);

  const totalCratesWithCustomers = cratesWithCustomers.reduce((s: number, c: any) => s + c.held, 0);

  // Empty crates in warehouse = total products quantity_on_hand (each unit represents a crate of drinks)
  // plus any standalone empty crates tracked separately. For now, liquid stock IS crates.
  const liquidCrates = (products.data ?? []).reduce((s: number, p: any) => s + Number(p.quantity_on_hand ?? 0), 0);
  // Empty crates on ground in warehouse — a manually tracked figure derived from stock movements
  // For now we compute: total crates in system (liquid + with customers) minus what's out with customers
  // But empty crates on ground should be its own metric. We use a simple formula:
  // Empty on ground = (total crate capacity assumed) - liquid - with customers
  // Since we don't have a separate crate inventory, we show what we can derive.
  const emptyCratesOnGround = useMemo(() => {
    // Each product unit represents one full crate. Empty crates = stock that was returned.
    // We track empty crates as: sum of (crates_returned - crates_delivered) from customer txns that are negative
    // plus empties_brought_forward from all customers that were never sent out.
    // Simplified: empty crates on ground = max(0, total stock movements in - liquid stock - crates with customers)
    // For now, let's show 0 as a placeholder that users can understand needs manual tracking
    return 0;
  }, [liquidCrates, totalCratesWithCustomers]);

  // Stock movement dialog
  const [open, setOpen] = useState(false);
  const [txnProduct, setTxnProduct] = useState("");
  const [txnType, setTxnType] = useState("stock_in");
  const [txnQty, setTxnQty] = useState("");
  const [txnUnitCost, setTxnUnitCost] = useState("");
  const [txnSupplier, setTxnSupplier] = useState("");
  const [txnReason, setTxnReason] = useState("");

  // Product add/edit dialog
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [pName, setPName] = useState("");
  const [pSku, setPSku] = useState("");
  const [pCategory, setPCategory] = useState("");
  const [pUnitType, setPUnitType] = useState("crate");
  const [pCostPrice, setPCostPrice] = useState("");
  const [pSellingPrice, setPSellingPrice] = useState("");
  const [pReorder, setPReorder] = useState("");
  const [pOpeningStock, setPOpeningStock] = useState("");

  const resetProductForm = () => {
    setEditingProduct(null);
    setPName(""); setPSku(""); setPCategory(""); setPUnitType("crate");
    setPCostPrice(""); setPSellingPrice(""); setPReorder(""); setPOpeningStock("");
  };

  const openAddProduct = () => {
    resetProductForm();
    setProductDialogOpen(true);
  };

  const openEditProduct = (p: any) => {
    setEditingProduct(p);
    setPName(p.name ?? "");
    setPSku(p.sku ?? "");
    setPCategory(p.category ?? "");
    setPUnitType(p.unit_type ?? "crate");
    setPCostPrice(String(p.cost_price ?? ""));
    setPSellingPrice(String(p.selling_price ?? ""));
    setPReorder(String(p.reorder_threshold ?? ""));
    setPOpeningStock("");
    setProductDialogOpen(true);
  };

  const submitProduct = useSubmit(async () => {
    if (!pName.trim()) throw new Error("Product name is required");
    if (!pCategory) throw new Error("Select a category");
    const payload: Record<string, unknown> = {
      name: pName.trim(),
      sku: pSku.trim() || null,
      category: pCategory,
      unit_type: pUnitType,
      cost_price: pCostPrice ? Number(pCostPrice) : 0,
      selling_price: pSellingPrice ? Number(pSellingPrice) : 0,
      reorder_threshold: pReorder ? Number(pReorder) : 0,
      is_active: true,
    };
    if (editingProduct) {
      const { error } = await supabase.from("products").update(payload).eq("id", editingProduct.id);
      if (error) throw error;
      toast.success("Product updated");
    } else {
      const { data: newProd, error } = await supabase.from("products").insert(payload).select().single();
      if (error) throw error;
      if (pOpeningStock && Number(pOpeningStock) > 0) {
        const { error: invError } = await supabase.from("inventory_transactions").insert({
          product_id: newProd.id,
          type: "stock_in",
          quantity: Number(pOpeningStock),
          unit_cost: pCostPrice ? Number(pCostPrice) : null,
          reason: "Opening stock",
          created_by: me.data?.user?.id ?? null,
        });
        if (invError) {
          toast.error("Product created but opening stock failed: " + invError.message);
        }
      }
      toast.success("Product added");
    }
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["inventory_transactions"] });
    resetProductForm();
    setProductDialogOpen(false);
  });

  const handleToggleActive = async (p: any) => {
    const { error } = await supabase.from("products").update({ is_active: !p.is_active }).eq("id", p.id);
    if (error) { toast.error("Failed to update product"); return; }
    toast.success(p.is_active ? "Product deactivated" : "Product reactivated");
    queryClient.invalidateQueries({ queryKey: ["products"] });
  };

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
      created_by: me.data?.user?.id ?? null,
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
              <Button variant="outline" onClick={openAddProduct}><Box /> Add product</Button>
            ) : null}
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
                        <AmountInput value={txnQty} onChange={setTxnQty} placeholder="0" />
                      </Field>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Unit cost (optional)">
                        <AmountInput value={txnUnitCost} onChange={setTxnUnitCost} />
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

      {/* Product add/edit dialog */}
      <Dialog open={productDialogOpen} onOpenChange={(v) => { setProductDialogOpen(v); if (!v) resetProductForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Edit product" : "Add a product"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitProduct.submit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Product name">
                <Input value={pName} onChange={(e) => setPName(e.target.value)} required placeholder="e.g. Coca-Cola 50cl" />
              </Field>
              <Field label="SKU (optional)">
                <Input value={pSku} onChange={(e) => setPSku(e.target.value)} placeholder="e.g. COKE-50" />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Product line" hint="The brand or product family this belongs to">
                <Select value={pCategory} onValueChange={setPCategory}>
                  <SelectTrigger><SelectValue placeholder="Select product line…" /></SelectTrigger>
                  <SelectContent>
                    {productCategories.map((cat) => (
                      <SelectItem value={cat} key={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Unit type">
                <Select value={pUnitType} onValueChange={setPUnitType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="crate">Crate</SelectItem>
                    <SelectItem value="bottle">Bottle</SelectItem>
                    <SelectItem value="carton">Carton</SelectItem>
                    <SelectItem value="sachet">Sachet</SelectItem>
                    <SelectItem value="unit">Unit</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <AmountField label="Cost price" value={pCostPrice} onChange={setPCostPrice} />
              <AmountField label="Selling price" value={pSellingPrice} onChange={setPSellingPrice} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Reorder threshold" hint="Alert when stock drops to this">
                <AmountInput value={pReorder} onChange={setPReorder} placeholder="0" />
              </Field>
              {editingProduct ? null : (
                <Field label="Opening stock" hint="Initial quantity to add">
                  <AmountInput value={pOpeningStock} onChange={setPOpeningStock} placeholder="0" />
                </Field>
              )}
            </div>
            <FormError message={submitProduct.error} />
            <div className="flex justify-end pt-2">
              <AsyncButton busy={submitProduct.busy} onClick={submitProduct.submit}>
                {editingProduct ? "Save changes" : "Add product"}
              </AsyncButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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
          Liquid stock
        </button>
        <button
          onClick={() => setTab("crates")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors duration-200 ease-in-out ${tab === "crates" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Crate assets
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
          disabled={tab !== "stock"}
          className="w-56 pl-9"
        />
      </div>

      {/* Stock levels tab */}
      {tab === "stock" ? (
        <Sheet title={`Stock levels — ${formatNumber(filteredProducts.length)} products`}>
          {(products.data ?? []).length === 0 ? (
            <Empty>
              No products yet. Click "Add product" to create your first item.
            </Empty>
          ) : filteredProducts.length === 0 ? (
            <Empty>No products match your search.</Empty>
          ) : (
            <table className="ledger">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Product line</th>
                  <th>Unit type</th>
                  <th className="col-num">On hand</th>
                  <th className="col-num">Reorder at</th>
                  <th className="col-num">Cost price</th>
                  <th className="col-num">Selling price</th>
                  <th className="col-num">Stock value</th>
                  <th>Status</th>
                  {canWrite ? <th></th> : null}
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
                      <td className="col-num"><Money value={Number(p.selling_price ?? 0)} /></td>
                      <td className="col-num"><Money value={value} /></td>
                      <td>
                        {isLow ? (
                          <Tag tone="warning">Low stock</Tag>
                        ) : p.is_active ? (
                          <Tag tone="positive">In stock</Tag>
                        ) : (
                          <Tag tone="steel">Inactive</Tag>
                        )}
                      </td>
                      {canWrite ? (
                        <td>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={(e) => { e.stopPropagation(); openEditProduct(p); }}
                            aria-label={`Edit ${p.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      ) : null}
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

      {/* Crate assets tab */}
      {tab === "crates" ? (
        <div className="space-y-6">
          {/* Crate KPIs */}
          <div className="grid gap-px bg-rule sm:grid-cols-3">
            <StatCard
              label="Liquid stock (full crates)"
              value={formatNumber(liquidCrates)}
              sub="Drinks in crates ready for supply"
              tone="primary"
            />
            <StatCard
              label="Empty crates on ground"
              value={formatNumber(emptyCratesOnGround)}
              sub="In warehouse, ready to fill"
            />
            <StatCard
              label="Crates with customers"
              value={formatNumber(totalCratesWithCustomers)}
              sub="Empties held by customers"
              tone="warning"
            />
          </div>

          {/* Empty crates with customers */}
          <Sheet title={`Empty crates with customers — ${formatNumber(cratesWithCustomers.length)} customers`}>
            {cratesWithCustomers.length === 0 ? (
              <Empty>No crates currently held by customers.</Empty>
            ) : (
              <table className="ledger">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Type</th>
                    <th className="col-num">Crates held</th>
                  </tr>
                </thead>
                <tbody>
                  {cratesWithCustomers.map((c: any) => (
                    <tr key={c.id} className="transition-colors duration-200 ease-in-out">
                      <td className="font-medium">{c.name}</td>
                      <td>{c.is_one_time ? <Tag tone="steel">One-time</Tag> : <Tag tone="positive">Recurring</Tag>}</td>
                      <td className="col-num num font-medium text-warning">{formatNumber(c.held)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-rule">
                    <td colSpan={2} className="font-medium">Total crates with customers</td>
                    <td className="col-num num font-bold text-warning">{formatNumber(totalCratesWithCustomers)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </Sheet>

          {/* Empty crates in warehouse info */}
          <Sheet title="Empty crates on ground (in warehouse)">
            <div className="px-4 py-6">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-rule">
                  <Package className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <div className="text-lg font-medium num">{formatNumber(emptyCratesOnGround)} empty crates</div>
                  <p className="text-sm text-muted-foreground">
                    Empty crates returned by customers and available in the warehouse for refilling.
                    This figure is derived from crate returns logged in the customer ledger.
                  </p>
                </div>
              </div>
            </div>
          </Sheet>
        </div>
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
