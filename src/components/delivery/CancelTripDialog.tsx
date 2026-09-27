import { useQueryClient } from "@tanstack/react-query";
import { Loader2, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cancelTrip, type TripInfo } from "@/lib/delivery/api";
import { useDT, type DKey } from "@/lib/delivery/i18n";

const REASONS: DKey[] = ["cancelReasonRiderLate", "cancelReasonOrderChanged", "cancelReasonCustomer", "cancelReasonOther"];
const rs = (n: number) => `₹${Number(n ?? 0).toFixed(2)}`;

export function CancelTripDialog({ trip }: { trip: TripInfo }) {
  const dt = useDT();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<DKey | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (!trip.can_cancel || !trip.batch_id) return null;
  const text = reason === "cancelReasonOther" ? note.trim() : reason ? dt(reason) : "";
  const fee = Number(trip.cancel_fee_preview ?? 0);

  const confirm = async () => {
    if (!text || !trip.batch_id) return;
    setBusy(true);
    try {
      const res = await cancelTrip(trip.batch_id, text);
      toast.success(`${dt("tripCancelled")} ${rs(res?.refund_amount ?? 0)}`);
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["biz"] });
    } catch (e) {
      toast.error((e as Error).message);
      void qc.invalidateQueries({ queryKey: ["biz", "trip", trip.order_id] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="lg" className="h-12 w-full border-destructive text-destructive" onClick={() => setOpen(true)}>
        <XCircle className="size-5" />
        {dt("cancelTrip")}
      </Button>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dt("cancelTrip")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{dt("cancelTripInfo")}</p>
          <div className="space-y-1 rounded-xl bg-muted/60 p-3 text-sm">
            {fee > 0 && (
              <div className="flex justify-between gap-3 text-destructive">
                <span>{dt("cancelFee")}</span>
                <span className="num font-bold">{rs(fee)}</span>
              </div>
            )}
            <div className="flex justify-between gap-3 font-semibold text-foreground">
              <span>{dt("refundAmount")}</span>
              <span className="num font-bold">{rs(trip.refund_preview)}</span>
            </div>
          </div>
          <p className="text-xs font-bold text-muted-foreground">{dt("cancelReason")}</p>
          <div className="grid gap-2">
            {REASONS.map((r) => (
              <Button key={r} variant={reason === r ? "default" : "outline"} className="h-11 justify-start" onClick={() => setReason(r)}>
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
            <Button variant="destructive" onClick={() => void confirm()} disabled={busy || !text}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {dt("cancelTrip")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
