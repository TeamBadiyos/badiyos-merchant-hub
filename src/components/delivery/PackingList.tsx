import { CheckCircle2, PackageCheck, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { TripInfo } from "@/lib/delivery/api";
import { useDT } from "@/lib/delivery/i18n";
import { printPackingList, useTripPacked } from "@/lib/delivery/packing";

type PackingListProps = {
  trip: TripInfo;
  compact?: boolean;
  showPrint?: boolean;
};

export function PackingList({ trip, compact = false, showPrint = false }: PackingListProps) {
  const dt = useDT();
  const { packed, setPacked } = useTripPacked(trip.order_id);
  const drops = trip.stops
    .filter((stop) => stop.stop_type === "drop")
    .sort((a, b) => a.sequence - b.sequence);
  const elementId = `packing-list-${trip.order_id}`;
  const heading = [
    trip.run_label,
    trip.trip_no ? `${dt("trip")} ${trip.trip_no}` : dt("trip"),
    trip.zone_name,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section id={elementId} className="packing-list rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-foreground">{heading}</p>
          <p className="num mt-0.5 text-[11px] text-muted-foreground">{trip.order_code ?? trip.order_id}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-primary">
            <PackageCheck className="size-4" />
            {trip.parcel_count} {dt("parcels")}
          </p>
        </div>
        <label className="print:hidden flex shrink-0 cursor-pointer items-center gap-2 text-xs font-bold text-foreground">
          <Checkbox checked={packed} onCheckedChange={(value) => setPacked(value === true)} />
          {dt("packed")}
        </label>
      </div>

      <div className={`${compact ? "mt-3 space-y-1.5" : "mt-4 divide-y divide-border border-y border-border"}`}>
        {drops.map((stop, index) => (
          <div key={stop.stop_id} className={`flex gap-3 ${compact ? "text-xs" : "py-3 text-sm"}`}>
            <span className="num flex size-7 shrink-0 items-center justify-center rounded-md bg-primary-soft text-xs font-extrabold text-primary">
              C{index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-foreground">{stop.receiver_name ?? stop.contact_name ?? "—"}</p>
              <p className="num text-muted-foreground">
                {stop.reference_nos?.length ? stop.reference_nos.join(", ") : dt("noInvoice")}
              </p>
            </div>
            <span className="num shrink-0 font-bold text-muted-foreground">
              {stop.parcel_count} {dt("parcelsShort")}
            </span>
          </div>
        ))}
      </div>

      {!compact && packed && (
        <p className="mt-3 flex items-center gap-2 text-xs font-bold text-primary">
          <CheckCircle2 className="size-4" /> {dt("packingComplete")}
        </p>
      )}

      {showPrint && (
        <Button
          type="button"
          variant="outline"
          className="print:hidden mt-4 h-11 w-full"
          onClick={() => printPackingList(elementId)}
        >
          <Printer className="size-4" />
          {dt("printPackingList")}
        </Button>
      )}
    </section>
  );
}