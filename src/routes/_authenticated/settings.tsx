import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, ShieldCheck, UserCog, Eye, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useSettings } from "@/hooks/useMe";
import { PageHeader, Sheet, Empty, Tag } from "@/components/ledger";
import { Field, FormError, AsyncButton, useSubmit } from "@/components/medina/shared";
import { formatDate } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Medina Stores" },
      { name: "description", content: "Business profile and team member management." },
      { property: "og:title", content: "Settings — Medina Stores" },
      { property: "og:description", content: "Business profile and team member management." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

type TeamMember = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  created_at: string;
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  staff: "Staff",
  family_viewer: "Family viewer",
};

const ROLE_ICONS: Record<string, typeof ShieldCheck> = {
  admin: ShieldCheck,
  staff: UserCog,
  family_viewer: Eye,
};

const CURRENCIES = [
  { code: "NGN", symbol: "₦", label: "Nigerian Naira (₦)" },
  { code: "USD", symbol: "$", label: "US Dollar ($)" },
  { code: "EUR", symbol: "€", label: "Euro (€)" },
  { code: "GBP", symbol: "£", label: "British Pound (£)" },
  { code: "GHS", symbol: "₵", label: "Ghanaian Cedi (₵)" },
  { code: "KES", symbol: "KSh", label: "Kenyan Shilling (KSh)" },
  { code: "ZAR", symbol: "R", label: "South African Rand (R)" },
];

