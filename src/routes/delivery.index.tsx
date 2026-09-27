import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Clock, Loader2, Phone, Plus, Send, Truck, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DeliveryShell, deliveryHead } from "@/components/delivery/DeliveryShell";
import { PackingList } from "@/components/delivery/PackingList";
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
  getTripRider,
  getWallet,
  inr,
  listActiveTrips,
  listOrders,
  nextSlot,
} from "@/lib/delivery/api";
import { useDT } from "@/lib/delivery/i18n";
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
    <DeliveryShell title={dt("home")}>
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
            <div className="space-y-2">
              {(trips.data ?? []).map((tr) =>
                tr.courier_order_id ? <ActiveTrip key={tr.id} tripId={tr.courier_order_id} /> : null,
              )}
            </div>
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

function ActiveTrip({ tripId }: { tripId: string }) {
  const dt = useDT();
  const trip = useQuery({
    queryKey: ["biz", "trip", tripId],
    queryFn: () => getTrip(tripId),
    refetchInterval: 30_000,
  });
  const rider = useQuery({
    queryKey: ["biz", "trip-rider", tripId],
    queryFn: () => getTripRider(tripId),
    refetchInterval: 10_000,
  });

  if (trip.isLoading)
    return (
      <div className="flex h-20 items-center justify-center rounded-2xl border border-border bg-card">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  if (!trip.data) return null;

  return (
    <div className="space-y-2">
      <PackingList trip={trip.data} compact />
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <Truck className="size-4 shrink-0 text-primary" />
          {rider.data?.available ? (
            <span className="truncate font-semibold text-foreground">{rider.data.name ?? dt("rider")}</span>
          ) : (
            <span className="font-semibold">{dt("findingRider")}</span>
          )}
          {rider.data?.available && rider.data.phone && (
            <Button variant="ghost" size="icon" className="size-8" asChild aria-label={dt("call")}>
              <a href={`tel:+91${rider.data.phone}`}><Phone className="size-4" /></a>
            </Button>
          )}
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/delivery/trip/$id" params={{ id: tripId }}>
            {dt("trip")} <ChevronRight className="size-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
