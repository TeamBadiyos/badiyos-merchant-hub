/**
 * Haptic feedback that works in three environments:
 * - Capacitor native shell -> @capacitor/haptics
 * - Android browsers       -> navigator.vibrate
 * - Anything else          -> silent no-op
 *
 * Every call is fire-and-forget and can never throw into UI code.
 */

type Style = "light" | "medium" | "heavy";

const VIBRATE_MS: Record<Style, number> = { light: 10, medium: 20, heavy: 35 };

let nativeHaptics: typeof import("@capacitor/haptics") | null | undefined;

async function loadNative() {
  if (nativeHaptics !== undefined) return nativeHaptics;
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) {
      nativeHaptics = null;
      return nativeHaptics;
    }
    nativeHaptics = await import("@capacitor/haptics");
  } catch {
    nativeHaptics = null;
  }
  return nativeHaptics;
}

function fallback(ms: number) {
  if (typeof navigator === "undefined") return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignore */
  }
}

/** Short tap for taps, toggles and confirmations. */
export function hapticImpact(style: Style = "light") {
  if (typeof window === "undefined") return;
  void loadNative().then((mod) => {
    if (!mod) return fallback(VIBRATE_MS[style]);
    const s = mod.ImpactStyle[style === "light" ? "Light" : style === "medium" ? "Medium" : "Heavy"];
    return mod.Haptics.impact({ style: s }).catch(() => fallback(VIBRATE_MS[style]));
  });
}

/** Success / warning / error pattern for outcome feedback. */
export function hapticNotify(kind: "success" | "warning" | "error" = "success") {
  if (typeof window === "undefined") return;
  void loadNative().then((mod) => {
    if (!mod) return fallback(kind === "success" ? 18 : 40);
    const t =
      mod.NotificationType[
        kind === "success" ? "Success" : kind === "warning" ? "Warning" : "Error"
      ];
    return mod.Haptics.notification({ type: t }).catch(() => fallback(18));
  });
}

/** Tick used while dragging past a gesture threshold. */
export function hapticSelection() {
  hapticImpact("light");
}
