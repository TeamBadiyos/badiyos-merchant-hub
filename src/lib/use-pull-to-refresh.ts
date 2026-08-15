import { useCallback, useEffect, useRef, useState } from "react";

import { hapticSelection } from "./haptics";

const THRESHOLD = 72;
const MAX_PULL = 110;
const RESIST = 0.55;

/**
 * Native-style pull-to-refresh for a scroll container.
 *
 * Only engages when the container is already at the top and the drag is
 * clearly vertical, so horizontal swipe rows and normal scrolling keep working.
 * Browser pull-to-refresh is disabled globally via `overscroll-behavior-y: none`.
 */
export function usePullToRefresh(
  scrollRef: React.RefObject<HTMLElement | null>,
  onRefresh?: () => Promise<unknown> | void,
) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const state = useRef({ startY: 0, startX: 0, active: false, locked: false, armed: false });

  const run = useCallback(async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
      setPull(0);
    }
  }, [onRefresh]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !onRefresh) return;

    const s = state.current;

    const onStart = (e: TouchEvent) => {
      if (refreshing || e.touches.length !== 1) return;
      const touch = e.touches[0]!;
      s.startY = touch.clientY;
      s.startX = touch.clientX;
      s.active = el.scrollTop <= 0;
      s.locked = false;
      s.armed = false;
    };

    const onMove = (e: TouchEvent) => {
      if (!s.active || refreshing) return;
      const touch = e.touches[0]!;
      const dy = touch.clientY - s.startY;
      const dx = touch.clientX - s.startX;
      if (!s.locked) {
        if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return;
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) {
          s.active = false;
          return;
        }
        s.locked = true;
      }
      if (el.scrollTop > 0) {
        s.active = false;
        setPull(0);
        return;
      }
      e.preventDefault();
      const next = Math.min(MAX_PULL, dy * RESIST);
      if (!s.armed && next >= THRESHOLD) {
        s.armed = true;
        hapticSelection();
      }
      if (s.armed && next < THRESHOLD) s.armed = false;
      setPull(next);
    };

    const onEnd = () => {
      if (!s.active) return;
      s.active = false;
      if (s.armed) {
        setPull(THRESHOLD);
        void run();
      } else {
        setPull(0);
      }
      s.armed = false;
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [scrollRef, onRefresh, refreshing, run]);

  return { pull, refreshing, threshold: THRESHOLD };
}
