import type { Key } from "@/lib/i18n";

export const ORDER_STATUSES = [
  "placed",
  "pending",
  "accepted",
  "preparing",
  "ready",
  "delivered",
  "completed",
  "rejected",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number] | "paid";

export const STATUS_LABEL: Record<OrderStatus, Key> = {
  placed: "statusPlaced",
  paid: "statusPlaced",
  pending: "statusPending",
  accepted: "statusAccepted",
  preparing: "statusPreparing",
  ready: "statusReady",
  delivered: "statusDelivered",
  completed: "statusCompleted",
  rejected: "statusRejected",
  cancelled: "statusCancelled",
};

/** Statuses that mean "waiting for the shop to accept". */
export const NEW_STATUSES = ["placed", "paid", "pending"];
export const isNewOrder = (s: string) => NEW_STATUSES.includes(s);

/** Merchant can only move an order to Ready — delivery is owned by the Expert. */
export const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  accepted: "ready",
  preparing: "ready",
};

export const NEXT_STATUS_LABEL: Record<string, Key> = {
  ready: "markReady",
};

export const REJECT_REASONS = [
  { code: "OUT_OF_STOCK", label: "reasonOutOfStock" },
  { code: "STORE_CLOSED", label: "reasonStoreClosed" },
  { code: "TECHNICAL_ISSUE", label: "reasonTechnical" },
  { code: "OTHER", label: "reasonOther" },
] as const satisfies readonly { code: string; label: Key }[];

export const ACCEPT_WINDOW_MS = 5 * 60 * 1000;

export function statusTone(status: string): string {
  switch (status) {
    case "pending":
    case "placed":
    case "paid":
      return "bg-primary-soft text-accent-foreground";
    case "rejected":
    case "cancelled":
      return "bg-destructive/10 text-destructive";
    case "completed":
    case "delivered":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-primary/10 text-primary";
  }
}

export const inr = (v: number | string | null | undefined) =>
  `₹${Number(v ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
