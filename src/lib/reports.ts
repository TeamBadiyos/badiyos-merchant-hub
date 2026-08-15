import { supabase } from "@/integrations/supabase/client";

export type RangeKey = "today" | "week" | "month" | "custom";

export type Range = { from: Date; to: Date };

function startOfDay(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}
function endOfDay(d: Date) {
  const c = new Date(d);
  c.setHours(23, 59, 59, 999);
  return c;
}

/** Resolve a preset (or a custom pair of yyyy-mm-dd strings) into a date range. */
export function resolveRange(key: RangeKey, fromStr?: string, toStr?: string): Range {
  const now = new Date();
  if (key === "today") return { from: startOfDay(now), to: endOfDay(now) };
  if (key === "week") {
    const day = (now.getDay() + 6) % 7; // Monday-first
    const from = startOfDay(new Date(now));
    from.setDate(from.getDate() - day);
    return { from, to: endOfDay(now) };
  }
  if (key === "month") {
    const from = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
    return { from, to: endOfDay(now) };
  }
  const from = fromStr ? startOfDay(new Date(fromStr)) : startOfDay(now);
  const to = toStr ? endOfDay(new Date(toStr)) : endOfDay(now);
  return { from, to };
}

export type CompletedOrder = {
  id: string;
  created_at: string;
  total_amount: number;
  commission_amount: number | null;
  merchant_order_items: {
    product_id: string;
    product_name_snapshot: string;
    quantity: number;
    price_snapshot: number;
  }[];
};

/** Completed orders in range, with their items — RLS scopes this to the caller's shop. */
export async function fetchCompletedOrders(range: Range): Promise<CompletedOrder[]> {
  const { data, error } = await supabase
    .from("merchant_orders")
    .select(
      "id, created_at, total_amount, commission_amount, merchant_order_items(product_id, product_name_snapshot, quantity, price_snapshot)",
    )
    .eq("status", "completed")
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString())
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CompletedOrder[];
}

export function summarise(orders: CompletedOrder[]) {
  const revenue = orders.reduce((sum, o) => sum + Number(o.total_amount ?? 0), 0);
  const commission = orders.reduce((sum, o) => sum + Number(o.commission_amount ?? 0), 0);
  return {
    count: orders.length,
    revenue,
    commission,
    net: revenue - commission,
    average: orders.length ? revenue / orders.length : 0,
  };
}

const dayKey = (iso: string) => new Date(iso).toISOString().slice(0, 10);

/** Revenue bucketed per day across the range, including empty days. */
export function revenueSeries(orders: CompletedOrder[], range: Range) {
  const buckets = new Map<string, number>();
  const cursor = startOfDay(range.from);
  const last = startOfDay(range.to);
  while (cursor <= last && buckets.size < 400) {
    buckets.set(cursor.toISOString().slice(0, 10), 0);
    cursor.setDate(cursor.getDate() + 1);
  }
  for (const order of orders) {
    const key = dayKey(order.created_at);
    buckets.set(key, (buckets.get(key) ?? 0) + Number(order.total_amount ?? 0));
  }
  return [...buckets.entries()].map(([date, revenue]) => ({
    date,
    label: new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
    revenue: Math.round(revenue),
  }));
}

/** Top 10 products by quantity sold across completed orders. */
export function topProducts(orders: CompletedOrder[]) {
  const map = new Map<string, { name: string; quantity: number; revenue: number }>();
  for (const order of orders) {
    for (const item of order.merchant_order_items ?? []) {
      const key = item.product_id ?? item.product_name_snapshot;
      const entry = map.get(key) ?? { name: item.product_name_snapshot, quantity: 0, revenue: 0 };
      entry.quantity += Number(item.quantity ?? 0);
      entry.revenue += Number(item.quantity ?? 0) * Number(item.price_snapshot ?? 0);
      map.set(key, entry);
    }
  }
  return [...map.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 10);
}
