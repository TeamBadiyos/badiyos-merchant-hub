import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Star } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DeliveryShell, deliveryHead } from "@/components/delivery/DeliveryShell";
import { PlaceForm } from "@/components/delivery/PlaceForm";
import { Button } from "@/components/ui/button";
import { bizRpc, getProfile, type PickupPoint } from "@/lib/delivery/api";
import { useDT } from "@/lib/delivery/i18n";

export const Route = createFileRoute("/delivery/pickup-points")({
  head: () => deliveryHead("Pickup points", "Places where riders collect your parcels."),
  component: Pickups,
});

function Pickups() {
  const dt = useDT();
  const profile = useQuery({ queryKey: ["biz", "profile"], queryFn: getProfile });
  const [editing, setEditing] = useState<Partial<PickupPoint> | null>(null);
  const list = profile.data?.pickup_points ?? [];

  const toggle = async (p: PickupPoint) => {
    try {
      await bizRpc("business_upsert_pickup_point", {
        _id: p.id,
        _name: p.name,
        _address: p.address,
        _lat: p.lat,
        _lng: p.lng,
        _contact_name: p.contact_name,
        _contact_phone: p.contact_phone,
        _is_default: p.is_default,
        _is_active: !p.is_active,
      });
      await profile.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <DeliveryShell title={dt("pickupPoints")}>
      <div className="space-y-4">
        <Button size="lg" className="h-12 w-full" onClick={() => setEditing({})}>
          <Plus className="size-5" />
          {dt("addPickup")}
        </Button>
        {list.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            {dt("noPickups")}
          </p>
        ) : (
          list.map((p) => (
            <div key={p.id} className={`rounded-2xl border border-border bg-card p-4 shadow-card ${p.is_active ? "" : "opacity-60"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1 text-sm font-bold text-foreground">
                    {p.is_default && <Star className="size-4 fill-primary text-primary" />}
                    {p.name}
                    {!p.is_active && <span className="text-xs text-destructive">· {dt("inactive")}</span>}
                  </p>
                  <p className="num text-xs text-muted-foreground">
                    {p.contact_name ? `${p.contact_name} · ` : ""}
                    {p.contact_phone}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{p.address}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setEditing(p)} aria-label={dt("edit")}>
                  <Pencil className="size-4" />
                </Button>
              </div>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void toggle(p)}>
                {p.is_active ? dt("deactivate") : dt("activate")}
              </Button>
            </div>
          ))
        )}
      </div>
      {editing && (
        <PlaceForm
          kind="pickup"
          open
          onOpenChange={(v) => !v && setEditing(null)}
          initial={editing}
          onSaved={() => void profile.refetch()}
        />
      )}
    </DeliveryShell>
  );
}
