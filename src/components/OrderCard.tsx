import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { hapticImpact, hapticNotify } from "@/lib/haptics";
import { useI18n } from "@/lib/i18n";
import {
  inr,
  NEXT_STATUS,
  NEXT_STATUS_LABEL,
  STATUS_LABEL,
  statusTone,
  type OrderStatus,
} from "@/lib/order-status";
import { itemsSummary, type OrderWithItems } from "@/lib/orders";

export function OrderCard({ order }: { order: OrderWithItems }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const status = order.status as OrderStatus;
  const next = NEXT_STATUS[status];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["orders"] });

  const decide = useMutation({
    mutationFn: async (decision: "accepted" | "rejected") => {
      const { error } = await supabase.rpc("merchant_decide_order", {
        _order_id: order.id,
        _decision: decision,
      });
      if (error) throw error;
    },
    onSuccess: () => void invalidate(),
    onError: (error: Error) => toast.error(friendlyError(error.message)),
  });

  const advance = useMutation({
    mutationFn: async (newStatus: string) => {
      const { error } = await supabase.rpc("merchant_advance_order", {
        _order_id: order.id,
        _new_status: newStatus,
      });
      if (error) throw error;
    },
    onSuccess: () => void invalidate(),
    onError: (error: Error) => toast.error(friendlyError(error.message)),
  });

  const busy = decide.isPending || advance.isPending;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="num truncate text-sm font-extrabold text-foreground">
            {t("orderNo")} {order.order_number}
          </p>
          <p className="num text-xs font-semibold text-muted-foreground">
            {new Date(order.created_at).toLocaleString("en-IN", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-bold ${statusTone(order.status)}`}
        >
          {t(STATUS_LABEL[status] ?? "statusPending")}
        </span>
      </div>

      <p className="mt-3 text-sm text-foreground">{itemsSummary(order)}</p>
      <p className="num mt-2 text-base font-extrabold text-primary">
        {t("total")}: {inr(order.total_amount)}
      </p>

      {can("manage_orders") && (
        <>
          {status === "pending" && (
            <div className="mt-4 flex gap-3">
              <Button
                variant="outline"
                className="flex-1 rounded-xl border-destructive/40 font-bold text-destructive"
                disabled={busy}
                onClick={() => {
                  hapticNotify("warning");
                  decide.mutate("rejected");
                }}
              >
                <X className="size-4" />
                {t("reject")}
              </Button>
              <Button
                className="flex-1 rounded-xl font-bold shadow-brand"
                disabled={busy}
                onClick={() => {
                  hapticNotify("success");
                  decide.mutate("accepted");
                }}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                {t("accept")}
              </Button>
            </div>
          )}

          {next && (
            <Button
              className="mt-4 w-full rounded-xl font-bold"
              disabled={busy}
              onClick={() => {
                hapticImpact("medium");
                advance.mutate(next);
              }}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {t(NEXT_STATUS_LABEL[next]!)}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function friendlyError(message: string): string {
  if (message.includes("order_not_found_or_not_pending"))
    return "This order is no longer pending — refresh to see its latest status.";
  if (message.includes("invalid_transition")) return "That status change is not allowed right now.";
  if (message.includes("not_permitted")) return "Your role cannot update orders.";
  return "Could not update the order. Please try again.";
}
