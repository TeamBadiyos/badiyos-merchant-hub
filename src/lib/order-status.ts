import type { Key } from "@/lib/i18n";

export const ORDER_STATUSES = [
  "pending",
  "accepted",
  "preparing",
  "ready",
  "completed",
  "rejected",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_LABEL: Record<OrderStatus, Key> = {
  pending: "statusPending",
  accepted: "statusAccepted",
  preparing: "statusPreparing",
  ready: "statusReady",
  completed: "statusCompleted",
  rejected: "statusRejected",
};

/** Next status a merchant can move an accepted order to. */
export const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  accepted: "preparing",
  preparing: "ready",
  ready: "completed",
};

export const NEXT_STATUS_LABEL: Record<string, Key> = {
  preparing: "markPreparing",
  ready: "markReady",
  completed: "markCompleted",
};

export function statusTone(status: string): string {
  switch (status) {
    case "pending":
      return "bg-primary-soft text-accent-foreground";
    case "rejected":
      return "bg-destructive/10 text-destructive";
    case "completed":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-primary/10 text-primary";
  }
}

export const inr = (v: number | string | null | undefined) =>
  `₹${Number(v ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
