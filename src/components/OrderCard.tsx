import { Bike, Check, ChevronDown, KeyRound, Loader2, MessageSquareText, Phone, Timer, X } from "lucide-react";
import { useEffect, useState } from "react";

import { RejectReasonDialog } from "@/components/RejectReasonDialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { hapticImpact, hapticNotify } from "@/lib/haptics";
import { useI18n, type Key } from "@/lib/i18n";
import {
  useAcceptDeadline,
  useDecideOrder,
  useMarkReady,
  useOrderRider,
  usePickupInfo,
} from "@/lib/order-actions";
import {
  inr,
  isActionableNewOrder,
  NEXT_STATUS,
  NEXT_STATUS_LABEL,
  STATUS_LABEL,
  statusTone,
  type OrderStatus,
} from "@/lib/order-status";
import type { OrderItem, OrderWithItems } from "@/lib/orders";

type Addon = { name: string; price?: number | undefined };

/** Add-ons are saved as JSON; accept arrays of strings or {name, price}. */
export function parseAddons(raw: unknown): Addon[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a): Addon | null => {
      if (typeof a === "string") return { name: a };
      if (a && typeof a === "object") {
        const o = a as Record<string, unknown>;
        const name = String(o["name"] ?? o["label"] ?? o["title"] ?? "");
        if (!name) return null;
        const price = o["price"] ?? o["amount"];
        return { name, price: price == null ? undefined : Number(price) };
      }
      return null;
    })
    .filter((a): a is Addon => a !== null);
}

const lineTotal = (i: OrderItem) =>
  Number(i.line_total ?? Number(i.unit_price ?? i.price_snapshot) * i.quantity);

