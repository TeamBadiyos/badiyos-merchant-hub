import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Clock,
  IndianRupee,
  Loader2,
  PackageOpen,
  RefreshCw,
  Star,
  TrendingUp,
} from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { SwipeDismiss } from "@/components/SwipeRow";
import { AccessDenied, PendingApproval } from "@/components/GateNotice";
import { OrderCard } from "@/components/OrderCard";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { inr, isActionableNewOrder, isNewOrder } from "@/lib/order-status";
import { fetchOrders } from "@/lib/orders";
import { supabase } from "@/integrations/supabase/client";
import { useAvailability } from "@/lib/use-availability";
import { useOrderRealtime } from "@/lib/use-order-realtime";
import { useRequireAuth } from "@/lib/use-require-auth";

export const Route = createFileRoute("/home")({
  head: () => ({
    meta: [
      { title: "Shop dashboard — badiyos Merchant Portal" },
      {
        name: "description",
        content:
          "Accept new orders live, track today's sales and move orders through preparing, ready and completed.",
      },
      { property: "og:title", content: "Shop dashboard — badiyos" },
      {
        property: "og:description",
        content: "Live incoming orders, today's sales and rating for your badiyos shop.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HomePage,
});


const LIVE = ["placed", "paid", "pending", "accepted", "preparing", "ready"];

function HomePage() {
  const { t } = useI18n();
  const { can } = useAuth();
  const merchant = useRequireAuth();
  const [lowStockDismissed, setLowStockDismissed] = useState(false);
  const allowed = can("view_orders");

  useOrderRealtime(merchant?.id, allowed);

  const live = useQuery({
    queryKey: ["orders", "live", merchant?.id],
    enabled: Boolean(merchant?.id) && allowed && merchant?.status === "approved",
    queryFn: () => fetchOrders(LIVE),
  });

  const today = useQuery({
    queryKey: ["orders", "today", merchant?.id],
    enabled: Boolean(merchant?.id) && allowed && merchant?.status === "approved",
    queryFn: () => fetchOrders(),
  });

  const lowStock = useQuery({
    queryKey: ["products", "low-stock", merchant?.id],
    enabled: Boolean(merchant?.id) && merchant?.status === "approved",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, stock_quantity, low_stock_threshold, is_active")
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []).filter((p) => p.stock_quantity <= p.low_stock_threshold);
    },
  });

  const { schedule, openState, availability } = useAvailability();

  if (!merchant) return null;

  const openLabel =
    openState.kind === "open"
      ? `${t("openNow")} · ${t("openTill")} ${openState.till}`
      : openState.kind === "outside"
        ? `${t("closed")} · ${openState.from}–${openState.till}`
        : openState.kind === "closed"
          ? t("closedTodayMsg")
          : t("scheduleNotSet");

  const availLabel = availability.open
    ? t("availOpen")
    : availability.reason === "outside_hours"
      ? t("availPausedSchedule")
      : availability.reason === "closed_today"
        ? t("availPausedClosedDay")
        : t("availPausedManual");

  const lowStockCount = lowStock.data?.length ?? 0;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const todays = (today.data ?? []).filter((o) => new Date(o.created_at) >= startOfDay);
  const sales = todays
    .filter((o) => !["rejected", "cancelled"].includes(o.status))
    .reduce((sum, o) => sum + Number(o.total_amount ?? 0), 0);

  // Online checkouts still waiting on the customer's payment are not the shop's
  // orders yet — the backend refuses accept/reject on them, so keep them out.
  const pending = (live.data ?? []).filter((o) => isActionableNewOrder(o));
  const inProgress = (live.data ?? []).filter(
    (o) => !isNewOrder(o.status),
  );

  const stats = [
    { label: t("todayOrders"), value: String(todays.length), icon: PackageOpen },
    { label: t("todaySales"), value: inr(sales), icon: IndianRupee },
    { label: t("rating"), value: "—", icon: Star },
  ];

  return (
    <AppShell
      title={t("home")}
      onRefresh={() =>
        Promise.all([live.refetch(), today.refetch(), lowStock.refetch(), schedule.refetch()])
      }
    >
      <div className="space-y-5">
        {merchant.status !== "approved" ? (
          <PendingApproval />
        ) : !allowed ? (
          <AccessDenied />
        ) : (
          <>
            {/* Compact status strip — replaces the old greeting + status + timings cards */}
            <Link
              to="/settings"
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2 shadow-card"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={`size-2 shrink-0 rounded-full ${
                    availability.open ? "bg-primary" : "bg-destructive"
                  }`}
                />
                <span
                  className={`truncate text-xs font-bold ${
                    availability.open ? "text-foreground" : "text-destructive"
                  }`}
                >
                  {availability.open ? t("openNow") : availLabel}
                </span>
              </span>
              <span className="num flex shrink-0 items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                <Clock className="size-3.5" />
                {openLabel}
              </span>
            </Link>

            {/* New orders — the merchant's primary job, kept at the top */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
                  <TrendingUp className="size-5 text-primary" />
                  {t("newOrders")}
                  {pending.length > 0 && (
                    <span className="num rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
                      {pending.length}
                    </span>
                  )}
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-primary"
                  onClick={() => void live.refetch()}
                >
                  {live.isFetching ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  {t("refresh")}
                </Button>
              </div>

              {pending.length === 0 ? (
                <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-card">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft">
                    <PackageOpen className="size-5 text-primary" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground">{t("noOrders")}</p>
                    <p className="truncate text-xs text-muted-foreground">{t("noOrdersSub")}</p>
                  </div>
                </div>
              ) : (
                pending.map((order) => <OrderCard key={order.id} order={order} />)
              )}
            </div>

            {inProgress.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-base font-bold text-foreground">{t("inProgress")}</h2>
                {inProgress.map((order) => (
                  <OrderCard key={order.id} order={order} />
                ))}
              </div>
            )}

            {/* Secondary: today's numbers */}
            <div className="grid grid-cols-3 gap-3">
              {stats.map(({ label, value, icon: Icon }) => (
                <div
                  key={label}
                  className="rounded-2xl border border-border bg-card p-3 shadow-card"
                >
                  <Icon className="size-4 text-primary" />
                  <p className="num mt-1.5 text-base font-extrabold text-foreground">{value}</p>
                  <p className="text-[11px] leading-tight font-semibold text-muted-foreground">
                    {label}
                  </p>
                </div>
              ))}
            </div>

            {lowStockCount > 0 && can("manage_products") && !lowStockDismissed && (
              <SwipeDismiss onDismiss={() => setLowStockDismissed(true)}>
                <Link
                  to="/products"
                  search={{ low: true }}
                  className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2"
                >
                  <AlertTriangle className="size-4 shrink-0 text-destructive" />
                  <p className="num min-w-0 truncate text-xs font-bold text-destructive">
                    {lowStockCount} {t("lowStockBanner")}
                  </p>
                </Link>
              </SwipeDismiss>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
