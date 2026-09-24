import { useQuery } from "@tanstack/react-query";
import { Check, Loader2, Timer, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { RejectReasonDialog } from "@/components/RejectReasonDialog";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { playOrderChime } from "@/lib/alert-sound";
import { useAuth } from "@/lib/auth";
import { hapticNotify } from "@/lib/haptics";
import { useI18n } from "@/lib/i18n";
import { useDecideOrder } from "@/lib/order-actions";
import { ACCEPT_WINDOW_MS, inr, NEW_STATUSES } from "@/lib/order-status";
import { fetchOrders, type OrderWithItems } from "@/lib/orders";

/** Pops up for every order waiting on the shop. The countdown is display-only — the backend auto-rejects. */
export function NewOrderSheet() {
  const { merchant, can } = useAuth();
  const enabled =
    Boolean(merchant?.id) && merchant?.status === "approved" && can("manage_orders");
  const orders = useQuery({
    queryKey: ["orders", "new", merchant?.id],
    enabled,
    queryFn: () => fetchOrders(NEW_STATUSES),
  });
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const chimed = useRef<Set<string>>(new Set());

  const current = (orders.data ?? [])
    .slice()
    .reverse()
    .find((o) => !dismissed.has(o.id));

  useEffect(() => {
    if (current && !chimed.current.has(current.id)) {
      chimed.current.add(current.id);
      playOrderChime();
      hapticNotify("warning");
    }
  }, [current]);

  if (!current) return null;
  return (
    <Drawer
      open
      onOpenChange={(v) => !v && setDismissed((s) => new Set(s).add(current.id))}
    >
      <SheetBody
        key={current.id}
        order={current}
        onDone={() => setDismissed((s) => new Set(s).add(current.id))}
      />
    </Drawer>
  );
}

function SheetBody({ order, onDone }: { order: OrderWithItems; onDone: () => void }) {
  const { t } = useI18n();
  const [rejectOpen, setRejectOpen] = useState(false);
  const decide = useDecideOrder(order.id, onDone);
  const deadline = new Date(order.placed_at ?? order.created_at).getTime() + ACCEPT_WINDOW_MS;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, deadline - now);
  const mm = Math.floor(left / 60000);
  const ss = Math.floor((left % 60000) / 1000);

  return (
    <DrawerContent className="safe-bottom mx-auto max-w-[520px] rounded-t-3xl">
      <DrawerHeader className="text-left">
        <DrawerTitle className="text-lg font-extrabold">{t("newOrderArrived")}</DrawerTitle>
        <p className="num text-sm font-semibold text-muted-foreground">
          {t("orderNo")} {order.order_number}
        </p>
      </DrawerHeader>
      <div className="space-y-4 px-4 pb-6">
        <div
          className={`flex items-center gap-3 rounded-2xl p-3 ${
            left > 0 ? "bg-primary-soft" : "bg-destructive/10"
          }`}
        >
          <Timer className={`size-5 ${left > 0 ? "text-primary" : "text-destructive"}`} />
          {left > 0 ? (
            <p className="text-sm font-bold text-foreground">
              {t("acceptWithin")}{" "}
              <span className="num text-lg font-extrabold text-primary">
                {mm}:{String(ss).padStart(2, "0")}
              </span>
            </p>
          ) : (
            <p className="text-sm font-bold text-destructive">{t("timeUp")}</p>
          )}
        </div>

        <ul className="max-h-56 space-y-2 overflow-y-auto">
          {order.merchant_order_items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3 text-sm">
              <span className="text-foreground">
                <span className="num font-bold">{i.quantity} ×</span> {i.product_name_snapshot}
              </span>
            </li>
          ))}
        </ul>
        <p className="num text-lg font-extrabold text-primary">
          {t("total")}: {inr(order.total_amount)}
        </p>

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="h-12 flex-1 rounded-xl border-destructive/40 font-bold text-destructive"
            disabled={decide.isPending}
            onClick={() => setRejectOpen(true)}
          >
            <X className="size-4" />
            {t("reject")}
          </Button>
          <Button
            className="h-12 flex-1 rounded-xl font-bold shadow-brand"
            disabled={decide.isPending}
            onClick={() => {
              hapticNotify("success");
              decide.mutate({ decision: "accepted" });
            }}
          >
            {decide.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            {t("accept")}
          </Button>
        </div>
      </div>
      <RejectReasonDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        busy={decide.isPending}
        onConfirm={(reason) => decide.mutate({ decision: "rejected", reason })}
      />
    </DrawerContent>
  );
}
