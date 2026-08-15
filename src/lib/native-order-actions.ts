import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

export type NativeOrderAction = { order_id: string; decision: "accepted" | "rejected" };

export const NATIVE_ORDER_ACTION_EVENT = "badiyos:orderAction";

/**
 * Bridge for the Android full-screen ringing alert.
 *
 * The native ringing activity never talks to Supabase itself (it holds no auth
 * session). It hands the decision to the WebView, which runs the same
 * `merchant_decide_order` RPC the in-app Accept/Reject buttons use — merchant
 * orders have a real `rejected` status, so Reject is NOT a local-only dismiss
 * like the Partner App's booking-broadcast pattern.
 */
export function useNativeOrderActions() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    const handler = async (event: Event) => {
      const detail = (event as CustomEvent<NativeOrderAction>).detail;
      if (!detail?.order_id || !detail.decision) return;
      const { error } = await supabase.rpc("merchant_decide_order", {
        _order_id: detail.order_id,
        _decision: detail.decision,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success(detail.decision === "accepted" ? "Order accepted" : "Order rejected");
      if (detail.decision === "accepted") void navigate({ to: "/orders" });
    };

    window.addEventListener(NATIVE_ORDER_ACTION_EVENT, handler as EventListener);

    // Drain anything the native layer queued before React mounted.
    const w = window as unknown as { __badiyosPendingOrderAction?: NativeOrderAction };
    if (w.__badiyosPendingOrderAction) {
      const pending = w.__badiyosPendingOrderAction;
      delete w.__badiyosPendingOrderAction;
      void handler(new CustomEvent(NATIVE_ORDER_ACTION_EVENT, { detail: pending }));
    }

    return () => window.removeEventListener(NATIVE_ORDER_ACTION_EVENT, handler as EventListener);
  }, [queryClient, navigate]);
}