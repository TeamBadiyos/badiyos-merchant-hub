import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";

const EVENT = "badiyos:deepLink";
const SAFE = /^\/delivery(\/[A-Za-z0-9_-]+)*$/;

function linkFromData(data: Record<string, unknown> | undefined): string | null {
  if (!data || data["type"] !== "business_delivery") return null;
  const trip = data["courier_order_id"];
  return typeof trip === "string" && trip ? `/delivery/trip/${trip}` : "/delivery/wallet";
}

/**
 * Opens Wallet or the trip when a delivery alert is tapped (native tap bridge
 * or Capacitor action), and shows a toast for alerts arriving in the foreground.
 */
export function useDeliveryDeepLinks() {
  const navigate = useNavigate();

  useEffect(() => {
    const open = (link: string | null) => {
      if (link && SAFE.test(link)) void navigate({ to: link });
    };
    const handler = (e: Event) => open((e as CustomEvent<string>).detail);
    window.addEventListener(EVENT, handler);
    const w = window as unknown as { __badiyosPendingDeepLink?: string };
    if (w.__badiyosPendingDeepLink) {
      const l = w.__badiyosPendingDeepLink;
      delete w.__badiyosPendingDeepLink;
      open(l);
    }

    const cleanups: Array<() => void> = [];
    void (async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const a = await PushNotifications.addListener("pushNotificationActionPerformed", (ev) =>
        open(linkFromData(ev.notification.data as Record<string, unknown>)),
      );
      const r = await PushNotifications.addListener("pushNotificationReceived", (n) => {
        const data = n.data as Record<string, unknown>;
        const link = linkFromData(data);
        if (!link) return;
        toast(String(data["title"] ?? n.title ?? "badiyos"), {
          description: String(data["body"] ?? n.body ?? ""),
          action: { label: "Open", onClick: () => open(link) },
        });
      });
      cleanups.push(() => void a.remove(), () => void r.remove());
    })();

    return () => {
      window.removeEventListener(EVENT, handler);
      cleanups.forEach((f) => f());
    };
  }, [navigate]);
}
