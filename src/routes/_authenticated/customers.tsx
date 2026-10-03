import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, UserPlus, Package, PackageCheck, ArrowRightLeft, Wallet } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { useCustomers, useCustomerTransactions } from "@/hooks/useMedinaData";
import { PageHeader, Sheet, Empty, Money, Tag, StatCard } from "@/components/ledger";
import { Field, FormError, AsyncButton, useSubmit, today, exportCsv, ExportButton } from "@/components/medina/shared";
import { formatDate, formatNumber } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet as UISheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({
    meta: [
      { title: "Customers — Medina Stores" },
      { name: "description", content: "Customer ledger, crate tracking and transaction history." },
      { property: "og:title", content: "Customers — Medina Stores" },
      { property: "og:description", content: "Customer ledger, crate tracking and transaction history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CustomersPage,
});

const PAGE_SIZE = 15;

const TXN_TYPE_LABELS: Record<string, string> = {
  supply: "Supply",
  payment: "Payment",
  crate_out: "Crates out",
  crate_return: "Crates returned",
  adjustment: "Adjustment",
};

function calcBalance(customer: any, transactions: any[]) {
  const txnSum = transactions.reduce(
    (acc, t) => ({
      amount: acc.amount + Number(t.amount ?? 0),
      paid: acc.paid + Number(t.amount_paid ?? 0),
    }),
    { amount: 0, paid: 0 },
  );
  return Number(customer.balance_brought_forward ?? 0) + txnSum.amount - txnSum.paid;
}

function calcCratesHeld(customer: any, transactions: any[]) {
  const txnSum = transactions.reduce(
    (acc, t) => ({
      delivered: acc.delivered + Number(t.crates_delivered ?? 0),
      returned: acc.returned + Number(t.crates_returned ?? 0),
    }),
    { delivered: 0, returned: 0 },
  );
  return Number(customer.empties_brought_forward ?? 0) + txnSum.delivered - txnSum.returned;
}

function CustomersPage() {
  const me = useMe();
  const role = me.data?.role;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"recurring" | "one_time">("recurring");

  const customers = useCustomers();

  const [addOpen, setAddOpen] = useState(false);
  const [drawerCustomer, setDrawerCustomer] = useState<any | null>(null);

  const canWrite = role === "admin" || role === "staff";

  const recurringCustomers = useMemo(
    () => (customers.data ?? []).filter((c: any) => !c.is_one_time),
    [customers.data],
  );
  const oneTimeCustomers = useMemo(
    () => (customers.data ?? []).filter((c: any) => c.is_one_time),
    [customers.data],
  );

  const activeList = tab === "recurring" ? recurringCustomers : oneTimeCustomers;

  const filtered = useMemo(() => {
    if (!search.trim()) return activeList;
    const q = search.toLowerCase();
    return activeList.filter(
      (c: any) =>
        (c.name ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q),
    );
  }, [activeList, search]);

  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const totalInvoiced = (customers.data ?? []).reduce(
    (sum: number, c: any) => sum + Number(c.balance_brought_forward ?? 0),
    0,
  );
  const totalOutstanding = (customers.data ?? []).reduce((sum: number, c: any) => {
    return sum + Math.abs(Number(c.balance_brought_forward ?? 0));
  }, 0);
  const totalOneTime = oneTimeCustomers.length;
  const totalRecurring = recurringCustomers.length;

  // Add customer form state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [isOneTime, setIsOneTime] = useState(false);
  const [balanceBF, setBalanceBF] = useState("");
  const [emptiesBF, setEmptiesBF] = useState("");
  const [custNotes, setCustNotes] = useState("");

  const resetAddForm = () => {
    setName(""); setPhone(""); setAddress(""); setIsOneTime(false);
    setBalanceBF(""); setEmptiesBF(""); setCustNotes("");
  };

  const submitAdd = useSubmit(async () => {
    if (!isOneTime && !name.trim()) throw new Error("Customer name is required for recurring customers.");
    const { error } = await supabase.from("customers").insert({
      name: name.trim() || "Walk-in Customer",
      phone: phone || null,
      address: address || null,
      is_one_time: isOneTime,
      balance_brought_forward: balanceBF ? Number(balanceBF) : 0,
      empties_brought_forward: emptiesBF ? Number(emptiesBF) : 0,
      notes: custNotes || null,
    });
    if (error) throw error;
    toast.success("Customer added");
    queryClient.invalidateQueries({ queryKey: ["customers"] });
    resetAddForm();
    setAddOpen(false);
  });

  const handleExport = () => {
    exportCsv(
      "customers.csv",
      ["Name", "Phone", "Type", "Balance BF", "Empties BF", "Active"],
      (customers.data ?? []).map((c: any) => [
        c.name, c.phone ?? "", c.is_one_time ? "One-time" : "Recurring",
        c.balance_brought_forward ?? 0, c.empties_brought_forward ?? 0,
        c.is_active ? "Yes" : "No",
      ]),
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Ledger"
        description="Customer accounts, crate tracking and transaction history"
        action={
          <div className="flex flex-wrap items-center gap-3">
            <ExportButton onClick={handleExport} label="Export" />
            {canWrite ? (
              <Dialog open={addOpen} onOpenChange={(v) => { setAddOpen(v); if (!v) resetAddForm(); }}>
                <DialogTrigger asChild>
                  <Button><UserPlus /> Add customer</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Add a customer</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={submitAdd.submit} className="space-y-4">
                    <div className="flex items-center justify-between rounded-md border border-rule px-3 py-2.5">
                      <div>
                        <div className="text-sm font-medium">One-time customer</div>
                        <div className="text-xs text-muted-foreground">Walk-in sales without a named customer</div>
                      </div>
                      <Switch checked={isOneTime} onCheckedChange={setIsOneTime} />
                    </div>
                    <Field label="Name" hint={isOneTime ? "Optional — defaults to 'Walk-in Customer'" : undefined}>
                      <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={isOneTime ? "Walk-in Customer" : "Customer name"}
                        required={!isOneTime}
                      />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Phone (optional)">
                        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0800..." />
                      </Field>
                      <Field label="Address (optional)">
                        <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, area..." />
                      </Field>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Balance brought forward" hint="Outstanding debt from legacy Excel">
                        <Input type="number" step="0.01" value={balanceBF} onChange={(e) => setBalanceBF(e.target.value)} placeholder="0.00" className="num" />
                      </Field>
                      <Field label="Empties brought forward" hint="Crates held from legacy Excel">
                        <Input type="number" value={emptiesBF} onChange={(e) => setEmptiesBF(e.target.value)} placeholder="0" className="num" />
                      </Field>
                    </div>
                    <Field label="Notes (optional)">
                      <Textarea value={custNotes} onChange={(e) => setCustNotes(e.target.value)} rows={2} />
                    </Field>
                    <FormError message={submitAdd.error} />
                    <div className="flex justify-end pt-2">
                      <AsyncButton busy={submitAdd.busy} onClick={submitAdd.submit}>Add customer</AsyncButton>
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
        <StatCard label="Recurring customers" value={formatNumber(totalRecurring)} />
        <StatCard label="One-time customers" value={formatNumber(totalOneTime)} />
        <StatCard label="Legacy balance BF" value={<Money value={totalInvoiced} />} />
        <StatCard label="Legacy empties BF" value={formatNumber(
          (customers.data ?? []).reduce((s: number, c: any) => s + Number(c.empties_brought_forward ?? 0), 0),
        )} />
      </div>

      {/* Tab switcher */}
      <div className="flex items-center gap-1 border-b border-rule">
        <button
          onClick={() => { setTab("recurring"); setPage(0); }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors duration-200 ease-in-out ${tab === "recurring" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Recurring ({formatNumber(recurringCustomers.length)})
        </button>
        <button
          onClick={() => { setTab("one_time"); setPage(0); }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors duration-200 ease-in-out ${tab === "one_time" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          One-time ({formatNumber(oneTimeCustomers.length)})
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          placeholder="Search name or phone…"
          className="w-56 pl-9"
        />
      </div>

      {/* Customer list */}
      <Sheet title={`Customer ledger — ${formatNumber(filtered.length)} customers`}>
        {filtered.length === 0 ? (
          <Empty>No customers match your search.</Empty>
        ) : (
          <table className="ledger">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th className="col-num">Balance BF</th>
                <th className="col-num">Empties BF</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((c: any) => (
                <tr
                  key={c.id}
                  className="cursor-pointer transition-colors duration-200 ease-in-out hover:bg-sidebar-accent/30"
                  onClick={() => setDrawerCustomer(c)}
                >
                  <td className="font-medium">
                    {c.name}
                    {c.is_one_time ? <Tag tone="steel"> One-time</Tag> : null}
                  </td>
                  <td className="text-muted-foreground">{c.phone || "—"}</td>
                  <td className="col-num"><Money value={Number(c.balance_brought_forward ?? 0)} tone="muted" /></td>
                  <td className="col-num text-muted-foreground">{formatNumber(c.empties_brought_forward)}</td>
                  <td>{c.is_active ? <Tag tone="positive">Active</Tag> : <Tag tone="warning">Inactive</Tag>}</td>
                  <td>
                    <Button variant="ghost" size="sm" className="text-muted-foreground">
                      View ledger
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-rule px-4 py-3">
            <span className="text-xs text-muted-foreground">
              Page {page + 1} of {totalPages} — {formatNumber(filtered.length)} total
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        ) : null}
      </Sheet>

      {/* Customer detail drawer */}
      <CustomerDrawer
        customer={drawerCustomer}
        onClose={() => setDrawerCustomer(null)}
        canWrite={canWrite}
      />
    </div>
  );
}

function CustomerDrawer({
  customer,
  onClose,
  canWrite,
}: {
  customer: any | null;
  onClose: () => void;
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const transactions = useCustomerTransactions(customer?.id);

  const [txnOpen, setTxnOpen] = useState(false);
  const [txnType, setTxnType] = useState("supply");
  const [txnDate, setTxnDate] = useState(today());
  const [txnAmount, setTxnAmount] = useState("");
  const [txnPaid, setTxnPaid] = useState("");
  const [txnCratesOut, setTxnCratesOut] = useState("");
  const [txnCratesReturned, setTxnCratesReturned] = useState("");
  const [txnDesc, setTxnDesc] = useState("");
  const [txnRef, setTxnRef] = useState("");

  const open = Boolean(customer);

  const txns = transactions.data ?? [];
  const financialBalance = customer ? calcBalance(customer, txns) : 0;
  const cratesHeld = customer ? calcCratesHeld(customer, txns) : 0;
  const totalInvoiced = customer
    ? Number(customer.balance_brought_forward ?? 0) + txns.reduce((s: number, t: any) => s + Number(t.amount ?? 0), 0)
    : 0;
  const totalPaid = customer
    ? txns.reduce((s: number, t: any) => s + Number(t.amount_paid ?? 0), 0)
    : 0;

  const resetTxnForm = () => {
    setTxnType("supply"); setTxnDate(today()); setTxnAmount(""); setTxnPaid("");
    setTxnCratesOut(""); setTxnCratesReturned(""); setTxnDesc(""); setTxnRef("");
  };

  const submitTxn = useSubmit(async () => {
    if (!customer) return;
    const payload: any = {
      customer_id: customer.id,
      transaction_date: txnDate,
      type: txnType,
      description: txnDesc || null,
      amount: txnAmount ? Number(txnAmount) : 0,
      amount_paid: txnPaid ? Number(txnPaid) : 0,
      crates_delivered: txnCratesOut ? Number(txnCratesOut) : 0,
      crates_returned: txnCratesReturned ? Number(txnCratesReturned) : 0,
      reference: txnRef || null,
    };
    if (txnType === "payment") {
      payload.amount = 0;
      payload.amount_paid = txnPaid ? Number(txnPaid) : 0;
    }
    if (txnType === "crate_out") {
      payload.amount = 0; payload.amount_paid = 0;
      payload.crates_delivered = txnCratesOut ? Number(txnCratesOut) : 0;
    }
    if (txnType === "crate_return") {
      payload.amount = 0; payload.amount_paid = 0;
      payload.crates_returned = txnCratesReturned ? Number(txnCratesReturned) : 0;
    }

    const { error } = await supabase.from("customer_transactions").insert(payload);
    if (error) throw error;
    toast.success("Transaction recorded");
    queryClient.invalidateQueries({ queryKey: ["customer_transactions", customer.id] });
    queryClient.invalidateQueries({ queryKey: ["customer_transactions_all"] });
    resetTxnForm();
    setTxnOpen(false);
  });

  const handleExportTxns = () => {
    if (!customer) return;
    exportCsv(
      `customer-${customer.name}-ledger.csv`,
      ["Date", "Type", "Description", "Amount", "Paid", "Crates out", "Crates returned", "Reference"],
      txns.map((t: any) => [
        formatDate(t.transaction_date), TXN_TYPE_LABELS[t.type] ?? t.type,
        t.description ?? "", t.amount ?? 0, t.amount_paid ?? 0,
        t.crates_delivered ?? 0, t.crates_returned ?? 0, t.reference ?? "",
      ]),
    );
  };

  let runningBalance = customer ? Number(customer.balance_brought_forward ?? 0) : 0;
  let runningCrates = customer ? Number(customer.empties_brought_forward ?? 0) : 0;

  const sortedTxns = [...txns].sort((a: any, b: any) => {
    const da = new Date(a.transaction_date).getTime();
    const db = new Date(b.transaction_date).getTime();
    if (da !== db) return da - db;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  return (
    <UISheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        {customer ? (
          <>
            <SheetHeader>
              <SheetTitle className="font-serif text-xl">{customer.name}</SheetTitle>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {customer.phone ? <span>{customer.phone}</span> : null}
                {customer.address ? <span>{customer.address}</span> : null}
                {customer.is_one_time ? <Tag tone="steel">One-time</Tag> : null}
              </div>
            </SheetHeader>

            {/* Micro-summary */}
            <div className="mt-4 grid grid-cols-2 gap-px bg-rule">
              <div className="sheet px-3 py-2.5">
                <div className="stat-label">Total invoiced</div>
                <div className="num mt-1 text-lg font-medium"><Money value={totalInvoiced} /></div>
              </div>
              <div className="sheet px-3 py-2.5">
                <div className="stat-label">Total paid</div>
                <div className="num mt-1 text-lg font-medium text-positive"><Money value={totalPaid} /></div>
              </div>
              <div className="sheet px-3 py-2.5">
                <div className="stat-label">Outstanding debt</div>
                <div className="num mt-1 text-lg font-medium text-warning"><Money value={financialBalance} /></div>
              </div>
              <div className="sheet px-3 py-2.5">
                <div className="stat-label">Crates held</div>
                <div className="num mt-1 text-lg font-medium">{formatNumber(cratesHeld)}</div>
              </div>
            </div>

            {/* Brought forward row */}
            <div className="mt-3 flex items-center gap-4 rounded-md border border-rule px-3 py-2 text-xs text-muted-foreground">
              <span>Balance BF: <span className="num font-medium text-foreground">{formatNumber(Number(customer.balance_brought_forward ?? 0))}</span></span>
              <span>Empties BF: <span className="num font-medium text-foreground">{formatNumber(customer.empties_brought_forward)}</span></span>
            </div>

            {/* Actions */}
            <div className="mt-4 flex items-center gap-2">
              {canWrite ? (
                <Dialog open={txnOpen} onOpenChange={(v) => { setTxnOpen(v); if (!v) resetTxnForm(); }}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus /> Record transaction</Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Record transaction — {customer.name}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submitTxn.submit} className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Type">
                          <Select value={txnType} onValueChange={setTxnType}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="supply">Supply (invoice)</SelectItem>
                              <SelectItem value="payment">Payment received</SelectItem>
                              <SelectItem value="crate_out">Crates sent out</SelectItem>
                              <SelectItem value="crate_return">Crates returned</SelectItem>
                              <SelectItem value="adjustment">Adjustment</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label="Date">
                          <Input type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} />
                        </Field>
                      </div>

                      {(txnType === "supply" || txnType === "adjustment") ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field label="Supply amount">
                            <Input type="number" step="0.01" value={txnAmount} onChange={(e) => setTxnAmount(e.target.value)} placeholder="0.00" className="num" />
                          </Field>
                          <Field label="Amount paid">
                            <Input type="number" step="0.01" value={txnPaid} onChange={(e) => setTxnPaid(e.target.value)} placeholder="0.00" className="num" />
                          </Field>
                        </div>
                      ) : null}

                      {txnType === "payment" ? (
                        <Field label="Payment received">
                          <Input type="number" step="0.01" value={txnPaid} onChange={(e) => setTxnPaid(e.target.value)} placeholder="0.00" className="num" />
                        </Field>
                      ) : null}

                      {(txnType === "crate_out" || txnType === "supply" || txnType === "adjustment") ? (
                        <Field label="Crates delivered (full crates out)">
                          <Input type="number" min={0} value={txnCratesOut} onChange={(e) => setTxnCratesOut(e.target.value)} placeholder="0" className="num" />
                        </Field>
                      ) : null}

                      {(txnType === "crate_return" || txnType === "adjustment") ? (
                        <Field label="Crates returned (empties back)">
                          <Input type="number" min={0} value={txnCratesReturned} onChange={(e) => setTxnCratesReturned(e.target.value)} placeholder="0" className="num" />
                        </Field>
                      ) : null}

                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Reference (optional)">
                          <Input value={txnRef} onChange={(e) => setTxnRef(e.target.value)} placeholder="Sale ID, receipt no..." />
                        </Field>
                        <Field label="Description (optional)">
                          <Input value={txnDesc} onChange={(e) => setTxnDesc(e.target.value)} placeholder="Notes..." />
                        </Field>
                      </div>

                      <FormError message={submitTxn.error} />
                      <div className="flex justify-end pt-2">
                        <AsyncButton busy={submitTxn.busy} onClick={submitTxn.submit}>Record</AsyncButton>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              ) : null}
              <Button variant="outline" size="sm" onClick={handleExportTxns}>Export ledger</Button>
            </div>

            {/* Transaction timeline */}
            <div className="mt-5">
              <div className="mb-2 text-sm font-medium">Transaction history</div>
              {sortedTxns.length === 0 ? (
                <Empty>No transactions recorded yet for this customer.</Empty>
              ) : (
                <table className="ledger">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Description</th>
                      <th className="col-num">Amount</th>
                      <th className="col-num">Paid</th>
                      <th className="col-num">Balance</th>
                      <th className="col-num">Out</th>
                      <th className="col-num">Ret</th>
                      <th className="col-num">Crates</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b-2 border-rule bg-sidebar-accent/10">
                      <td colSpan={3} className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Brought forward</td>
                      <td className="col-num"></td>
                      <td className="col-num"></td>
                      <td className="col-num num font-medium"><Money value={runningBalance} tone="muted" /></td>
                      <td className="col-num"></td>
                      <td className="col-num"></td>
                      <td className="col-num num font-medium">{formatNumber(runningCrates)}</td>
                    </tr>
                    {sortedTxns.map((t: any) => {
                      runningBalance += Number(t.amount ?? 0) - Number(t.amount_paid ?? 0);
                      runningCrates += Number(t.crates_delivered ?? 0) - Number(t.crates_returned ?? 0);
                      return (
                        <tr key={t.id} className="transition-colors duration-200 ease-in-out">
                          <td>{formatDate(t.transaction_date)}</td>
                          <td>
                            <Tag
                              tone={
                                t.type === "supply" ? "warning"
                                  : t.type === "payment" ? "positive"
                                    : t.type === "crate_out" ? "danger"
                                      : t.type === "crate_return" ? "positive"
                                        : "steel"
                              }
                            >
                              {TXN_TYPE_LABELS[t.type] ?? t.type}
                            </Tag>
                          </td>
                          <td className="text-muted-foreground">{t.description || "—"}</td>
                          <td className="col-num">{Number(t.amount) ? <Money value={Number(t.amount)} /> : "—"}</td>
                          <td className="col-num">{Number(t.amount_paid) ? <Money value={Number(t.amount_paid)} tone="positive" /> : "—"}</td>
                          <td className="col-num num font-medium"><Money value={runningBalance} tone={runningBalance > 0 ? "negative" : runningBalance < 0 ? "positive" : "muted"} /></td>
                          <td className="col-num">{t.crates_delivered ? formatNumber(t.crates_delivered) : "—"}</td>
                          <td className="col-num">{t.crates_returned ? formatNumber(t.crates_returned) : "—"}</td>
                          <td className="col-num num font-medium">{formatNumber(runningCrates)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        ) : null}
      </SheetContent>
    </UISheet>
  );
}
