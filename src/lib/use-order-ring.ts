import { useEffect } from "react";

import { playOrderChime } from "@/lib/alert-sound";

/**
 * Loud repeating chime + vibration while at least one new order is waiting.
 * Stops as soon as `active` turns false (accepted / rejected / expired).
 * Background ringing is handled by the native push service, not here.
 */
export function useOrderRing(active: boolean) {
  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    const ring = () => {
      playOrderChime();
      try {
        navigator.vibrate?.([400, 200, 400]);
      } catch {
        /* vibration not supported */
      }
    };
    ring();
    const id = window.setInterval(ring, 2500);
    return () => {
      window.clearInterval(id);
      try {
        navigator.vibrate?.(0);
      } catch {
        /* ignore */
      }
    };
  }, [active]);
}
