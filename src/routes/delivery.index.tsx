import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Clock, Loader2, Phone, Plus, Send, Truck, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DeliveryShell, deliveryHead } from "@/components/delivery/DeliveryShell";
import { PackingList } from "@/components/delivery/PackingList";
import { ParcelLabelDialog } from "@/components/delivery/ParcelLabelDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  bizRpc,
  getProfile,
  getTrip,
  getWallet,
  inr,
  listActiveTrips,
  listOrders,
  nextSlot,
} from "@/lib/delivery/api";
import { useDT } from "@/lib/delivery/i18n";
import { sealStock } from "@/lib/delivery/seals";
import { useAuth } from "@/lib/auth";
import { useFriendlyError } from "@/lib/use-friendly-error";

export const Route = createFileRoute("/delivery/")({
  head: () =>
    deliveryHead("Delivery home", "Wallet balance, today's deliveries, dispatch and active trips."),
  component: DeliveryHome,
});

function DeliveryHome() {
  const dt = useDT();
  const friendly = useFriendlyError();
  const [confirm, setConfirm] = useState(false);
  const wallet = useQuery({ queryKey: ["biz", "wallet"], queryFn: getWallet });
  const profile = useQuery({ queryKey: ["biz", "profile"], queryFn: getProfile });
  const { merchant } = useAuth();
  const stock = useQuery({
    queryKey: ["biz", "sealStock", merchant?.id],
    enabled: Boolean(merchant?.id),
    queryFn: () => sealStock(merchant!.id),
  });
  const avail = Number(stock.data?.available ?? 0);
  const perDay = Number(stock.data?.avg_used_per_day_7d ?? 0);
  const lowStock = stock.data ? (perDay > 0 ? avail < perDay * 3 : avail === 0) : false;
  const orders = useQuery({ queryKey: ["biz", "orders"], queryFn: listOrders, refetchInterval: 30_000 });
  const trips = useQuery({ queryKey: ["biz", "trips"], queryFn: listActiveTrips, refetchInterval: 30_000 });

  const dispatchNow = useMutation({
    mutationFn: () => bizRpc("business_dispatch_now"),
    onSuccess: () => {
      toast.success(dt("dispatched"));
      void orders.refetch();
      void trips.refetch();
      void wallet.refetch();
    },
    onError: (e) => toast.error(friendly(e)),
  });

  const bal = Number(wallet.data?.delivery_wallet_balance ?? 0);
  const limit = Number(wallet.data?.low_balance_threshold ?? 0);
  const low = bal < 0 || bal < limit;

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const list = orders.data ?? [];
  const isToday = (d: string | null) => Boolean(d && new Date(d) >= start);
  const pendingCount = list.filter((o) => o.status === "pending").length;
  const counts = [
    { label: dt("pending"), value: pendingCount },
    { label: dt("onTheWay"), value: list.filter((o) => o.status === "in_transit" || o.status === "batched").length },
    { label: dt("delivered"), value: list.filter((o) => o.status === "delivered" && isToday(o.delivered_at ?? o.updated_at)).length },
    { label: dt("returned"), value: list.filter((o) => o.status === "returned" && isToday(o.updated_at)).length },
  ];

  const plan = profile.data?.dispatch_plan ?? null;
  const slot = plan?.slots_enabled ? nextSlot(plan.slot_times) : null;
  const threshold = plan?.qty_enabled ? Number(plan.qty_threshold ?? 0) : 0;

  return (
    <DeliveryShell
      title={dt("home")}
      onRefresh={() =>
        Promise.all([
          wallet.refetch(),
          profile.refetch(),
          stock.refetch(),
          orders.refetch(),
          trips.refetch(),
        ])
      }
    >
      <div className="space-y-5">
        <div
          className={`rounded-2xl border p-4 shadow-card ${
            low ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"
          }`}
        >
          <p className="text-xs font-semibold text-muted-foreground">{dt("balance")}</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <p className={`num text-2xl font-extrabold ${low ? "text-destructive" : "text-foreground"}`}>
              {wallet.isLoading ? "…" : inr(bal)}
            </p>
            <Button asChild variant={low ? "destructive" : "default"}>
              <Link to="/delivery/wallet" search={{ topup: true }}>
                {dt("topUp")}
              </Link>
            </Button>
          </div>
          <p className="num mt-1 text-[11px] text-muted-foreground">
            {dt("lowLimit")}: {inr(limit)}
          </p>
        </div>

        {stock.data && (
          <p className={`num text-xs font-semibold ${lowStock ? "text-destructive" : "text-muted-foreground"}`}>
            {dt("stickersLeft")}: {avail.toLocaleString("en-IN")}
            {lowStock && <> · {dt("orderStickers")}</>}
          </p>
        )}
        <Button asChild size="lg" className="h-14 w-full text-base">
          <Link to="/delivery/new">
            <Plus className="size-5" />
            {dt("newOrder")}
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-11 w-full">
          <Link to="/delivery/bulk">
            <Upload className="size-4" />
            {dt("bulkUpload")}
          </Link>
        </Button>

        <div>
          <h2 className="mb-2 text-sm font-bold text-foreground">{dt("today")}</h2>
          <div className="grid grid-cols-4 gap-2">
            {counts.map((c) => (
              <div key={c.label} className="rounded-2xl border border-border bg-card p-3 text-center shadow-card">
                <p className="num text-lg font-extrabold text-foreground">{c.value}</p>
                <p className="text-[10px] leading-tight font-semibold text-muted-foreground">{c.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <h2 className="text-sm font-bold text-foreground">{dt("dispatch")}</h2>
          {profile.isLoading ? (
            <Loader2 className="mt-2 size-4 animate-spin text-muted-foreground" />
          ) : !plan ? (
            <p className="mt-2 text-sm font-semibold text-destructive">{dt("noPlan")}</p>
          ) : (
            <div className="mt-2 space-y-3">
              {slot && (
                <p className="num flex items-center gap-2 text-sm text-foreground">
                  <Clock className="size-4 text-primary" />
                  {dt("nextSlot")}: <b>{slot}</b>
                </p>
              )}
              {threshold > 0 && (
                <div>
                  <p className="num text-sm text-foreground">
                    <b>{Math.min(pendingCount, threshold)}</b> {dt("of")} {threshold} {dt("ordersOf")}
                  </p>
                  <Progress className="mt-1.5 h-2" value={Math.min(100, (pendingCount / threshold) * 100)} />
                </div>
              )}
              {plan.manual_enabled && (
                <Button
                  variant="outline"
                  className="h-11 w-full"
                  disabled={dispatchNow.isPending || pendingCount === 0}
                  onClick={() => setConfirm(true)}
                >
                  {dispatchNow.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  {dt("dispatchNow")}
                </Button>
              )}
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-2 text-sm font-bold text-foreground">{dt("activeTrips")}</h2>
          {(trips.data ?? []).length === 0 ? (
            <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
              {dt("noTrips")}
            </p>
          ) : (
            <ActiveTripGroups tripRows={trips.data ?? []} />
          )}
        </div>
      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dt("dispatchConfirm")}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{dt("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => dispatchNow.mutate()}>{dt("dispatchNow")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DeliveryShell>
  );
}

type ActiveTripRow = { id: string; courier_order_id: string | null };

function ActiveTripGroups({ tripRows }: { tripRows: ActiveTripRow[] }) {
  const dt = useDT();
  const ids = tripRows.flatMap((row) => (row.courier_order_id ? [row.courier_order_id] : []));
  const queries = useQueries({
    queries: ids.map((tripId) => ({
      queryKey: ["biz", "trip", tripId],
      queryFn: () => getTrip(tripId),
      refetchInterval: 30_000,
    })),
  });
  const loadedTrips = queries.flatMap((query) => (query.data ? [query.data] : []));
  const groups = loadedTrips.reduce<Map<string, typeof loadedTrips>>((map, trip) => {
    const key = trip.dispatch_run_id ?? trip.order_id;
    const group = map.get(key) ?? [];
    group.push(trip);
    map.set(key, group);
    return map;
  }, new Map());

  if (queries.some((query) => query.isLoading) && loadedTrips.length === 0) {
    return (
      <div className="flex h-20 items-center justify-center rounded-2xl border border-border bg-card">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([runId, runTrips]) => {
        const eligible = runTrips.filter((trip) => trip.batch_status === "dispatched");
        const hasPackets = eligible.some((trip) => trip.stops.some((stop) => stop.packets.length > 0));
        return (
          <section key={runId} className="space-y-2">
            <div className="flex items-center justify-between gap-3 px-1">
              <p className="text-xs font-bold text-muted-foreground">
                {runTrips[0]?.dispatch_date ?? dt("today")}
              </p>
              {hasPackets && (
                <ParcelLabelDialog trips={eligible} title={`dispatch-${runTrips[0]?.dispatch_date ?? runId}-labels`} />
              )}
            </div>
            {runTrips.map((trip) => <ActiveTrip key={trip.order_id} trip={trip} />)}
          </section>
        );
      })}
    </div>
  );
}

function ActiveTrip({ trip }: { trip: Awaited<ReturnType<typeof getTrip>> }) {
  const dt = useDT();
  const hasPackets = trip.batch_status === "dispatched" && trip.stops.some((stop) => stop.packets.length > 0);

  return (
    <div className="space-y-2">
      <PackingList trip={trip} compact />
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <Truck className="size-4 shrink-0 text-primary" />
          {trip.rider_available ? (
            <span className="truncate font-semibold text-foreground">{trip.rider_name ?? dt("rider")}</span>
          ) : (
            <span className="font-semibold">{dt("findingRider")}</span>
          )}
          {trip.rider_available && trip.rider_phone && (
            <Button variant="ghost" size="icon" className="size-8" asChild aria-label={dt("call")}>
              <a href={`tel:+91${trip.rider_phone}`}><Phone className="size-4" /></a>
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1">
          {hasPackets && (
            <ParcelLabelDialog
              trips={[trip]}
              title={`trip-${trip.trip_no ?? trip.order_code ?? trip.order_id}-labels`}
            />
          )}
          <Button variant="ghost" size="sm" asChild>
            <Link to="/delivery/trip/$id" params={{ id: trip.order_id }}>
              {dt("trip")} <ChevronRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
