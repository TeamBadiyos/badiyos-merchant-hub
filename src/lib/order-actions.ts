import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

export function friendlyOrderError(message: string): string {
  if (message.includes("order_not_found_or_not_pending"))
    return "This order is no longer waiting — refresh to see its latest status.";
  if (message.includes("reason_required")) return "Please pick a reason to reject.";
  if (message.includes("delivery_managed_by_expert"))
    return "Delivery is managed by the rider for this order.";
  if (message.includes("invalid_transition")) return "That status change is not allowed right now.";
  if (message.includes("not_permitted")) return "Your role cannot update orders.";
  return "Could not update the order. Please try again.";
}

type Decision = { decision: "accepted" | "rejected"; reason?: string };

export function useDecideOrder(orderId: string, onDone?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ decision, reason }: Decision) => {
      const { error } = await supabase.rpc("merchant_decide_order", {
        _order_id: orderId,
        _decision: decision,
        _reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["orders"] });
      onDone?.();
    },
    onError: (e: Error) => toast.error(friendlyOrderError(e.message)),
  });
}

export function useMarkReady(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("merchant_advance_order", {
        _order_id: orderId,
        _new_status: "ready",
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["orders"] }),
    onError: (e: Error) => toast.error(friendlyOrderError(e.message)),
  });
}

export type PickupInfo = { ok: boolean; otp?: string; courier_status?: string; reason?: string };

/** Polls the backend for the Expert's status / pickup OTP while the rider hasn't picked up yet. */
export function usePickupInfo(orderId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["orders", "pickup", orderId],
    enabled,
    refetchInterval: enabled ? 10_000 : false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("merchant_get_pickup_otp", { _order_id: orderId });
      if (error) throw error;
      return (data ?? { ok: false }) as unknown as PickupInfo;
    },
  });
}
