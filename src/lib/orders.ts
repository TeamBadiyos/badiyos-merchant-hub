import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type OrderItem = Database["public"]["Tables"]["merchant_order_items"]["Row"];
export type OrderWithItems = Database["public"]["Tables"]["merchant_orders"]["Row"] & {
  merchant_order_items: OrderItem[];
};

const SELECT = "*, merchant_order_items(*)";

/** RLS scopes every read to the caller's shop (owner or linked staff). */
export async function fetchOrders(statuses?: string[]): Promise<OrderWithItems[]> {
  let query = supabase
    .from("merchant_orders")
    .select(SELECT)
    .order("created_at", { ascending: false });
  if (statuses?.length) query = query.in("status", statuses);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as OrderWithItems[];
}

export function itemsSummary(order: OrderWithItems): string {
  const items = order.merchant_order_items ?? [];
  if (!items.length) return "—";
  return items.map((i) => `${i.quantity} × ${i.product_name_snapshot}`).join(", ");
}
