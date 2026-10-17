import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAppMode } from "@/lib/delivery/mode";
import { AlertTriangle, Copy, Eye, IndianRupee, PackageOpen, QrCode, Share2, Star } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useOrderRing } from "@/lib/use-order-ring";

import { AppShell } from "@/components/AppShell";
import { SwipeDismiss } from "@/components/SwipeRow";
import { AccessDenied, PendingApproval } from "@/components/GateNotice";
import { FssaiReminder } from "@/components/FssaiReminder";
import { OrderCard } from "@/components/OrderCard";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { inr, isActionableNewOrder, isNewOrder } from "@/lib/order-status";
import { fetchOrders, startOfTodayIso } from "@/lib/orders";
import { supabase } from "@/integrations/supabase/client";
import { useAvailability } from "@/lib/use-availability";
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
  const { can, context } = useAuth();
  const isOwner = context.isOwner;
  const merchant = useRequireAuth();
  const [lowStockDismissed, setLowStockDismissed] = useState(false);
  const allowed = can("view_orders");
  const { mode } = useAppMode();
  const navigate = useNavigate();

  // Delivery-only businesses, or the last chosen mode, open the delivery app.
  useEffect(() => {
    if (merchant && mode === "delivery") void navigate({ to: "/delivery", replace: true });
  }, [merchant, mode, navigate]);

  // The shell already holds one live subscription for this shop; a second one
  // here would double every realtime roundtrip.

  const live = useQuery({
    queryKey: ["orders", "live", merchant?.id],
    enabled: Boolean(merchant?.id) && allowed && merchant?.status === "approved",
    queryFn: () => fetchOrders(LIVE, { limit: 50 }),
  });

  // Only today's rows: the old query downloaded the shop's whole history.
  const today = useQuery({
    queryKey: ["orders", "today", merchant?.id],
    enabled: Boolean(merchant?.id) && allowed && merchant?.status === "approved",
    queryFn: () => fetchOrders(undefined, { since: startOfTodayIso(), limit: 200 }),
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

  const isFood = merchant?.service_type === "food";
  const approved = merchant?.status === "approved";


  const visits = useQuery({
    queryKey: ["store-analytics", merchant?.id, 1],
    enabled: Boolean(merchant?.id) && approved,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_merchant_store_analytics", {
        _merchant_id: merchant!.id,
        _days: 1,
      });
      if (error) throw error;
      return Number(((data ?? {}) as Record<string, unknown>)["totalVisits"] ?? 0);
    },
  });

  const pendingItems = useQuery({
    queryKey: ["products", "pending-approval", merchant?.id],
    enabled: Boolean(merchant?.id) && approved && can("manage_products"),
    queryFn: async () => {
      const { count, error } = await supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("approval_status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
  });

  const agreementPending = useQuery({
    queryKey: ["my-agreements", merchant?.id, "pending"],
    enabled: Boolean(merchant?.id) && approved && isOwner,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("app_my_agreements");
      if (error) return false;
      const list = (data as { status?: string }[] | null) ?? [];
      return list.some((a) => a.status && !["accepted", "signed", "superseded", "revoked"].includes(a.status));
    },
  });

  const { schedule, openState, availability, setAccepting } = useAvailability();

  const pending = (live.data ?? []).filter((o) => isActionableNewOrder(o));
  useOrderRing(approved && allowed && pending.length > 0);

  if (!merchant) return null;

  const todays = today.data ?? [];
  // Goods sold today — the delivery fee is not the shop's money.
  const sales = todays
    .filter((o) => !["rejected", "cancelled"].includes(o.status))
    .reduce((sum, o) => sum + Number(o.items_total ?? 0), 0);

  const [hero, ...queued] = pending;
  const preparing = (live.data ?? []).filter((o) => !isNewOrder(o.status) && o.status !== "ready");
  const readyOrders = (live.data ?? []).filter((o) => o.status === "ready");

  const lowStockCount = !isFood ? (lowStock.data?.length ?? 0) : 0;
  const closedInHours = openState.kind === "open" && !availability.open;

  const stats = [
    { label: t("todayOrders"), value: String(todays.length), icon: PackageOpen },
    { label: t("todaySales"), value: inr(sales), icon: IndianRupee },
    { label: t("todayVisits"), value: String(visits.data ?? "—"), icon: Eye },
    {
      label: t("rating"),
      value: Number(merchant.rating_count ?? 0) > 0 ? Number(merchant.rating_avg).toFixed(1) : "—",
      icon: Star,
    },
  ];

  const alerts: { key: string; text: string; to: "/profile" | "/products" | "/onboarding" | "/settings" }[] = [];
  if (isOwner && (merchant.latitude == null || merchant.longitude == null))
    alerts.push({ key: "loc", text: t("alertLocation"), to: "/profile" });
  if (isOwner && !merchant.bank_account_number) alerts.push({ key: "bank", text: t("alertBank"), to: "/profile" });
  if (agreementPending.data) alerts.push({ key: "agr", text: t("alertAgreement"), to: "/onboarding" });
  if ((pendingItems.data ?? 0) > 0)
    alerts.push({ key: "items", text: `${pendingItems.data} ${t("alertPendingItems")}`, to: "/products" });
  if (lowStockCount > 0 && can("manage_products") && !lowStockDismissed)
    alerts.push({ key: "low", text: `${lowStockCount} ${t("lowStockBanner")}`, to: "/products" });

  return (
    <AppShell
      title={t("home")}
      onRefresh={() =>
        Promise.all([live.refetch(), today.refetch(), lowStock.refetch(), schedule.refetch(), visits.refetch()])
      }
    >
      <div className="space-y-5">
        {merchant.status !== "approved" ? (
          <PendingApproval />
        ) : !allowed ? (
          <AccessDenied />
        ) : (
          <>
            {hero && (
              <div className="space-y-3">
                <OrderCard order={hero} hero />
                {queued.map((o) => (
                  <OrderCard key={o.id} order={o} hero />
                ))}
              </div>
            )}

            {closedInHours && (
              <div className="flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3">
                <AlertTriangle className="size-4 shrink-0 text-destructive" />
                <p className="min-w-0 flex-1 text-xs font-bold text-destructive">{t("alertClosedInHours")}</p>
                <Button
                  size="sm"
                  className="rounded-xl font-bold"
                  disabled={setAccepting.isPending}
                  onClick={() => setAccepting.mutate(true)}
                >
                  {t("openStoreNow")}
                </Button>
              </div>
            )}

            <FssaiReminder />

            {alerts.map((a) => (
              <SwipeDismiss key={a.key} onDismiss={() => a.key === "low" && setLowStockDismissed(true)}>
                <Link
                  to={a.to}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-card"
                >
                  <AlertTriangle className="size-4 shrink-0 text-primary" />
                  <p className="num min-w-0 flex-1 truncate text-xs font-bold text-foreground">{a.text}</p>
                </Link>
              </SwipeDismiss>
            ))}

            <div className="grid grid-cols-4 gap-2">
              {stats.map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-2xl border border-border bg-card p-3 shadow-card">
                  <Icon className="size-4 text-primary" />
                  <p className="num mt-1.5 truncate text-base font-extrabold text-foreground">{value}</p>
                  <p className="truncate text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>

            <section className="space-y-3">
              <h2 className="text-xs font-bold uppercase text-muted-foreground">{t("statusPreparing")}</h2>
              {preparing.length === 0 && readyOrders.length === 0 && !hero ? (
                <p className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                  {t("noActive")}
                </p>
              ) : preparing.length === 0 ? (
                <p className="text-sm text-muted-foreground">—</p>
              ) : (
                preparing.map((o) => <OrderCard key={o.id} order={o} />)
              )}
            </section>

            {readyOrders.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-xs font-bold uppercase text-muted-foreground">{t("waitingRider")}</h2>
                {readyOrders.map((o) => (
                  <OrderCard key={o.id} order={o} />
                ))}
              </section>
            )}

            <ShareStore slug={merchant.store_slug} name={merchant.store_name} />
          </>
        )}
      </div>
    </AppShell>
  );
}

