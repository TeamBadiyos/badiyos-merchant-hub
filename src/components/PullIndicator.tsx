import { Loader2 } from "lucide-react";

/** Native-style spinner that follows the finger during pull-to-refresh. */
export function PullIndicator({
  pull,
  refreshing,
  threshold,
}: {
  pull: number;
  refreshing: boolean;
  threshold: number;
}) {
  const visible = refreshing || pull > 2;
  const progress = Math.min(1, pull / threshold);
  return (
    <div
      aria-hidden={!visible}
      className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
      style={{
        transform: `translate3d(0, ${Math.max(0, pull) - 44}px, 0)`,
        opacity: visible ? 1 : 0,
        transition: refreshing ? "transform 200ms ease-out" : undefined,
      }}
    >
      <span className="flex size-10 items-center justify-center rounded-full border border-border bg-card shadow-card">
        <Loader2
          className={`size-5 text-primary ${refreshing ? "animate-spin" : ""}`}
          style={refreshing ? undefined : { transform: `rotate(${progress * 300}deg)`, opacity: 0.4 + progress * 0.6 }}
        />
      </span>
    </div>
  );
}
