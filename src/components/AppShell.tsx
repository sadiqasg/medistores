import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Menu, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useSettings } from "@/hooks/useMe";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type NavItem = { to: string; label: string };

const ADMIN_NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/inventory", label: "Inventory" },
  { to: "/sales", label: "Sales" },
  { to: "/expenses", label: "Expenses" },
  { to: "/profit-loss", label: "Profit & Loss" },
  { to: "/distributions", label: "Distributions" },
  { to: "/settings", label: "Settings" },
];

const STAFF_NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/inventory", label: "Inventory" },
  { to: "/sales", label: "Sales" },
];

const VIEWER_NAV: NavItem[] = [
  { to: "/dashboard", label: "Overview" },
  { to: "/my-payouts", label: "My Payouts" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const { data: settings } = useSettings();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const nav =
    me?.role === "admin" ? ADMIN_NAV : me?.role === "staff" ? STAFF_NAV : VIEWER_NAV;

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    await navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen md:flex">
      <aside className="bg-sidebar text-sidebar-foreground md:w-60 md:shrink-0">
        <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-3.5">
          <div>
            <div className="font-serif text-base font-semibold leading-tight">
              {settings?.business_name ?? "Medina Stores"}
            </div>
            <div className="text-[0.66rem] uppercase tracking-[0.18em] opacity-60">
              {me?.role === "admin"
                ? "Owner ledger"
                : me?.role === "staff"
                  ? "Operations"
                  : "Family view"}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden p-1"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle navigation"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>

        <nav className={cn("px-2 py-2 md:block", open ? "block" : "hidden")}>
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className="block px-2 py-2 text-sm hover:bg-sidebar-accent"
              activeProps={{
                className:
                  "block px-2 py-2 text-sm bg-sidebar-accent border-l-2 border-primary font-medium",
              }}
            >
              {item.label}
            </Link>
          ))}
          <div className="mt-3 border-t border-sidebar-border pt-3">
            <div className="px-2 pb-2 text-xs opacity-60 truncate">{me?.user.email}</div>
            <Button
              variant="ghost"
              onClick={signOut}
              className="flex w-full justify-start px-2 py-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </div>
        </nav>
      </aside>

      <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
