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
import { inr } from "@/lib/order-status";
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

function greetingKey() {
  const h = new Date().getHours();
  if (h < 12) return "greetingMorning" as const;
  if (h < 17) return "greetingAfternoon" as const;
  return "greetingEvening" as const;
}

const LIVE = ["pending", "accepted", "preparing", "ready"];

function HomePage() {
  const { t } = useI18n();
  const { can, context } = useAuth();
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
    .filter((o) => o.status !== "rejected")
    .reduce((sum, o) => sum + Number(o.total_amount ?? 0), 0);

  const pending = (live.data ?? []).filter((o) => o.status === "pending");
  const inProgress = (live.data ?? []).filter((o) => o.status !== "pending");

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
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-extrabold text-foreground">
            {t(greetingKey())},{" "}
            {(context.staffName ?? merchant.owner_name ?? "Merchant").split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground">
            {[merchant.address, merchant.city].filter(Boolean).join(", ") || "Latur, Maharashtra"}
          </p>
        </div>

        {merchant.status !== "approved" ? (
          <PendingApproval />
        ) : !allowed ? (
          <AccessDenied />
        ) : (
          <>
            <div
              className={`rounded-2xl border p-4 ${
                availability.open
                  ? "border-primary/30 bg-primary-soft"
                  : "border-destructive/30 bg-destructive/5"
              }`}
            >
              <p
                className={`text-sm font-bold ${
                  availability.open ? "text-foreground" : "text-destructive"
                }`}
              >
                {availLabel}
              </p>
              <p className="mt-1 text-xs font-semibold text-muted-foreground">
                {availability.open ? t("availOpenHint") : t("availPausedHint")}
              </p>
            </div>

            <Link
              to="/settings"
              className={`flex items-center gap-4 rounded-2xl border p-4 ${
                openState.kind === "open"
                  ? "border-primary/30 bg-primary-soft"
                  : "border-border bg-card shadow-card"
              }`}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-background/60">
                <Clock
                  className={`size-5 ${openState.kind === "open" ? "text-primary" : "text-muted-foreground"}`}
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-muted-foreground">{t("todaySchedule")}</p>
                <p className="num text-sm font-bold text-foreground">{openLabel}</p>
              </div>
            </Link>

            <div className="grid grid-cols-3 gap-3">
              {stats.map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-2xl border border-border bg-card p-4 shadow-card">
                  <Icon className="size-5 text-primary" />
                  <p className="num mt-2 text-lg font-extrabold text-foreground">{value}</p>
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
                className="flex items-center gap-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-destructive/10">
                  <AlertTriangle className="size-5 text-destructive" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="num text-sm font-bold text-destructive">
                    {lowStockCount} {t("lowStockBanner")}
                  </p>
                  <p className="text-xs font-semibold text-muted-foreground">
                    {t("viewLowStock")}
                  </p>
                </div>
              </Link>
              </SwipeDismiss>
            )}

            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
                <TrendingUp className="size-5 text-primary" />
                {t("newOrders")}
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
              <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-card">
                <div className="mx-auto flex size-16 items-center justify-center rounded-3xl bg-primary-soft">
                  <PackageOpen className="size-8 text-primary" />
                </div>
                <h3 className="mt-4 text-base font-bold text-foreground">{t("noOrders")}</h3>
                <p className="mx-auto mt-2 max-w-[32ch] text-sm text-muted-foreground">
                  {t("noOrdersSub")}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {pending.map((order) => (
                  <OrderCard key={order.id} order={order} />
                ))}
              </div>
            )}

            {inProgress.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-base font-bold text-foreground">{t("inProgress")}</h2>
                {inProgress.map((order) => (
                  <OrderCard key={order.id} order={order} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
