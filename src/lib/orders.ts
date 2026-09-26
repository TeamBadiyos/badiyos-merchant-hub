import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type OrderItem = Database["public"]["Tables"]["merchant_order_items"]["Row"];
export type OrderWithItems = Database["public"]["Tables"]["merchant_orders"]["Row"] & {
  merchant_order_items: OrderItem[];
};

const SELECT = "*, merchant_order_items(*)";

/** Midnight in India time, as an ISO timestamp for server-side filtering. */
export function startOfTodayIso(): string {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - 5.5 * 3600_000).toISOString();
}

/**
 * RLS scopes every read to the caller's shop (owner or linked staff).
 * `since`/`limit` keep mobile payloads small — never pull the whole history
 * just to compute today's numbers.
 */
export async function fetchOrders(
  statuses?: string[],
  opts?: { since?: string; limit?: number },
): Promise<OrderWithItems[]> {
  let query = supabase
    .from("merchant_orders")
    .select(SELECT)
    .or("payment_mode.eq.cod,payment_status.eq.paid")
    .order("created_at", { ascending: false });
  if (statuses?.length) query = query.in("status", statuses);
  if (opts?.since) query = query.gte("created_at", opts.since);
  query = query.limit(opts?.limit ?? 200);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as OrderWithItems[];
}

export function itemsSummary(order: OrderWithItems): string {
  const items = order.merchant_order_items ?? [];
  if (!items.length) return "—";
  return items.map((i) => `${i.quantity} × ${i.product_name_snapshot}`).join(", ");
}
