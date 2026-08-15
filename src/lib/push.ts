import { useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";

/**
 * Registers this device's FCM token into the shared `device_tokens` table as
 * `user_type = 'merchant'`, `user_id = <merchant id>`.
 *
 * Web builds are a no-op: the plugin only exists inside the Capacitor shell.
 */
async function registerToken(merchantId: string, token: string, platform: string) {
  const { error } = await supabase.from("device_tokens").upsert(
    {
      user_type: "merchant",
      user_id: merchantId,
      fcm_token: token,
      platform,
      last_used_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "fcm_token" },
  );
  if (error) console.error("[push] token upsert failed", error.message);
}

export function usePushRegistration(merchantId: string | null | undefined) {
  useEffect(() => {
    if (!merchantId) return;
    let disposed = false;
    const cleanups: Array<() => void> = [];

    const setup = async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;
      const { PushNotifications } = await import("@capacitor/push-notifications");

      let perm = await PushNotifications.checkPermissions();
      if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
        perm = await PushNotifications.requestPermissions();
      }
      if (perm.receive !== "granted" || disposed) return;

      const reg = await PushNotifications.addListener("registration", (t) => {
        void registerToken(merchantId, t.value, Capacitor.getPlatform());
      });
      cleanups.push(() => void reg.remove());

      const err = await PushNotifications.addListener("registrationError", (e) => {
        console.error("[push] registration error", e);
      });
      cleanups.push(() => void err.remove());

      await PushNotifications.register();
    };

    void setup();
    return () => {
      disposed = true;
      cleanups.forEach((fn) => fn());
    };
  }, [merchantId]);
}