import { useEffect, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";

import { hapticSelection } from "./haptics";

const EDGE = 32;
const COMMIT = 80;

/**
 * Edge-swipe to go back, from either screen edge.
 *
 * - Left edge, dragged right  -> classic iOS/Android back.
 * - Right edge, dragged left  -> same back action, mirrored, for phones whose
 *   system gesture bar makes the left edge awkward.
 *
 * The screen follows the finger and commits past the threshold.
 * `canGoBack` guards against swiping off the first screen in the stack.
 */
export function useEdgeSwipeBack(enabled = true, fallbackTo = "/home") {
  const router = useRouter();
  const [dragX, setDragX] = useState(0);
  const [animating, setAnimating] = useState(false);
  const state = useRef({ active: false, startX: 0, startY: 0, armed: false, dir: 1 });

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const s = state.current;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0]!;
      const fromLeft = touch.clientX <= EDGE;
      const fromRight = touch.clientX >= window.innerWidth - EDGE;
      s.dir = fromLeft ? 1 : -1;
      s.active = fromLeft || fromRight;
      s.startX = touch.clientX;
      s.startY = touch.clientY;
      s.armed = false;
      if (s.active) setAnimating(false);
    };

    const onMove = (e: TouchEvent) => {
      if (!s.active) return;
      const touch = e.touches[0]!;
      // Progress measured in the gesture's own direction, so both edges behave alike.
      const travel = (touch.clientX - s.startX) * s.dir;
      const dy = touch.clientY - s.startY;
      if (travel < 0 || Math.abs(dy) > Math.abs(travel) + 12) {
        s.active = false;
        setDragX(0);
        return;
      }
      e.preventDefault();
      if (!s.armed && travel >= COMMIT) {
        s.armed = true;
        hapticSelection();
      }
      if (s.armed && travel < COMMIT) s.armed = false;
      setDragX(Math.min(travel, window.innerWidth) * s.dir);
    };

    const onEnd = () => {
      if (!s.active) return;
      s.active = false;
      setAnimating(true);
      if (s.armed) {
        const dir = s.dir;
        setDragX(window.innerWidth * dir);
        window.setTimeout(() => {
          setDragX(0);
          setAnimating(false);
          if (router.history.canGoBack()) router.history.back();
          else void router.navigate({ to: fallbackTo });
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
  }, [enabled, router, fallbackTo]);

  return { dragX, animating };
}
