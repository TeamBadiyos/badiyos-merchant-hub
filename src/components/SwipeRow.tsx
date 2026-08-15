import { useEffect, useRef, useState, type ReactNode } from "react";

import { hapticImpact, hapticSelection } from "@/lib/haptics";

export type SwipeAction = {
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  tone?: "default" | "destructive";
};

const ACTION_W = 76;

/**
 * iOS-style swipe-to-reveal-actions row: drag the card left to expose the
 * action buttons, tap one to run it. Vertical drags fall through to the
 * scroller so the list still scrolls normally.
 */
export function SwipeRow({
  actions,
  children,
  className = "",
}: {
  actions: SwipeAction[];
  children: ReactNode;
  className?: string;
}) {
  const maxOpen = actions.length * ACTION_W;
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ startX: 0, startY: 0, base: 0, active: false, locked: false, armed: false });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const d = drag.current;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0]!;
      d.startX = touch.clientX;
      d.startY = touch.clientY;
      d.base = offset;
      d.active = true;
      d.locked = false;
      d.armed = false;
    };

    const onMove = (e: TouchEvent) => {
      if (!d.active) return;
      const touch = e.touches[0]!;
      const dx = touch.clientX - d.startX;
      const dy = touch.clientY - d.startY;
      if (!d.locked) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        if (Math.abs(dy) >= Math.abs(dx)) {
          d.active = false;
          return;
        }
        d.locked = true;
        setDragging(true);
      }
      e.preventDefault();
      const next = Math.max(-maxOpen - 24, Math.min(0, d.base + dx));
      if (!d.armed && next <= -maxOpen / 2) {
        d.armed = true;
        hapticSelection();
      }
      if (d.armed && next > -maxOpen / 2) d.armed = false;
      setOffset(next);
    };

    const onEnd = () => {
      if (!d.active) return;
      d.active = false;
      setDragging(false);
      setOffset(d.armed ? -maxOpen : 0);
      d.armed = false;
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
  }, [offset, maxOpen]);

  return (
    <div ref={wrapRef} className={`no-select relative overflow-hidden rounded-2xl ${className}`}>
      <div className="absolute inset-y-0 right-0 flex">
        {actions.map((action) => (
          <button
            key={action.label}
            style={{ width: ACTION_W }}
            onClick={() => {
              hapticImpact("medium");
              setOffset(0);
              action.onSelect();
            }}
            className={`flex flex-col items-center justify-center gap-1 text-[11px] font-bold ${
              action.tone === "destructive"
                ? "bg-destructive text-destructive-foreground"
                : "bg-primary text-primary-foreground"
            }`}
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </div>
      <div
        className={dragging ? "" : "transition-transform duration-200 ease-out"}
        style={{ transform: `translate3d(${offset}px,0,0)` }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Swipe-to-dismiss for notification-style cards (alerts, banners).
 * Fades and slides out in the swipe direction, then calls `onDismiss`.
 */
export function SwipeDismiss({
  onDismiss,
  children,
  className = "",
}: {
  onDismiss: () => void;
  children: ReactNode;
  className?: string;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const d = useRef({ startX: 0, startY: 0, active: false, locked: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const s = d.current;

    const onStart = (e: TouchEvent) => {
      const touch = e.touches[0]!;
      s.startX = touch.clientX;
      s.startY = touch.clientY;
      s.active = true;
      s.locked = false;
    };
    const onMove = (e: TouchEvent) => {
      if (!s.active) return;
      const touch = e.touches[0]!;
      const dx = touch.clientX - s.startX;
      const dy = touch.clientY - s.startY;
      if (!s.locked) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        if (Math.abs(dy) >= Math.abs(dx)) {
          s.active = false;
          return;
        }
        s.locked = true;
        setDragging(true);
      }
      e.preventDefault();
      setOffset(dx);
    };
    const onEnd = () => {
      if (!s.active) return;
      s.active = false;
      setDragging(false);
      const width = el.offsetWidth || 320;
      if (Math.abs(offset) > width * 0.35) {
        hapticImpact("light");
        setOffset(offset > 0 ? width : -width);
        window.setTimeout(onDismiss, 180);
      } else {
        setOffset(0);
      }
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
  }, [offset, onDismiss]);

  return (
    <div
      ref={ref}
      className={`no-select ${dragging ? "" : "transition-all duration-200 ease-out"} ${className}`}
      style={{
        transform: `translate3d(${offset}px,0,0)`,
        opacity: Math.max(0, 1 - Math.abs(offset) / 220),
      }}
    >
      {children}
    </div>
  );
}
