import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, Loader2, Minus, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { DeliveryShell, deliveryHead } from "@/components/delivery/DeliveryShell";
import { PlaceForm } from "@/components/delivery/PlaceForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bizRpc, getProfile, listReceivers } from "@/lib/delivery/api";
import { useDT } from "@/lib/delivery/i18n";

export const Route = createFileRoute("/delivery/new")({
  head: () => deliveryHead("New delivery order", "Create a delivery order for a receiver."),
  component: NewOrder,
});

function NewOrder() {
  const dt = useDT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const receivers = useQuery({ queryKey: ["biz", "receivers"], queryFn: listReceivers });
  const profile = useQuery({ queryKey: ["biz", "profile"], queryFn: getProfile });
  const pickups = (profile.data?.pickup_points ?? []).filter((p) => p.is_active);

  const [q, setQ] = useState("");
  const [receiverId, setReceiverId] = useState<string | null>(null);
  const [ref, setRef] = useState("");
  const [desc, setDesc] = useState("");
  const [packets, setPackets] = useState(1);
  const [pickupId, setPickupId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pickupId && pickups.length) setPickupId((pickups.find((p) => p.is_default) ?? pickups[0]!).id);
  }, [pickups, pickupId]);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (receivers.data ?? [])
      .filter((r) => r.is_active)
      .filter((r) => !s || r.name.toLowerCase().includes(s) || (r.contact_phone ?? "").includes(s))
      .slice(0, 6);
  }, [receivers.data, q]);
  const chosen = (receivers.data ?? []).find((r) => r.id === receiverId);

  const save = async (again: boolean) => {
    if (!receiverId) return toast.error(dt("chooseReceiver"));
    if (!pickupId) return toast.error(dt("pickupPoint"));
    setBusy(true);
    try {
      await bizRpc("business_create_order", {
        _receiver_id: receiverId,
        _pickup_point_id: pickupId,
        _reference_no: ref.trim() || null,
        _description: desc.trim() || null,
        _packet_count: packets,
      });
      toast.success(dt("orderSaved"));
      void qc.invalidateQueries({ queryKey: ["biz"] });
      if (again) {
        setReceiverId(null);
        setQ("");
        setRef("");
        setDesc("");
        setPackets(1);
      } else void navigate({ to: "/delivery/orders" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DeliveryShell title={dt("newOrder")}>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground">{dt("receiver")}</Label>
          {chosen ? (
            <button
              onClick={() => setReceiverId(null)}
              className="flex w-full items-center gap-3 rounded-xl border-2 border-primary bg-primary-soft p-3 text-left"
            >
              <Check className="size-5 text-primary" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground">{chosen.name}</p>
                <p className="num truncate text-xs text-muted-foreground">
                  {chosen.contact_phone} · {chosen.address}
                </p>
              </div>
            </button>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute top-3.5 left-3 size-4 text-muted-foreground" />
                <Input className="h-11 pl-9" placeholder={dt("searchReceiver")} value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <div className="divide-y divide-border rounded-xl border border-border bg-card">
                {matches.map((r) => (
                  <button key={r.id} onClick={() => setReceiverId(r.id)} className="block w-full p-3 text-left">
                    <p className="text-sm font-bold text-foreground">{r.name}</p>
                    <p className="num truncate text-xs text-muted-foreground">
                      {r.contact_phone} · {r.address}
                    </p>
                  </button>
                ))}
                <button onClick={() => setAdding(true)} className="flex w-full items-center gap-2 p-3 text-sm font-bold text-primary">
                  <Plus className="size-4" />
                  {dt("addReceiver")}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground">{dt("reference")}</Label>
          <Input className="h-11" value={ref} onChange={(e) => setRef(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground">{dt("description")}</Label>
          <Input className="h-11" value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground">{dt("packets")}</Label>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" className="size-11" onClick={() => setPackets((p) => Math.max(1, p - 1))}>
              <Minus className="size-4" />
            </Button>
            <span className="num w-10 text-center text-lg font-extrabold">{packets}</span>
            <Button variant="outline" size="icon" className="size-11" onClick={() => setPackets((p) => Math.min(50, p + 1))}>
              <Plus className="size-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground">{dt("pickupPoint")}</Label>
          {pickups.length === 0 ? (
            <p className="text-sm text-destructive">{dt("noPickups")}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {pickups.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPickupId(p.id)}
                  className={`rounded-full border px-3 py-2 text-xs font-bold ${
                    pickupId === p.id ? "border-primary bg-primary-soft text-primary" : "border-border text-foreground"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <Button size="lg" className="h-12 w-full" disabled={busy} onClick={() => void save(true)}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {dt("saveAddAnother")}
        </Button>
        <Button variant="outline" size="lg" className="h-12 w-full" disabled={busy} onClick={() => void save(false)}>
          {dt("saveOrder")}
        </Button>
      </div>

      {adding && (
        <PlaceForm
          kind="receiver"
          open={adding}
          onOpenChange={setAdding}
          initial={{ name: q && !/^\d+$/.test(q) ? q : "", contact_phone: /^\d+$/.test(q) ? q : "" }}
          onSaved={async (id) => {
            await receivers.refetch();
            if (id) setReceiverId(id);
          }}
        />
      )}
    </DeliveryShell>
  );
}
