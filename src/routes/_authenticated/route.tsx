import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const routerState = useRouterState();
  const isLoading = routerState.status === "pending";
  const routeKey = routerState.location.pathname;

  return (
    <AppShell>
      {isLoading ? (
        <div className="flex min-h-[60vh] items-center justify-center">
          <LoaderCircle className="app-loading h-7 w-7 text-muted-foreground" />
        </div>
      ) : (
        <div key={routeKey} className="page-enter">
          <Outlet />
        </div>
      )}
    </AppShell>
  );
}
