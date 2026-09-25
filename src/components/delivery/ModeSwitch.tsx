import { useNavigate } from "@tanstack/react-router";

import { useI18n } from "@/lib/i18n";
import { useAppMode } from "@/lib/delivery/mode";

/** "Store | Delivery" pill, shown only when the business has both. */
export function ModeSwitch({ current }: { current: "store" | "delivery" }) {
  const { t } = useI18n();
  const { both, setMode } = useAppMode();
  const navigate = useNavigate();
  if (!both) return null;

  const go = (m: "store" | "delivery") => {
    setMode(m);
    void navigate({ to: m === "store" ? "/home" : "/delivery", replace: true });
  };

  return (
    <div className="flex rounded-full bg-primary-foreground/15 p-0.5 text-[11px] font-bold">
      {(["store", "delivery"] as const).map((m) => (
        <button
          key={m}
          onClick={() => m !== current && go(m)}
          className={`rounded-full px-2.5 py-1 transition-colors ${
            m === current ? "bg-primary-foreground text-primary" : "text-primary-foreground"
          }`}
        >
          {t(m === "store" ? "modeStore" : "modeDelivery")}
        </button>
      ))}
    </div>
  );
}
