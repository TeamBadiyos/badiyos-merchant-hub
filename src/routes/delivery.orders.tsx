import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, RotateCcw, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { DeliveryShell, deliveryHead } from "@/components/delivery/DeliveryShell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { bizRpc, listOrders, type BizOrder } from "@/lib/delivery/api";
import { useDT } from "@/lib/delivery/i18n";

export const Route = createFileRoute("/delivery/orders")({
  head: () => deliveryHead("Delivery orders", "Track pending, on-the-way, delivered and returned orders."),
  component: Orders,
});

const TABS = [
  ["pending", "pending"],
  ["batched", "batched"],
  ["in_transit", "onTheWay"],
  ["delivered", "delivered"],
  ["returned", "returned"],
  ["failed", "failed"],
  ["cancelled", "cancelled"],
] as const;

function Orders() {
  const dt = useDT();
  const orders = useQuery({ queryKey: ["biz", "orders"], queryFn: listOrders, refetchInterval: 30_000 });
  const [tab, setTab] = useState<string>("pending");
  const [q, setQ] = useState("");
  const [cancelling, setCancelling] = useState<BizOrder | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (orders.data ?? [])
      .filter((o) => o.status === tab)
      .filter(
        (o) =>
          !s ||
          (o.reference_no ?? "").toLowerCase().includes(s) ||
          (o.receiver?.name ?? "").toLowerCase().includes(s) ||
          (o.receiver?.contact_phone ?? "").includes(s),
      );
  }, [orders.data, tab, q]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await orders.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DeliveryShell title={dt("orders")}>
      <div className="space-y-4">
        <div className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1">
          {TABS.map(([s, k]) => {
            const n = (orders.data ?? []).filter((o) => o.status === s).length;
            return (
              <button
                key={s}
                onClick={() => setTab(s)}
                className={`shrink-0 rounded-full border px-3 py-2 text-xs font-bold ${
                  tab === s ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground"
                }`}
              >
                {dt(k)} <span className="num opacity-80">{n}</span>
              </button>
            );
          })}
        </div>
        <div className="relative">
          <Search className="absolute top-3.5 left-3 size-4 text-muted-foreground" />
          <Input className="h-11 pl-9" placeholder={dt("searchOrders")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        {list.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            {dt("noOrders")}
          </p>
        ) : (
          list.map((o) => (
            <div key={o.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground">{o.receiver?.name ?? "—"}</p>
                  <p className="num text-xs text-muted-foreground">
                    {o.reference_no || "—"} · {o.packet_count} {dt("packets")}
                  </p>
                  {o.description && <p className="mt-1 text-xs text-muted-foreground">{o.description}</p>}
                  {o.cancel_reason && <p className="mt-1 text-xs text-destructive">{o.cancel_reason}</p>}
                </div>
                <p className="num shrink-0 text-[11px] text-muted-foreground">
                  {new Date(o.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <div className="mt-3 flex gap-2">
                {o.status === "pending" && (
                  <Button variant="outline" size="sm" className="text-destructive" onClick={() => { setReason(""); setCancelling(o); }}>
                    <X className="size-4" />
                    {dt("cancelOrder")}
                  </Button>
                )}
                {(o.status === "failed" || o.status === "returned") && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => void run(() => bizRpc("business_requeue_order", { _order_id: o.id }), dt("requeued"))}
                  >
                    <RotateCcw className="size-4" />
                    {dt("sendAgain")}
                  </Button>
                )}
                {o.courier_order_id && (
                  <Button variant="ghost" size="sm" asChild className="ml-auto text-primary">
                    <Link to="/delivery/trip/$id" params={{ id: o.courier_order_id }}>
                      {dt("trip")}
                      <ChevronRight className="size-4" />
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={Boolean(cancelling)} onOpenChange={(v) => !v && setCancelling(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dt("cancelOrder")}</DialogTitle>
          </DialogHeader>
          <Input autoFocus placeholder={dt("cancelReason")} value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button
            variant="destructive"
            size="lg"
            disabled={!reason.trim() || busy}
            onClick={() => {
              const o = cancelling!;
              setCancelling(null);
              void run(() => bizRpc("business_cancel_order", { _order_id: o.id, _reason: reason.trim() }), dt("cancelled"));
            }}
          >
            {dt("cancelOrder")}
          </Button>
        </DialogContent>
      </Dialog>
    </DeliveryShell>
  );
}
