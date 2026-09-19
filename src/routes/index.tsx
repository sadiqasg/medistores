import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => { const { data } = await supabase.auth.getUser(); throw redirect({ to: data.user ? "/dashboard" : "/auth" }); },
  head: () => ({ meta: [{ title: "Medina Stores — Secure Business Ledger" }, { name: "description", content: "Sign in to manage Medina Stores inventory, sales, profit and family distributions." }, { property: "og:title", content: "Medina Stores — Secure Business Ledger" }, { property: "og:description", content: "Secure inventory, sales, profit and family distribution ledger." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => null,
});