function ShareStore({ slug, name }: { slug: string | null; name: string | null }) {
  const { t } = useI18n();
  const [qr, setQr] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  if (!slug) return null;
  const url = `https://badiyos.com/store/${slug}`;
  const showQr = async () => {
    const QR = (await import("qrcode")).default;
    setQr(await QR.toDataURL(url, { width: 512, margin: 1 }));
    setQrOpen(true);
  };
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <p className="text-sm font-bold text-foreground">{t("shareStoreTitle")}</p>
      <p className="truncate text-xs text-muted-foreground">{url}</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Button
          variant="outline"
          className="rounded-xl font-bold"
          onClick={() => void navigator.clipboard.writeText(url).then(() => toast.success(t("shareCopied")))}
        >
          <Copy className="size-4" />
          {t("copyLink")}
        </Button>
        <Button variant="outline" className="rounded-xl font-bold" asChild>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`${name ?? "badiyos"} — ${url}`)}`}
            target="_blank"
            rel="noreferrer"
          >
            <Share2 className="size-4" />
            {t("whatsapp")}
          </a>
        </Button>
        <Button variant="outline" className="rounded-xl font-bold" onClick={() => void showQr()}>
          <QrCode className="size-4" />
          {t("qrCode")}
        </Button>
      </div>
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="max-w-xs rounded-2xl">
          <DialogHeader>
            <DialogTitle>{name}</DialogTitle>
          </DialogHeader>
          {qr && <img src={qr} alt={url} className="mx-auto w-full rounded-xl" />}
          <p className="text-center text-xs text-muted-foreground">{url}</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
