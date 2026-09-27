import { supabase } from "@/integrations/supabase/client";

import { getActorName } from "./mode";

/** Calls a business_* RPC, always sending the device's actor name. */
export async function bizRpc<T = unknown>(
  fn: string,
  args: Record<string, unknown> = {},
  withActor = true,
): Promise<T> {
  const payload = withActor ? { ...args, _actor_label: getActorName() || null } : args;
  const { data, error } = await (supabase.rpc as unknown as (
    f: string,
    a: Record<string, unknown>,
  ) => Promise<{ data: T; error: { message: string } | null }>)(fn, payload);
  if (error) throw new Error(cleanError(error.message));
  return data;
}

export function cleanError(message: string) {
  return message.replace(/^.*?ERROR:\s*/i, "").trim();
}

export type DispatchPlan = {
  name: string;
  manual_enabled: boolean;
  qty_enabled: boolean;
  qty_threshold: number | null;
  slots_enabled: boolean;
  slot_times: string[] | null;
  max_drops_per_batch: number | null;
};

export type PickupPoint = {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  contact_name: string | null;
  contact_phone: string | null;
  is_default: boolean;
  is_active: boolean;
};

export type BusinessProfile = {
  profile: { low_balance_threshold: number | null; business_name: string | null } | null;
  dispatch_plan: DispatchPlan | null;
  pickup_points: PickupPoint[];
};

export type WalletInfo = {
  delivery_wallet_balance: number;
  low_balance_threshold: number;
  entries: { id: string; amount: number; type: string; reason: string | null; created_at: string }[];
};

export type TripStop = {
  stop_id: string;
  stop_type: "pickup" | "drop" | "return";
  sequence: number;
  drop_label: string | null;
  address: string | null;
  receiver_name: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  status: string;
  reference_nos: string[] | null;
  parcel_count: number;
  packets: {
    code: string;
    packet_no: number;
    packet_total: number;
    trip_no: number;
    drop_label: string;
    scanned_pickup_at: string | null;
    scanned_drop_at: string | null;
  }[];
  otp: string | null;
};

export type TripInfo = {
  order_id: string;
  order_code: string | null;
  status: string;
  batch_status: string | null;
  dispatch_run_id: string | null;
  dispatch_date: string | null;
  business_name: string | null;
  run_label: string | null;
  trip_no: number | null;
  trip_label: string | null;
  parcel_count: number;
  rider_available: boolean;
  rider_name: string | null;
  rider_phone: string | null;
  stops: TripStop[];
  batch_id: string | null;
  trip_amount: number;
  can_cancel: boolean;
  cancel_fee_preview: number;
  refund_preview: number;
};

export type TripRider = {
  available: boolean;
  name?: string | null;
  phone?: string | null;
  photo_url?: string | null;
  vehicle?: string | null;
  location?: { lat: number; lng: number; location_updated_at: string | null; stale: boolean } | null;
};

export const getProfile = () => bizRpc<BusinessProfile>("business_get_profile", {}, false);
export const getWallet = () => bizRpc<WalletInfo>("business_get_wallet", {}, false);
export const getTrip = (id: string) =>
  bizRpc<TripInfo>("business_get_trip_otps", { _courier_order_id: id }, false);
export const getTripRider = (id: string) =>
  bizRpc<TripRider>("business_get_trip_rider", { _courier_order_id: id }, false);
export const cancelTrip = (batchId: string, reason: string) =>
  bizRpc<{ ok: boolean; cancellation_fee: number; refund_amount: number }>("business_cancel_trip", {
    _batch_id: batchId,
    _reason: reason,
  });

export type Receiver = {
  id: string;
  name: string;
  contact_name: string | null;
  contact_phone: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  is_active: boolean;
  updated_at: string;
};

export async function listReceivers(): Promise<Receiver[]> {
  const { data, error } = await supabase
    .from("business_receivers")
    .select("id, name, contact_name, contact_phone, address, lat, lng, notes, is_active, updated_at")
    .order("updated_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data ?? []) as Receiver[];
}

export type BizOrder = {
  id: string;
  reference_no: string | null;
  description: string | null;
  packet_count: number;
  status: string;
  courier_order_id: string | null;
  cancel_reason: string | null;
  created_at: string;
  delivered_at: string | null;
  updated_at: string;
  receiver: { name: string; contact_phone: string | null } | null;
  receiver_id: string | null;
  stickers: { code: string }[] | null;
};

export async function listOrders(): Promise<BizOrder[]> {
  const { data, error } = await supabase
    .from("business_orders")
    .select(
      "id, reference_no, description, packet_count, status, courier_order_id, cancel_reason, created_at, delivered_at, updated_at, receiver_id, stickers:business_seal_stickers!business_seal_stickers_business_order_id_fkey(code), receiver:business_receivers!business_orders_receiver_id_fkey(name, contact_phone)",
    )
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data ?? []) as unknown as BizOrder[];
}

export async function listActiveTrips() {
  const { data, error } = await supabase
    .from("business_batches")
    .select("id, status, drops_count, courier_order_id, total_amount, created_at")
    .eq("status", "dispatched")
    .not("courier_order_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

export async function listTopups() {
  const { data, error } = await supabase
    .from("business_wallet_topups")
    .select("id, amount, status, created_at, paid_at, created_by_label")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return data ?? [];
}

export const isPhone10 = (p: string) => /^[6-9]\d{9}$/.test(p);
export const phone10 = (p: string) => p.replace(/\D/g, "").slice(-10);

/** Next slot time today (IST) after now, or the first slot tomorrow. */
export function nextSlot(slots: string[] | null | undefined): string | null {
  if (!slots?.length) return null;
  const now = new Date(Date.now() + 5.5 * 3600_000);
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  const sorted = [...slots].map((s) => s.slice(0, 5)).sort();
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  return sorted.find((s) => toMin(s) > mins) ?? sorted[0] ?? null;
}

export const inr = (n: number | string | null | undefined) =>
  `₹${Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
