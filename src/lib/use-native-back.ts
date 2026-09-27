import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";

/**
 * Android hardware/gesture back button handling for the Capacitor shell.
 *
 * Priority:
 * 1. Close the topmost open overlay (Radix dialog / sheet / popover / select)
 *    by sending Escape, so back never skips past a modal.
 * 2. Go back in the router history.
 * 3. On the first screen of the stack, minimise the app instead of leaving a
 *    blank WebView.
 *
 * On the web (no Capacitor) this hook is a no-op: the browser's own back
 * button already does the right thing.
 */
export function useNativeBack() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    let remove: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("backButton", () => {
          const overlay = document.querySelector(
            '[data-state="open"][role="dialog"], [data-state="open"][role="menu"], [data-state="open"][role="listbox"], [data-radix-popper-content-wrapper] [data-state="open"]',
          );
          if (overlay) {
            document.dispatchEvent(
              new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
            );
            return;
          }
          if (router.history.canGoBack()) {
            router.history.back();
            return;
          }
          void App.minimizeApp().catch(() => undefined);
        });
        if (cancelled) void handle.remove();
        else remove = () => void handle.remove();
      } catch {
        /* native plugin unavailable - browser back handles it */
      }
    })();

    return () => {
      cancelled = true;
      remove?.();
    };
  }, [router]);
}