function SettingsPage() {
  const me = useMe();
  const isAdmin = me.data?.role === "admin";
  const [tab, setTab] = useState<"business" | "team">("business");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your business profile and team members"
      />

      <div className="flex items-center gap-1 border-b border-rule">
        <button
          onClick={() => setTab("business")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors duration-200 ease-in-out ${tab === "business" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Business profile
        </button>
        <button
          onClick={() => setTab("team")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors duration-200 ease-in-out ${tab === "team" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Team members
        </button>
      </div>

      {tab === "business" ? <BusinessProfile isAdmin={isAdmin} /> : null}
      {tab === "team" ? <TeamMembers isAdmin={isAdmin} /> : null}
    </div>
  );
}

function BusinessProfile({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const settings = useSettings();
  const data = settings.data;

  const [name, setName] = useState(data?.business_name ?? "");
  const [currencyCode, setCurrencyCode] = useState(data?.currency_code ?? "NGN");
  const [categories, setCategories] = useState((data?.categories ?? []).join(", "));
  const [expenseCats, setExpenseCats] = useState((data?.expense_categories ?? []).join(", "));

  // Sync local state when settings load
  const loadedId = data?.id;
  const [syncedId, setSyncedId] = useState<typeof loadedId>(undefined);
  if (loadedId && syncedId !== loadedId) {
    setName(data?.business_name ?? "");
    setCurrencyCode(data?.currency_code ?? "NGN");
    setCategories((data?.categories ?? []).join(", "));
    setExpenseCats((data?.expense_categories ?? []).join(", "));
    setSyncedId(loadedId);
  }

  const save = useSubmit(async () => {
    const payload = {
      business_name: name.trim() || "Medina Stores",
      currency_code: currencyCode,
      currency_symbol: CURRENCIES.find((c) => c.code === currencyCode)?.symbol ?? "₦",
      categories: categories.split(",").map((s) => s.trim()).filter(Boolean),
      expense_categories: expenseCats.split(",").map((s) => s.trim()).filter(Boolean),
    };
    const { error } = await supabase.from("business_settings").update(payload).eq("id", data!.id);
    if (error) throw error;
    toast.success("Business profile saved");
    queryClient.invalidateQueries({ queryKey: ["business_settings"] });
  });

  if (settings.isLoading) {
    return <div className="py-10 text-center text-sm text-muted-foreground">Loading settings…</div>;
  }
  if (settings.isError || !data) {
    return <div className="py-10 text-center text-sm text-primary">Could not load business settings.</div>;
  }

  return (
    <div className="space-y-6">
      <Sheet title="Business details">
        <div className="space-y-4 px-4 py-4">
          <Field label="Business name">
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!isAdmin} placeholder="Medina Stores" />
          </Field>
          <Field label="Currency">
            <Select value={currencyCode} onValueChange={setCurrencyCode} disabled={!isAdmin}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem value={c.code} key={c.code}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </Sheet>

      <Sheet title="Product categories" description="Comma-separated list of categories used in inventory">
        <div className="px-4 py-4">
          <Textarea
            value={categories}
            onChange={(e) => setCategories(e.target.value)}
            disabled={!isAdmin}
            rows={3}
            placeholder="Coca-Cola, Fanta, Sprite, Water, Energy, Other"
          />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {categories.split(",").map((s) => s.trim()).filter(Boolean).map((cat, i) => (
              <Tag key={i} tone="steel">{cat}</Tag>
            ))}
          </div>
        </div>
      </Sheet>

      <Sheet title="Expense categories" description="Comma-separated list of categories used in expenses">
        <div className="px-4 py-4">
          <Textarea
            value={expenseCats}
            onChange={(e) => setExpenseCats(e.target.value)}
            disabled={!isAdmin}
            rows={3}
            placeholder="Rent, Transport, Salaries, Utilities, Maintenance, Other"
          />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {expenseCats.split(",").map((s) => s.trim()).filter(Boolean).map((cat, i) => (
              <Tag key={i} tone="steel">{cat}</Tag>
            ))}
          </div>
        </div>
      </Sheet>

      {isAdmin ? (
        <div className="flex justify-end">
          <AsyncButton busy={save.busy} onClick={save.submit}>Save changes</AsyncButton>
        </div>
      ) : null}

      <FormError message={save.error} />
    </div>
  );
}

function TeamMembers({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const me = useMe();

  const loadMembers = async () => {
    setLoading(true); setLoadError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: "list" }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to load team members");
      }
      const data = await res.json();
      setMembers(data.users ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load team members");
    } finally {
      setLoading(false);
    }
  };

  // Load on mount
  const [loaded, setLoaded] = useState(false);
  if (!loaded) { setLoaded(true); loadMembers(); }

  const [addOpen, setAddOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("staff");

  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [newRole, setNewRole] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<TeamMember | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const callApi = async (body: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not authenticated");
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? "Request failed");
    }
    return res.json();
  };

  const submitInvite = useSubmit(async () => {
    if (!inviteEmail.trim() || !invitePassword.trim()) throw new Error("Email and password are required");
    await callApi({
      action: "create",
      email: inviteEmail.trim(),
      password: invitePassword,
      full_name: inviteName.trim() || null,
      role: inviteRole,
    });
    toast.success(`${inviteEmail} added as ${ROLE_LABELS[inviteRole]}`);
    setInviteEmail(""); setInvitePassword(""); setInviteName(""); setInviteRole("staff");
    setAddOpen(false);
    await loadMembers();
    queryClient.invalidateQueries({ queryKey: ["me"] });
  });

  const handleChangeRole = async (userId: string, role: string) => {
    setBusy(true); setActionError(null);
    try {
      await callApi({ action: "update_role", user_id: userId, role });
      toast.success("Role updated");
      setEditingRole(null);
      await loadMembers();
      queryClient.invalidateQueries({ queryKey: ["me"] });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true); setActionError(null);
    try {
      await callApi({ action: "delete", user_id: deleteTarget.id });
      toast.success(`${deleteTarget.email} removed`);
      setDeleteTarget(null);
      await loadMembers();
      queryClient.invalidateQueries({ queryKey: ["me"] });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to remove user");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="py-10 text-center text-sm text-muted-foreground">Loading team members…</div>;
  }
  if (loadError) {
    return <div className="py-10 text-center text-sm text-primary">{loadError}</div>;
  }

  return (
    <div className="space-y-6">
      <Sheet
        title={`Team members — ${members.length} active`}
        action={isAdmin ? (
          <Dialog open={addOpen} onOpenChange={(v) => { setAddOpen(v); if (!v) { setInviteEmail(""); setInvitePassword(""); setInviteName(""); setInviteRole("staff"); } }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus /> Add member</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add a team member</DialogTitle>
              </DialogHeader>
              <form onSubmit={submitInvite.submit} className="space-y-4">
                <Field label="Full name (optional)">
                  <Input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Jane Doe" />
                </Field>
                <Field label="Email address">
                  <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required placeholder="jane@example.com" />
                </Field>
                <Field label="Temporary password">
                  <Input type="password" value={invitePassword} onChange={(e) => setInvitePassword(e.target.value)} required placeholder="••••••••" />
                </Field>
                <Field label="Role">
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin — full access</SelectItem>
                      <SelectItem value="staff">Staff — sales, inventory, customers</SelectItem>
                      <SelectItem value="family_viewer">Family viewer — dashboard & payouts only</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <FormError message={submitInvite.error} />
                <div className="flex justify-end pt-2">
                  <AsyncButton busy={submitInvite.busy} onClick={submitInvite.submit}>Add member</AsyncButton>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        ) : null}
      >
        {members.length === 0 ? (
          <Empty>No team members found.</Empty>
        ) : (
          <table className="ledger">
            <thead>
              <tr>
                <th>Member</th>
                <th>Email</th>
                <th>Role</th>
                <th>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const Icon = ROLE_ICONS[m.role] ?? Eye;
                const isSelf = m.id === me.data?.user?.id;
                return (
                  <tr key={m.id} className="transition-colors duration-200 ease-in-out">
                    <td className="font-medium">
                      {m.full_name || "—"}
                      {isSelf ? <span className="ml-2 text-xs text-muted-foreground">(you)</span> : null}
                    </td>
                    <td className="text-muted-foreground">{m.email}</td>
                    <td>
                      {editingRole === m.id ? (
                        <Select
                          value={newRole}
                          onValueChange={(v) => { setNewRole(v); void handleChangeRole(m.id, v); }}
                          disabled={busy}
                        >
                          <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="staff">Staff</SelectItem>
                            <SelectItem value="family_viewer">Family viewer</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <button
                          onClick={() => { if (isAdmin && !isSelf) { setEditingRole(m.id); setNewRole(m.role); } }}
                          disabled={!isAdmin || isSelf}
                          className={`inline-flex items-center gap-1.5 ${isAdmin && !isSelf ? "cursor-pointer hover:opacity-70" : "cursor-default"}`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          <Tag tone={m.role === "admin" ? "danger" : m.role === "staff" ? "positive" : "steel"}>
                            {ROLE_LABELS[m.role] ?? m.role}
                          </Tag>
                        </button>
                      )}
                    </td>
                    <td className="text-muted-foreground">{formatDate(m.created_at)}</td>
                    <td>
                      {isAdmin && !isSelf ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-primary"
                          onClick={() => setDeleteTarget(m)}
                          aria-label={`Remove ${m.email}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Sheet>

      {isAdmin ? (
        <div className="rounded-md border border-rule bg-sidebar-accent/20 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            <ShieldCheck className="mr-1.5 inline h-4 w-4 align-text-bottom" />
            Admins have full access to all areas. Staff can manage sales, inventory and customers. Family viewers can only see the dashboard and their own payouts.
          </p>
        </div>
      ) : null}

      {actionError ? <FormError message={actionError} /> : null}

      {busy ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Working…
        </div>
      ) : null}

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove team member?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {deleteTarget?.email}'s account and revoke all access. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Remove permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