function ItemsList({ order, showPrice }: { order: OrderWithItems; showPrice: boolean }) {
  const { t } = useI18n();
  const items = order.merchant_order_items ?? [];
  if (!items.length) return <p className="mt-3 text-sm text-muted-foreground">—</p>;
  return (
    <ul className="mt-3 space-y-2">
      {items.map((i) => {
        const addons = parseAddons(i.addons);
        return (
          <li key={i.id} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">
                <span className="num">{i.quantity} ×</span> {i.product_name_snapshot}
                {i.variant_name && (
                  <span className="ml-1.5 rounded-md bg-primary-soft px-1.5 py-0.5 text-[10px] font-bold text-accent-foreground">
                    {i.variant_name}
                  </span>
                )}
                {i.is_mrp_snapshot && (
                  <span className="ml-1.5 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                    MRP
                  </span>
                )}
              </p>
              {addons.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t("addonsLabel")}:{" "}
                  {addons
                    .map((a) => (showPrice && a.price ? `${a.name} (${inr(a.price)})` : a.name))
                    .join(", ")}
                </p>
              )}
            </div>
            {showPrice && (
              <p className="num shrink-0 text-sm font-bold text-foreground">{inr(lineTotal(i))}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Countdown({ until }: { until: string }) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const left = Math.max(0, new Date(until).getTime() - now);
  const mm = Math.floor(left / 60_000);
  const ss = Math.floor((left % 60_000) / 1000);
  const urgent = left < 60_000;
  return (
    <span
      className={`num inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-extrabold ${
        urgent ? "bg-destructive/10 text-destructive" : "bg-primary-soft text-accent-foreground"
      }`}
    >
      <Timer className="size-3.5" />
      {t("acceptIn")} {mm}:{String(ss).padStart(2, "0")}
    </span>
  );
}

export function OrderCard({
  order,
  hero = false,
}: {
  order: OrderWithItems;
  hero?: boolean;
}) {
  const { t } = useI18n();
  const { can, context } = useAuth();
  const isOwner = context.isOwner;
  const status = order.status as OrderStatus;
  const next = NEXT_STATUS[status];
  const [rejectOpen, setRejectOpen] = useState(false);
  const [open, setOpen] = useState(hero);

  const decide = useDecideOrder(order.id, () => setRejectOpen(false));
  const ready = useMarkReady(order.id);
  const busy = decide.isPending || ready.isPending;
  const actionable = isActionableNewOrder(order);
  const deadline = useAcceptDeadline(order.id, actionable);
  const itemCount = (order.merchant_order_items ?? []).reduce((s, i) => s + i.quantity, 0);
  const closed = status === "rejected" || status === "cancelled";

  return (
    <div
      className={`rounded-2xl border bg-card shadow-card ${
        hero ? "border-primary p-5 ring-2 ring-primary/20" : "border-border p-4"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`num truncate font-extrabold text-foreground ${hero ? "text-lg" : "text-sm"}`}>
            {t("orderNo")} {order.order_number}
          </p>
          <p className="num text-xs font-semibold text-muted-foreground">
            {itemCount} {t("itemsCount")} ·{" "}
            {new Date(order.created_at).toLocaleString("en-IN", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        {actionable && deadline.data ? (
          <Countdown until={deadline.data} />
        ) : (
          <span className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-bold ${statusTone(order.status)}`}>
            {t(STATUS_LABEL[status] ?? "statusPending")}
          </span>
        )}
      </div>

      <ItemsList order={order} showPrice={open} />

      {order.customer_note && (
        <div className="mt-3 flex gap-2 rounded-xl bg-primary-soft p-3">
          <MessageSquareText className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="text-sm text-foreground">
            <span className="font-bold">{t("customerNote")}: </span>
            {order.customer_note}
          </p>
        </div>
      )}

      <p className={`num mt-3 font-extrabold text-primary ${hero ? "text-2xl" : "text-base"}`}>
        {t("total")}: {inr(order.total_amount)}
      </p>
      {order.reject_reason && closed && (
        <p className="mt-1 text-xs font-semibold text-destructive">{order.reject_reason}</p>
      )}

      {order.courier_order_id && !closed && <DeliveryStatus order={order} />}

      {can("manage_orders") && (
        <>
          {actionable && (
            <div className="mt-4 flex gap-3">
              <Button
                variant="outline"
                className={`rounded-xl border-destructive/40 font-bold text-destructive ${hero ? "h-14 w-1/3" : "flex-1"}`}
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
                className={`flex-1 rounded-xl font-bold shadow-brand ${hero ? "h-14 text-lg" : ""}`}
                disabled={busy}
                onClick={() => {
                  hapticNotify("success");
                  decide.mutate({ decision: "accepted" });
                }}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-5" />}
                {t("accept")}
              </Button>
            </div>
          )}

          {next && (
            <Button
              className="mt-4 h-12 w-full rounded-xl font-bold"
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

      {!hero && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="mt-3 flex w-full items-center justify-center gap-1 text-xs font-bold text-primary"
        >
          {open ? t("hideDetails") : t("showDetails")}
          <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      )}

      {open && !hero && (
        <>
          <Timeline order={order} />
          {isOwner && !closed && <Settlement order={order} />}
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

function Timeline({ order }: { order: OrderWithItems }) {
  const { t } = useI18n();
  const closed = order.status === "rejected" || order.status === "cancelled";
  const rows: { k: Key; at: string | null }[] = [
    { k: "tlPlaced", at: order.paid_at ?? order.placed_at ?? order.created_at },
    { k: "tlAccepted", at: order.accepted_at },
    { k: "tlReady", at: order.ready_at },
    { k: "tlPickedUp", at: order.picked_up_at },
    { k: "tlDelivered", at: order.delivered_at },
  ];
  if (closed) rows.push({ k: "tlCancelled", at: order.cancelled_at ?? order.updated_at });
  const fmt = (v: string) =>
    new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="mt-3 rounded-xl border border-border p-3">
      <p className="text-xs font-bold uppercase text-muted-foreground">{t("timeline")}</p>
      <ol className="mt-2 space-y-2">
        {rows.map(({ k, at }) => (
          <li key={k} className="flex items-center gap-3">
            <span
              className={`size-2.5 shrink-0 rounded-full ${
                at ? (k === "tlCancelled" ? "bg-destructive" : "bg-primary") : "bg-border"
              }`}
            />
            <span className={`flex-1 text-xs font-bold ${at ? "text-foreground" : "text-muted-foreground"}`}>
              {t(k)}
            </span>
            <span className="num text-xs text-muted-foreground">{at ? fmt(at) : "—"}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Read-only money split saved on the order by the backend (Owner only).
 * The delivery fee is never the shop's income, so it is not shown here.
 */
function Settlement({ order }: { order: OrderWithItems }) {
  const { t } = useI18n();
  const items = Number(order.item_total ?? order.items_total ?? 0);
  const pct = Number(order.commission_pct ?? 0);
  const commission = Number(order.commission_amount ?? 0);
  const gst = Number(order.commission_gst_amount ?? 0);
  const tcs = Number(order.tcs_amount ?? 0);
  const tds = Number(order.tds_amount ?? 0);
  const net = Number(order.merchant_net ?? 0);
  const b = (order.commission_breakdown ?? null) as Record<string, unknown> | null;
  const split = b && b["mode"] === "split";
  const n = (k: string) => Number((b?.[k] as number | string | undefined) ?? 0);

  return (
    <div className="mt-3 space-y-1 rounded-xl bg-muted/60 p-3">
      <Line label={t("itemsTotalLabel")} value={inr(items)} />
      {split ? (
        <>
          <Line
            label={`├ ${t("mrpItems")} (${inr(n("mrp_total"))} @ ${n("mrp_pct")}%)`}
            value={`- ${inr(n("mrp_amount"))}`}
          />
          <Line
            label={`└ ${t("otherItems")} (${inr(n("other_total"))} @ ${n("other_pct")}%)`}
            value={`- ${inr(n("other_amount"))}`}
          />
          <Line label={t("platformCommission")} value={`- ${inr(commission)}`} />
        </>
      ) : (
        <Line label={`${t("commissionLabel")} (${pct}%)`} value={`- ${inr(commission)}`} />
      )}
      {gst > 0 && <Line label={t("gstOnCommission")} value={`- ${inr(gst)}`} />}
      {tcs > 0 && <Line label={t("tcsLabel")} value={`- ${inr(tcs)}`} />}
      {tds > 0 && <Line label={t("tdsLabel")} value={`- ${inr(tds)}`} />}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-2">
        <p className="text-xs font-bold text-foreground">{t("youReceive")}</p>
        <p className="num text-sm font-extrabold text-primary">{inr(net)}</p>
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="num text-xs font-bold text-foreground">{value}</p>
    </div>
  );
}

const STEPS: Key[] = ["riderFinding", "riderArriving", "riderAtShop", "riderPickedUp", "riderDelivered"];

function DeliveryStatus({ order }: { order: OrderWithItems }) {
  const { t } = useI18n();
  const done = Boolean(order.delivered_at) || order.status === "delivered";
  const pickedUp = done || Boolean(order.picked_up_at);
  const pickup = usePickupInfo(order.id, !pickedUp);
  const rider = useOrderRider(order.id, !done);

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
        {order.status === "ready" ? t("waitingRider") : t("deliveryStatus")}
      </p>
      <p className="mt-1 text-sm font-extrabold text-foreground">
        {courierCancelled ? t("riderCancelled") : t(STEPS[step]!)}
      </p>
      {!courierCancelled && (
        <div className="mt-2 flex gap-1">
          {STEPS.map((k, i) => (
            <span key={k} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-border"}`} />
          ))}
        </div>
      )}

      {rider.data?.name && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-card p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-foreground">{rider.data.name}</p>
            {!pickedUp && rider.data.distance_m != null && (
              <p className="num text-xs font-bold text-primary">
                {rider.data.distance_m <= 100
                  ? t("riderAtStore")
                  : `${t("riderAway").replace("{d}", `${(rider.data.distance_m / 1000).toFixed(1)} km`)} · ~${Math.max(
                      1,
                      Math.round(rider.data.distance_m / 1000 / (15 / 60)),
                    )} min`}
              </p>
            )}
          </div>
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

      {!pickedUp && pickup.data?.otp && (
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
