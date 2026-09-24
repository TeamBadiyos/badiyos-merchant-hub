import { Bike, Check, KeyRound, Loader2, Phone, X } from "lucide-react";
import { useState } from "react";

import { RejectReasonDialog } from "@/components/RejectReasonDialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { hapticImpact, hapticNotify } from "@/lib/haptics";
import { useI18n, type Key } from "@/lib/i18n";
import { useDecideOrder, useMarkReady, useOrderRider, usePickupInfo } from "@/lib/order-actions";
import {
  inr,
  isActionableNewOrder,
  isAwaitingPayment,
  NEXT_STATUS,
  NEXT_STATUS_LABEL,
  STATUS_LABEL,
  statusTone,
  type OrderStatus,
} from "@/lib/order-status";
import { itemsSummary, type OrderWithItems } from "@/lib/orders";

export function OrderCard({ order }: { order: OrderWithItems }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const status = order.status as OrderStatus;
  const next = NEXT_STATUS[status];
  const [rejectOpen, setRejectOpen] = useState(false);

  const decide = useDecideOrder(order.id, () => setRejectOpen(false));
  const ready = useMarkReady(order.id);
  const busy = decide.isPending || ready.isPending;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="num truncate text-sm font-extrabold text-foreground">
            {t("orderNo")} {order.order_number}
          </p>
          <p className="num text-xs font-semibold text-muted-foreground">
            {new Date(order.created_at).toLocaleString("en-IN", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-bold ${statusTone(order.status)}`}
        >
          {t(STATUS_LABEL[status] ?? "statusPending")}
        </span>
      </div>

      <p className="mt-3 text-sm text-foreground">{itemsSummary(order)}</p>
      <p className="num mt-2 text-base font-extrabold text-primary">
        {t("total")}: {inr(order.total_amount)}
      </p>
      {order.reject_reason && status === "rejected" && (
        <p className="mt-1 text-xs font-semibold text-destructive">{order.reject_reason}</p>
      )}

      {order.courier_order_id && <DeliveryStatus order={order} />}

      {can("manage_orders") && (
        <>
          {isAwaitingPayment(order) && (
            <div className="mt-4 rounded-xl bg-muted p-3">
              <p className="text-xs font-bold text-foreground">{t("awaitingPayment")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("awaitingPaymentNote")}</p>
            </div>
          )}

          {isActionableNewOrder(order) && (
            <div className="mt-4 flex gap-3">
              <Button
                variant="outline"
                className="flex-1 rounded-xl border-destructive/40 font-bold text-destructive"
                disabled={busy}
                onClick={() => {
                  hapticNotify("warning");
                  setRejectOpen(true);
                }}
              >
                <X className="size-4" />
                {t("reject")}
              </Button>
              <Button
                className="flex-1 rounded-xl font-bold shadow-brand"
                disabled={busy}
                onClick={() => {
                  hapticNotify("success");
                  decide.mutate({ decision: "accepted" });
                }}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                {t("accept")}
              </Button>
            </div>
          )}

          {next && (
            <Button
              className="mt-4 w-full rounded-xl font-bold"
              disabled={busy}
              onClick={() => {
                hapticImpact("medium");
                ready.mutate();
              }}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {t(NEXT_STATUS_LABEL[next]!)}
            </Button>
          )}
        </>
      )}

      <RejectReasonDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        busy={decide.isPending}
        onConfirm={(reason) => decide.mutate({ decision: "rejected", reason })}
      />
    </div>
  );
}

const STEPS: Key[] = ["riderFinding", "riderArriving", "riderAtShop", "riderPickedUp", "riderDelivered"];

function DeliveryStatus({ order }: { order: OrderWithItems }) {
  const { t } = useI18n();
  const done = Boolean(order.delivered_at) || order.status === "delivered";
  const pickedUp = done || Boolean(order.picked_up_at);
  const cancelled = order.status === "cancelled" || order.status === "rejected";
  const pickup = usePickupInfo(order.id, !pickedUp && !cancelled);
  const rider = useOrderRider(order.id, !done && !cancelled);

  const courier = pickup.data?.courier_status?.toUpperCase() ?? "";
  let step = 0;
  if (done) step = 4;
  else if (pickedUp) step = 3;
  else if (pickup.data?.ok) step = 2;
  else if (rider.data?.name) step = 1;
  else if (/ASSIGNED|ACCEPTED|EN_ROUTE|ARRIVING|ON_THE_WAY/.test(courier)) step = 1;
  const courierCancelled = /CANCEL/.test(courier);

  return (
    <div className="mt-4 rounded-xl border border-primary/20 bg-primary-soft p-3">
      <p className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
        <Bike className="size-4 text-primary" />
        {t("deliveryStatus")}
      </p>
      <p className="mt-1 text-sm font-extrabold text-foreground">
        {cancelled || courierCancelled ? t("riderCancelled") : t(STEPS[step]!)}
      </p>
      {!cancelled && !courierCancelled && (
        <div className="mt-2 flex gap-1">
          {STEPS.map((k, i) => (
            <span
              key={k}
              className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-border"}`}
            />
          ))}
        </div>
      )}

      {rider.data?.name && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-card p-3">
          <p className="min-w-0 truncate text-sm font-bold text-foreground">{rider.data.name}</p>
          {rider.data.phone && (
            <Button asChild size="sm" className="shrink-0 rounded-xl font-bold">
              <a href={`tel:${rider.data.phone}`}>
                <Phone className="size-4" />
                {t("callRider")}
              </a>
            </Button>
          )}
        </div>
      )}

      {step === 2 && pickup.data?.otp && (
        <div className="mt-3 rounded-xl bg-card p-3 text-center">
          <p className="flex items-center justify-center gap-1 text-[11px] font-bold text-muted-foreground">
            <KeyRound className="size-3.5" />
            {t("pickupOtp")}
          </p>
          <p className="num mt-1 text-4xl font-extrabold tracking-[0.3em] text-primary">
            {pickup.data.otp}
          </p>
          <p className="mt-1 text-xs font-semibold text-foreground">{t("pickupOtpNote")}</p>
        </div>
      )}
    </div>
  );
}
