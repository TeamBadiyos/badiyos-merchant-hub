import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, MinusCircle, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { inr, listTripOrders, removePackets, type TripInfo } from "@/lib/delivery/api";
import { useDT, type DKey } from "@/lib/delivery/i18n";
import { sealDisplay } from "@/lib/delivery/seals";
import { useFriendlyError } from "@/lib/use-friendly-error";

const REASONS: DKey[] = ["removeReasonNotReady", "removeReasonChanged", "cancelReasonOther"];

/** Per-order checkboxes to take unscanned packets off a trip before pickup. */
export function RemovePacketsPanel({ trip }: { trip: TripInfo }) {
  const dt = useDT();
  const friendly = useFriendlyError();
  const qc = useQueryClient();
  const orders = useQuery({
    queryKey: ["biz", "trip-orders", trip.order_id],
    queryFn: () => listTripOrders(trip.order_id),
    enabled: trip.can_cancel,
    refetchInterval: 10_000,
  });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<DKey | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const drops = useMemo(
    () => trip.stops.filter((s) => s.stop_type === "drop" && s.status !== "cancelled").sort((a, b) => a.sequence - b.sequence),
    [trip.stops],
  );
  const active = (orders.data ?? []).filter((o) => o.status === "batched");

  const scannedOf = (o: { seal_code: string | null; drop_stop_id: string | null }) => {
    const stop = drops.find((d) => d.stop_id === o.drop_stop_id);
    if (!stop) return false;
    if (o.seal_code) return stop.packets.some((p) => p.code === o.seal_code && p.scanned_pickup_at);
    return stop.packets.some((p) => p.scanned_pickup_at) && stop.packets.every((p) => p.scanned_pickup_at);
  };

  if (!trip.can_cancel || !trip.batch_id || active.length === 0) return null;

  const allSelected = sel.size > 0 && active.every((o) => sel.has(o.id));
  const fee = Number(trip.cancel_fee_preview ?? 0);
  const toggle = (id: string, v: boolean) =>
    setSel((s) => {
      const n = new Set(s);
      if (v) n.add(id);
      else n.delete(id);
      return n;
    });

  const confirm = async () => {
    if (!trip.batch_id) return;
    const text = reason === "cancelReasonOther" ? note.trim() : reason ? dt(reason) : "";
    setBusy(true);
    try {
      const res = await removePackets(trip.batch_id, [...sel], text || dt("removeReasonDefault"));
      if (!res.ok) {
        toast.error(
          res.reason === "packet_scanned" ? dt("packetScannedErr") : res.reason === "pickup_done" ? dt("pickupDoneErr") : dt("removeFailed"),
        );
      } else if (res.trip_cancelled) {
        toast.success(dt("tripCancelledOnly"));
      } else {
        const n = res.packets_removed ?? res.codes?.length ?? sel.size;
        const refund = Number(res.refund ?? 0);
        toast.success(`${n} ${dt("removedDone")}${refund > 0 ? `, ${inr(refund)} ${dt("backToWallet")}` : ""}`);
      }
      setOpen(false);
      setSel(new Set());
    } catch (e) {
      toast.error(friendly(e));
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: ["biz"] });
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <p className="text-sm font-extrabold text-foreground">{dt("selectPackets")}</p>
      <div className="mt-3 divide-y divide-border">
        {drops.map((stop) =>
          active
            .filter((o) => o.drop_stop_id === stop.stop_id)
            .map((o) => {
              const scanned = scannedOf(o);
              return (
                <label key={o.id} className="flex items-center gap-3 py-2.5 text-sm">
                  {scanned ? (
                    <span className="size-4" />
                  ) : (
                    <Checkbox checked={sel.has(o.id)} onCheckedChange={(v) => toggle(o.id, v === true)} />
                  )}
                  <span className="num flex size-7 shrink-0 items-center justify-center rounded-md bg-primary-soft text-xs font-extrabold text-primary">
                    {stop.drop_label ?? "—"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-foreground">{stop.receiver_name ?? stop.contact_name ?? "—"}</span>
                    <span className="num block text-xs text-muted-foreground">
                      {o.seal_code ? sealDisplay(o.seal_code) : `${o.packet_count} ${dt("parcelsShort")}`}
                    </span>
                  </span>
                  {scanned && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{dt("scanned")}</span>}
                </label>
              );
            }),
        )}
      </div>
      <Button
        variant="outline"
        className="mt-3 h-11 w-full border-destructive text-destructive"
        disabled={sel.size === 0}
        onClick={() => {
          setReason(null);
          setNote("");
          setOpen(true);
        }}
      >
        <MinusCircle className="size-4" />
        {dt("removeFromTrip")} {sel.size > 0 && `(${sel.size})`}
      </Button>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dt("removeFromTrip")}</DialogTitle>
          </DialogHeader>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Undo2 className="size-4 text-primary" /> {dt("removeFromTripInfo")}
          </p>
          {allSelected && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <p className="flex gap-2 font-semibold">
                <AlertTriangle className="size-4 shrink-0" /> {dt("removeAllWarn")}
              </p>
              {fee > 0 && (
                <p className="num mt-2 flex justify-between font-bold">
                  <span>{dt("cancelFee")}</span>
                  <span>{inr(fee)}</span>
                </p>
              )}
            </div>
          )}
          <p className="text-xs font-bold text-muted-foreground">{dt("cancelReason")}</p>
          <div className="grid gap-2">
            {REASONS.map((r) => (
              <Button key={r} variant={reason === r ? "default" : "outline"} className="h-11 justify-start" onClick={() => setReason(reason === r ? null : r)}>
                {dt(r)}
              </Button>
            ))}
          </div>
          {reason === "cancelReasonOther" && (
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={dt("cancelReasonNote")} maxLength={180} />
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              {dt("cancelTripBack")}
            </Button>
            <Button variant="destructive" onClick={() => void confirm()} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {dt("removeFromTrip")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** History of packets taken off this trip. */
export function RemovedPacketsList({ trip }: { trip: TripInfo }) {
  const dt = useDT();
  const rows = trip.removed_packets ?? [];
  if (!rows.length) return null;
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <p className="text-sm font-extrabold text-foreground">{dt("removedFromTrip")}</p>
      <div className="mt-2 divide-y divide-border">
        {rows.map((r, i) => (
          <div key={`${r.code}-${i}`} className="flex gap-3 py-2.5 text-sm">
            <span className="num flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-extrabold text-muted-foreground">
              {r.drop_label ?? "—"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-foreground">{r.receiver_name ?? "—"}</p>
              <p className="num text-xs text-muted-foreground">
                {sealDisplay(r.code)} · {r.notes || r.reason || "—"}
              </p>
            </div>
            <div className="shrink-0 text-right text-[11px] text-muted-foreground">
              <p className="font-bold text-foreground">{r.removed_by === "rider" ? dt("removedByRider") : dt("removedByYou")}</p>
              <p className="num">
                {new Date(r.removed_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
