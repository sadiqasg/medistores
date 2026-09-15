import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_CURRENCY, type Currency } from "@/lib/money";

export type Role = "admin" | "family_viewer" | "staff";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return null;
      const [{ data: roles }, { data: profile }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      ]);
      const roleList = (roles ?? []).map((r) => r.role as Role);
      const role: Role = roleList.includes("admin")
        ? "admin"
        : roleList.includes("staff")
          ? "staff"
          : "family_viewer";
      return { user, role, profile };
    },
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ["business_settings"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("business_settings").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useCurrency(): Currency {
  const { data } = useSettings();
  return data
    ? { code: data.currency_code, symbol: data.currency_symbol }
    : DEFAULT_CURRENCY;
}
