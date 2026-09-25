import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { DeliveryShell, deliveryHead } from "@/components/delivery/DeliveryShell";
import { PlaceForm } from "@/components/delivery/PlaceForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { bizRpc, listReceivers, type Receiver } from "@/lib/delivery/api";
import { useDT } from "@/lib/delivery/i18n";

export const Route = createFileRoute("/delivery/receivers")({
  head: () => deliveryHead("Receivers", "People and shops you deliver to."),
  component: Receivers,
});

function Receivers() {
  const dt = useDT();
  const receivers = useQuery({ queryKey: ["biz", "receivers"], queryFn: listReceivers });
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Partial<Receiver> | null>(null);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (receivers.data ?? []).filter(
      (r) => !s || r.name.toLowerCase().includes(s) || (r.contact_phone ?? "").includes(s),
    );
  }, [receivers.data, q]);

  const toggle = async (r: Receiver) => {
    try {
      await bizRpc("business_set_receiver_active", { _id: r.id, _active: !r.is_active });
      await receivers.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <DeliveryShell title={dt("receivers")}>
      <div className="space-y-4">
        <Button size="lg" className="h-12 w-full" onClick={() => setEditing({})}>
          <Plus className="size-5" />
          {dt("addReceiver")}
        </Button>
        <div className="relative">
          <Search className="absolute top-3.5 left-3 size-4 text-muted-foreground" />
          <Input className="h-11 pl-9" placeholder={dt("searchReceiver")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {list.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            {dt("noReceivers")}
          </p>
        ) : (
          list.map((r) => (
            <div key={r.id} className={`rounded-2xl border border-border bg-card p-4 shadow-card ${r.is_active ? "" : "opacity-60"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground">
                    {r.name} {!r.is_active && <span className="text-xs text-destructive">· {dt("inactive")}</span>}
                  </p>
                  <p className="num text-xs text-muted-foreground">
                    {r.contact_name ? `${r.contact_name} · ` : ""}
                    {r.contact_phone}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{r.address}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setEditing(r)} aria-label={dt("edit")}>
                  <Pencil className="size-4" />
                </Button>
              </div>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void toggle(r)}>
                {r.is_active ? dt("deactivate") : dt("activate")}
              </Button>
            </div>
          ))
        )}
      </div>
      {editing && (
        <PlaceForm
          kind="receiver"
          open
          onOpenChange={(v) => !v && setEditing(null)}
          initial={editing}
          onSaved={() => void receivers.refetch()}
        />
      )}
    </DeliveryShell>
  );
}
