import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { playOrderChime } from "@/lib/alert-sound";

/**
 * Live merchant_orders subscription: refreshes order lists and fires the
 * in-app chime whenever a new order lands while the portal is open.
 */
export function useOrderRealtime(merchantId: string | null | undefined, alert = false) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!merchantId) return;

    const channel = supabase
      .channel(`merchant-orders-${merchantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "merchant_orders",
          filter: `merchant_id=eq.${merchantId}`,
        },
        (payload) => {
          void queryClient.invalidateQueries({ queryKey: ["orders"] });
          const row = payload.new as { status?: string; order_number?: string } | null;
          if (alert && payload.eventType === "INSERT" && row?.status === "pending") {
            playOrderChime();
            toast.success(`New order ${row.order_number ?? ""}`.trim());
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [merchantId, alert, queryClient]);
}
