import type { Key } from "@/lib/i18n";
import type { Database } from "@/integrations/supabase/types";

export type StoreHour = Database["public"]["Tables"]["merchant_store_hours"]["Row"];
export type ScheduleOverride = Database["public"]["Tables"]["merchant_schedule_overrides"]["Row"];

/** day_of_week uses 0 = Sunday to match JS `Date#getDay()`. */
export const DAYS: { day: number; key: Key }[] = [
  { day: 1, key: "dayMon" },
  { day: 2, key: "dayTue" },
  { day: 3, key: "dayWed" },
  { day: 4, key: "dayThu" },
  { day: 5, key: "dayFri" },
  { day: 6, key: "daySat" },
  { day: 0, key: "daySun" },
];

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

export type OpenState =
  | { kind: "unset" }
  | { kind: "closed"; reason?: string | null }
  | { kind: "open"; till: string }
  | { kind: "outside"; from: string; till: string };

/**
 * Derived customer-facing availability: the manual `is_accepting_orders`
 * toggle AND the schedule must both allow orders. Mirrors the database
 * helper `public.merchant_is_currently_open(uuid)`, which is the source of
 * truth for anything customer-facing.
 */
export type Availability = {
  open: boolean;
  reason: "open" | "manual_off" | "outside_hours" | "closed_today" | "not_approved";
};

export function availabilityFor(
  merchant: { status?: string | null; is_accepting_orders?: boolean | null } | null | undefined,
  state: OpenState,
): Availability {
  if (!merchant) return { open: false, reason: "not_approved" };
  if (merchant.status !== "approved") return { open: false, reason: "not_approved" };
  if (merchant.is_accepting_orders !== true) return { open: false, reason: "manual_off" };
  if (state.kind === "closed") return { open: false, reason: "closed_today" };
  if (state.kind === "outside") return { open: false, reason: "outside_hours" };
  // "unset" means no weekly timings yet — fall back to the manual toggle.
  return { open: true, reason: "open" };
}

/** Current open/closed state from the weekly hours plus any date override. */
export function openStateFor(
  hours: StoreHour[] | undefined,
  overrides: ScheduleOverride[] | undefined,
  now = new Date(),
): OpenState {
  const iso = todayIso();
  const override = (overrides ?? []).find((o) => o.override_date === iso);
  if (override?.is_closed) return { kind: "closed", reason: override.note };

  const row = (hours ?? []).find((h) => h.day_of_week === now.getDay());
  if (!row) return { kind: "unset" };
  if (row.is_closed || !row.open_time || !row.close_time) return { kind: "closed" };

  const mins = now.getHours() * 60 + now.getMinutes();
  const toMin = (v: string) => {
    const [h = "0", m = "0"] = v.split(":");
    return Number(h) * 60 + Number(m);
  };
  const open = toMin(row.open_time);
  const close = toMin(row.close_time);
  if (mins >= open && mins < close) return { kind: "open", till: hhmm(row.close_time) };
  return { kind: "outside", from: hhmm(row.open_time), till: hhmm(row.close_time) };
}