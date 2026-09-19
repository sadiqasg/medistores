import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const checked = async <T,>(request: PromiseLike<{ data: T; error: { message: string } | null }>) => {
  const { data, error } = await request; if (error) throw new Error(error.message); return data;
};

export function useProducts(activeOnly = false) { return useQuery({ queryKey: ["products", activeOnly], queryFn: () => checked(supabase.from("products").select("*").order("name").then((r) => activeOnly ? { ...r, data: (r.data ?? []).filter((p) => p.is_active) } : r)) }); }
export function useSales(from?: string, to?: string) { return useQuery({ queryKey: ["sales", from, to], queryFn: () => { let q = supabase.from("sales").select("*").order("sale_date", { ascending: false }).order("created_at", { ascending: false }); if (from) q = q.gte("sale_date", from); if (to) q = q.lte("sale_date", to); return checked(q); } }); }
export function useSaleItems() { return useQuery({ queryKey: ["sale_items"], queryFn: () => checked(supabase.from("sale_items").select("*, products(name, sku)").order("created_at", { ascending: false })) }); }
export function useExpenses(from?: string, to?: string) { return useQuery({ queryKey: ["expenses", from, to], queryFn: () => { let q = supabase.from("expenses").select("*").order("date", { ascending: false }); if (from) q = q.gte("date", from); if (to) q = q.lte("date", to); return checked(q); } }); }
export function useTransactions() { return useQuery({ queryKey: ["inventory_transactions"], queryFn: () => checked(supabase.from("inventory_transactions").select("*, products(name, sku)").order("created_at", { ascending: false }).limit(100)) }); }
export function useShares() { return useQuery({ queryKey: ["ownership_shares"], queryFn: () => checked(supabase.from("ownership_shares").select("*").order("effective_from", { ascending: false })) }); }
export function useDistributions() { return useQuery({ queryKey: ["profit_distributions"], queryFn: () => checked(supabase.from("profit_distributions").select("*, ownership_shares(stakeholder_name, share_percentage)").order("date", { ascending: false }).order("created_at", { ascending: false })) }); }
export function useProfiles() { return useQuery({ queryKey: ["profiles"], queryFn: () => checked(supabase.from("profiles").select("*").order("full_name")) }); }
