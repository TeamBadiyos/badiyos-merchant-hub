import type { Key } from "@/lib/i18n";

export const ORDER_STATUSES = [
  "placed",
  "pending",
  "accepted",
  "expert_assigned",
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
  expert_assigned: "statusRiderAssigned",
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

type PaymentShape = {
  status: string;
  payment_mode?: string | null;
  payment_status?: string | null;
};

/**
 * An online order only reaches the shop once the customer's payment is captured.
 * Abandoned checkouts sit at payment_status 'pending' — the backend refuses
 * accept/reject on those, so they must never ring or show action buttons.
 */
export function isPaymentSettled(order: PaymentShape): boolean {
  if (order.payment_mode === "cod") return true;
  return order.payment_status === "paid";
}

/** New order the shop can actually act on right now. */
export function isActionableNewOrder(order: PaymentShape): boolean {
  return isNewOrder(order.status) && isPaymentSettled(order);
}

/** New order still waiting on the customer's payment — show, but no actions. */
export function isAwaitingPayment(order: PaymentShape): boolean {
  return isNewOrder(order.status) && !isPaymentSettled(order);
}

/** Merchant can only move an order to Ready — delivery is owned by the Expert. */
export const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  accepted: "ready",
  preparing: "ready",
  expert_assigned: "ready",
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
