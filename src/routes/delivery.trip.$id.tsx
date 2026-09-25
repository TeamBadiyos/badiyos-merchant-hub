import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, Loader2, Phone, Share2, Undo2 } from "lucide-react";

import { DeliveryShell, deliveryHead } from "@/components/delivery/DeliveryShell";
import { Button } from "@/components/ui/button";
import { getTrip, type TripStop } from "@/lib/delivery/api";
import { useDT } from "@/lib/delivery/i18n";

export const Route = createFileRoute("/delivery/trip/$id")({
  head: () => deliveryHead("Trip", "Stops, OTPs and status for a delivery trip."),
  component: Trip,
});

const short = (a: string | null) => (a ?? "").split(",").slice(0, 2).join(",").trim();

async function share(text: string) {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch {
      /* cancelled */
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
}

function Trip() {
  const { id } = Route.useParams();
  const dt = useDT();
  const trip = useQuery({ queryKey: ["biz", "trip", id], queryFn: () => getTrip(id), refetchInterval: 10_000 });

  const stops = trip.data?.stops ?? [];
  const pickup = stops.find((s) => s.stop_type === "pickup");
  const drops = stops.filter((s) => s.stop_type === "drop");
  const line = (s: TripStop) => `${s.receiver_name ?? s.contact_name ?? ""} · ${short(s.address)} · OTP ${s.otp}`;
  const withOtp = drops.filter((s) => s.otp);

  const statusLabel = (s: string) =>
    dt(
      s === "arrived" ? "statusArrived" : s === "completed" ? "statusCompleted" : s === "failed" ? "statusFailed" : s === "cancelled" ? "statusCancelled" : "statusPending",
    );

  return (
    <DeliveryShell title={`${dt("trip")} ${trip.data?.order_code ?? ""}`}>
      {trip.isLoading ? (
        <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
      ) : trip.error ? (
        <p className="text-sm text-destructive">{(trip.error as Error).message}</p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border-2 border-primary bg-primary-soft p-5 text-center">
            <p className="text-xs font-bold text-primary">{dt("pickupOtp")}</p>
            <p className="num mt-2 text-5xl font-extrabold tracking-[0.3em] text-foreground">
              {pickup?.otp ?? "— — — —"}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">{trip.data?.status}</p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
            {dt("rider")}: {dt("riderPending")}
          </div>

          {withOtp.length > 0 && (
            <Button size="lg" className="h-12 w-full" onClick={() => void share(withOtp.map(line).join("\n"))}>
              <Share2 className="size-5" />
              {dt("shareAll")}
            </Button>
          )}

          {stops.map((s) => (
            <div
              key={s.stop_id}
              className={`rounded-2xl border p-4 shadow-card ${
                s.stop_type === "return" ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1 text-xs font-bold text-muted-foreground">
                    {s.stop_type === "return" && <Undo2 className="size-3.5 text-destructive" />}
                    {s.sequence}.{" "}
                    {s.stop_type === "pickup" ? dt("pickup") : s.stop_type === "return" ? dt("returnStop") : dt("stop")}
                    {" · "}
                    {statusLabel(s.status)}
                  </p>
                  <p className="mt-1 text-sm font-bold text-foreground">{s.receiver_name ?? s.contact_name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{s.address}</p>
                  {s.reference_nos?.length ? (
                    <p className="num mt-1 text-xs text-muted-foreground">{s.reference_nos.join(", ")}</p>
                  ) : null}
                </div>
                {s.contact_phone && (
                  <Button variant="outline" size="icon" asChild aria-label={dt("call")}>
                    <a href={`tel:+91${s.contact_phone}`}>
                      <Phone className="size-4" />
                    </a>
                  </Button>
                )}
              </div>
              {s.stop_type === "drop" && (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-muted/60 px-3 py-2">
                  <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <KeyRound className="size-4" />
                    {s.otp ? (
                      <span className="num text-xl font-extrabold tracking-widest text-foreground">{s.otp}</span>
                    ) : (
                      dt("otpPending")
                    )}
                  </span>
                  {s.otp && (
                    <Button size="sm" variant="ghost" className="text-primary" onClick={() => void share(line(s))}>
                      <Share2 className="size-4" />
                      {dt("share")}
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </DeliveryShell>
  );
}
