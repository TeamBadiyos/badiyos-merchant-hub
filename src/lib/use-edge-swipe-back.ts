import { useEffect, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";

import { hapticSelection } from "./haptics";

const EDGE = 28;
const COMMIT = 80;

/**
 * iOS-style edge-swipe-from-left to go back.
 *
 * The gesture only starts inside the left edge strip, tracks the finger so the
 * screen follows it, and commits to `history.back()` past the threshold.
 * `canGoBack` guards against swiping off the first screen in the stack.
 */
export function useEdgeSwipeBack(enabled = true) {
  const router = useRouter();
  const [dragX, setDragX] = useState(0);
  const [animating, setAnimating] = useState(false);
  const state = useRef({ active: false, startX: 0, startY: 0, armed: false });

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const s = state.current;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0]!;
      s.active = touch.clientX <= EDGE;
      s.startX = touch.clientX;
      s.startY = touch.clientY;
      s.armed = false;
      if (s.active) setAnimating(false);
    };

    const onMove = (e: TouchEvent) => {
      if (!s.active) return;
      const touch = e.touches[0]!;
      const dx = touch.clientX - s.startX;
      const dy = touch.clientY - s.startY;
      if (dx < 0 || Math.abs(dy) > Math.abs(dx) + 12) {
        s.active = false;
        setDragX(0);
        return;
      }
      e.preventDefault();
      if (!s.armed && dx >= COMMIT) {
        s.armed = true;
        hapticSelection();
      }
      if (s.armed && dx < COMMIT) s.armed = false;
      setDragX(Math.min(dx, window.innerWidth));
    };

    const onEnd = () => {
      if (!s.active) return;
      s.active = false;
      setAnimating(true);
      if (s.armed) {
        setDragX(window.innerWidth);
        window.setTimeout(() => {
          setDragX(0);
          setAnimating(false);
          if (router.history.canGoBack()) router.history.back();
          else void router.navigate({ to: "/home" });
        }, 180);
      } else {
        setDragX(0);
      }
      s.armed = false;
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [enabled, router]);

  return { dragX, animating };
}
