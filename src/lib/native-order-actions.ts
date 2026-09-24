import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

/** The lock-screen alert only offers "Open". Accept/Reject always happen in-app. */
export type NativeOrderAction = { order_id: string; decision: string };

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
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<NativeOrderAction>).detail;
      if (!detail?.order_id) return;
      // Never decide from the native layer — just open the orders screen.
      void navigate({ to: "/orders" });
    };

    window.addEventListener(NATIVE_ORDER_ACTION_EVENT, handler as EventListener);
    const w = window as unknown as { __badiyosPendingOrderAction?: NativeOrderAction };
    if (w.__badiyosPendingOrderAction) {
      const pending = w.__badiyosPendingOrderAction;
      delete w.__badiyosPendingOrderAction;
      handler(new CustomEvent(NATIVE_ORDER_ACTION_EVENT, { detail: pending }));
    }
    return () => window.removeEventListener(NATIVE_ORDER_ACTION_EVENT, handler as EventListener);
  }, [navigate]);
}
