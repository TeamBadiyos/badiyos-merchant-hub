import { bizRpc } from "./api";
import type { DKey } from "./i18n";

export type SealCheck = {
  ok: boolean;
  code: string | null;
  error: string | null;
  detail?: { order_id: string; display_no: string; receiver_name: string | null; date: string } | null;
};

export type SealStock = { available: number; used: number; void: number; avg_used_per_day_7d: number };

export const sealCheck = (mid: string, raw: string) =>
  bizRpc<SealCheck>("business_seal_check", { _merchant_id: mid, _raw: raw }, false);

export const sealStock = (mid: string) =>
  bizRpc<SealStock>("business_seal_stock", { _merchant_id: mid }, false);

export type PacketResult =
  | { ok: true }
  | { ok: false; failed: (SealCheck & { index: number; input: string })[] };

export const createPacketOrders = (
  mid: string,
  receiverId: string,
  pickupId: string,
  codes: string[],
  methods: ("scan" | "manual")[],
) =>
  bizRpc<PacketResult>("business_create_packet_orders", {
    _merchant_id: mid,
    _receiver_id: receiverId,
    _pickup_point_id: pickupId,
    _codes: codes,
    _entry_methods: methods,
  });

/** 1045217 -> 104521-7 (display only; the code itself comes from the backend). */
export function sealDisplay(code: string) {
  const d = code.replace(/\D/g, "");
  return d.length > 1 ? `${d.slice(0, -1)}-${d.slice(-1)}` : code;
}

export function sealErrorText(r: SealCheck, dt: (k: DKey) => string) {
  switch (r.error) {
    case "INVALID_FORMAT":
    case "NOT_FOUND":
      return dt("sealNotBadiyos");
    case "BAD_CHECK_DIGIT":
      return dt("sealBadDigit");
    case "NOT_YOURS":
      return dt("sealNotYours");
    case "VOID":
      return dt("sealVoid");
    case "DUPLICATE_IN_LIST":
      return dt("alreadyAdded");
    case "ALREADY_USED": {
      const d = r.detail;
      if (!d) return dt("sealUsed");
      const date = new Date(d.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
      return `${dt("sealUsed")} — ${dt("orderNoShort")} #${d.display_no}, ${d.receiver_name ?? "—"}, ${date}`;
    }
    default:
      return dt("sealUnknown");
  }
}
