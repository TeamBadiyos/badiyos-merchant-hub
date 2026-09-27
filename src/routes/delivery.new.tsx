import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Keyboard, Loader2, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { DeliveryShell, deliveryHead } from "@/components/delivery/DeliveryShell";
import { PlaceForm } from "@/components/delivery/PlaceForm";
import { QrScanner } from "@/components/delivery/QrScanner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { playOrderChime } from "@/lib/alert-sound";
import { useAuth } from "@/lib/auth";
import { getProfile, listOrders, listReceivers, type Receiver } from "@/lib/delivery/api";
import { useDT } from "@/lib/delivery/i18n";
import { createPacketOrders, sealCheck, sealDisplay, sealErrorText } from "@/lib/delivery/seals";
import { hapticNotify } from "@/lib/haptics";
import { useFriendlyError } from "@/lib/use-friendly-error";

export const Route = createFileRoute("/delivery/new")({
  head: () => deliveryHead("New delivery order", "Scan packet stickers and send them to a receiver."),
  component: NewOrder,
});

type Chip = { code: string; method: "scan" | "manual"; error?: string | undefined };
const PICKUP_KEY = "badiyos.delivery.lastPickup";

function NewOrder() {
  const dt = useDT();
  const friendly = useFriendlyError();
  const qc = useQueryClient();
  const { merchant } = useAuth();
  const mid = merchant?.id ?? "";
  const receivers = useQuery({ queryKey: ["biz", "receivers"], queryFn: listReceivers });
  const orders = useQuery({ queryKey: ["biz", "orders"], queryFn: listOrders });
  const profile = useQuery({ queryKey: ["biz", "profile"], queryFn: getProfile });
  const pickups = (profile.data?.pickup_points ?? []).filter((p) => p.is_active);

  const [chips, setChips] = useState<Chip[]>([]);
  const chipsRef = useRef(chips);
  chipsRef.current = chips;
  const checking = useRef(new Set<string>());
  const [typing, setTyping] = useState(false);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [cameraRetry, setCameraRetry] = useState(0);
  const [typed, setTyped] = useState("");
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  const [receiverId, setReceiverId] = useState<string | null>(null);
  const [pickupId, setPickupId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (pickupId || !pickups.length) return;
    const saved = localStorage.getItem(PICKUP_KEY);
    const p = pickups.find((x) => x.id === saved) ?? pickups.find((x) => x.is_default) ?? pickups[0]!;
    setPickupId(p.id);
  }, [pickups, pickupId]);

  const addCode = async (raw: string, method: "scan" | "manual") => {
    const text = raw.trim();
    if (!text || !mid || checking.current.has(text)) return false;
    checking.current.add(text);
    try {
      const r = await sealCheck(mid, text);
      if (r.code && chipsRef.current.some((c) => c.code === r.code)) {
        toast(dt("alreadyAdded"));
        return true;
      }
      if (!r.ok || !r.code) {
        hapticNotify("error");
        toast.error(sealErrorText(r, dt));
        return false;
      }
      playOrderChime();
      hapticNotify("success");
      setChips((c) => [...c, { code: r.code!, method }]);
      return true;
    } catch (e) {
      toast.error(friendly(e));
      return false;
    } finally {
      checking.current.delete(text);
    }
  };

  const active = (receivers.data ?? []).filter((r) => r.is_active);
  const chosen = active.find((r) => r.id === receiverId);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of orders.data ?? []) {
      if (!o.receiver_id) continue;
      m.set(o.receiver_id, (m.get(o.receiver_id) ?? 0) + 1);
    }
    return m;
  }, [orders.data]);
  const ranked = useMemo(
    () =>
      [...active].sort(
        (a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.name.localeCompare(b.name),
      ),
    [active, counts],
  );
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return ranked;
    return ranked.filter(
      (r) =>
        r.name.toLowerCase().includes(s) ||
        (r.contact_name ?? "").toLowerCase().includes(s) ||
        (r.contact_phone ?? "").includes(s),
    );
  }, [ranked, q]);


  const place = async () => {
    if (!receiverId || !pickupId || !chips.length) return;
    setBusy(true);
    try {
      const res = await createPacketOrders(
        mid,
        receiverId,
        pickupId,
        chips.map((c) => c.code),
        chips.map((c) => c.method),
      );
      if (!res.ok) {
        const fails = res.failed;
        setChips((cs) =>
          cs.map((c, i) => {
            const f = fails.find((x) => x.index === i + 1);
            return f ? { ...c, error: sealErrorText(f, dt) } : { ...c, error: undefined };
          }),
        );
        hapticNotify("error");
        toast.error(dt("fixRedStickers"));
        return;
      }
      toast.success(`${chips.length} ${dt("ordersPlaced")}`);
      hapticNotify("success");
      setChips([]);
      setReceiverId(null);
      void qc.invalidateQueries({ queryKey: ["biz"] });
    } catch (e) {
      toast.error(friendly(e));
    } finally {
      setBusy(false);
    }
  };

  const rRow = (r: Receiver, i: number) => {
    const n = counts.get(r.id) ?? 0;
    return (
      <button
        key={r.id}
        onClick={() => {
          setReceiverId(r.id);
          setPicking(false);
          setQ("");
        }}
        className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3 text-left"
      >
        <span className="num w-6 shrink-0 text-sm font-extrabold text-muted-foreground">{i + 1}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-foreground">{r.name}</span>
          <span className="num block truncate text-xs text-muted-foreground">
            {[r.contact_name, r.contact_phone, r.address].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${
            n > 0 ? "bg-primary-soft text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          {n > 0 ? `${n} ${dt("ordersWord")}` : dt("newReceiver")}
        </span>
      </button>
    );
  };


  const placeBar = (
    <Button
      size="lg"
      className="h-14 w-full text-base font-bold"
      disabled={busy || !chips.length || !chosen || !pickupId}
      onClick={() => void place()}
    >
      {busy && <Loader2 className="size-4 animate-spin" />}
      <span className="truncate">
        {dt("placeOrder")} — {chips.length} {dt("packetsCount")}
        {chosen ? ` → ${chosen.name}` : ""}
      </span>
    </Button>
  );

  return (
    <DeliveryShell title={dt("newOrder")} footer={placeBar}>
      <div className="space-y-4 pb-4">

        {cameraFailed ? (
          <div className="flex h-[45vh] flex-col items-center justify-center gap-3 rounded-2xl bg-muted p-4 text-center">
            <p className="text-sm font-bold text-foreground">{dt("cameraFailedTitle")}</p>
            <Button size="lg" className="h-12 w-full font-bold" onClick={() => { setTyped(""); setTyping(true); }}>
              <Keyboard className="size-4" />
              {dt("typeNumber")}
            </Button>
            <button
              className="text-xs font-semibold text-primary underline"
              onClick={() => {
                setCameraFailed(false);
                setCameraRetry((n) => n + 1);
              }}
            >
              {dt("tryCameraAgain")}
            </button>
          </div>
        ) : (
          <QrScanner
            key={cameraRetry}
            className="h-[45vh]"
            paused={typing || picking || adding}
            onCode={(t) => void addCode(t, "scan")}
            onFailed={() => {
              setCameraFailed(true);
              setTyped("");
              setTyping(true);
            }}
          />
        )}
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-foreground">
            <span className="num text-lg font-extrabold text-primary">{chips.length}</span> {dt("packetsCount")}
          </p>
          {!cameraFailed && (
            <Button variant="outline" size="sm" onClick={() => { setTyped(""); setTyping(true); }}>
              <Keyboard className="size-4" />
              {dt("typeNumber")}
            </Button>
          )}
        </div>
        {chips.length === 0 ? (
          <p className="text-xs text-muted-foreground">{dt("scanStickers")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <div
                key={c.code}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${
                  c.error ? "border-destructive bg-destructive/10 text-destructive" : "border-primary bg-primary-soft text-primary"
                }`}
              >
                <span className="num">{sealDisplay(c.code)}</span>
                {!c.error && <Check className="size-3.5" />}
                {c.method === "manual" && <span className="rounded bg-background px-1 text-[10px] font-semibold">{dt("manual")}</span>}
                <button aria-label="Remove" onClick={() => setChips((cs) => cs.filter((x) => x.code !== c.code))}>
                  <X className="size-3.5" />
                </button>
                {c.error && <span className="basis-full text-[11px] font-medium">{c.error}</span>}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground">{dt("receiver")}</Label>
          {chosen ? (
            <div className="flex items-center gap-3 rounded-xl border-2 border-primary bg-primary-soft p-3">
              <Check className="size-5 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-foreground">{chosen.name}</p>
                <p className="num truncate text-xs text-muted-foreground">{chosen.contact_phone} · {chosen.address}</p>
              </div>
              <Button variant="ghost" size="sm" className="text-primary" onClick={() => setPicking(true)}>
                {dt("changeReceiver")}
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="lg" className="h-12 w-full" disabled={!chips.length} onClick={() => setPicking(true)}>
              {dt("selectReceiver")}
            </Button>
          )}
        </div>

        {pickups.length === 0 ? (
          <p className="text-sm text-destructive">{dt("noPickups")}</p>
        ) : pickups.length > 1 ? (
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">{dt("pickupPoint")}</Label>
            <select
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={pickupId ?? ""}
              onChange={(e) => {
                setPickupId(e.target.value);
                localStorage.setItem(PICKUP_KEY, e.target.value);
              }}
            >
              {pickups.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        ) : null}
      </div>


      <Dialog open={typing} onOpenChange={setTyping}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dt("stickerNumber")}</DialogTitle></DialogHeader>
          <Input
            autoFocus
            inputMode="numeric"
            placeholder="104521-7"
            value={typed}
            onChange={(e) => setTyped(e.target.value.replace(/[^\d-]/g, ""))}
          />
          <Button
            size="lg"
            disabled={!typed.replace(/\D/g, "")}
            onClick={async () => {
              if (await addCode(typed, "manual")) setTyping(false);
            }}
          >
            {dt("check")}
          </Button>
        </DialogContent>
      </Dialog>

      <Sheet open={picking} onOpenChange={setPicking}>
        <SheetContent
          side="bottom"
          className="flex max-h-[88vh] flex-col gap-0 rounded-t-3xl p-0"
        >
          <div className="shrink-0 space-y-3 border-b border-border px-4 pt-3 pb-3">
            <div className="mx-auto h-1.5 w-10 rounded-full bg-border" />
            <SheetHeader className="space-y-0 text-left">
              <SheetTitle className="text-base font-extrabold">{dt("selectReceiver")}</SheetTitle>
            </SheetHeader>
            <div className="relative">
              <Search className="absolute top-3.5 left-3 size-4 text-muted-foreground" />
              <Input
                className="h-11 pl-9"
                placeholder={dt("searchReceiver")}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {!q.trim() && matches.length > 0 && (
              <p className="pb-2 text-xs font-bold text-muted-foreground">{dt("topReceivers")}</p>
            )}
            <div className="divide-y divide-border rounded-xl border border-border">
              {matches.map(rRow)}
            </div>
          </div>
          <div className="safe-bottom shrink-0 border-t border-border p-4">
            <Button
              variant="outline"
              className="h-12 w-full font-bold"
              onClick={() => {
                setPicking(false);
                setAdding(true);
              }}
            >
              <Plus className="size-4" />
              {dt("addReceiver")}
            </Button>
          </div>
        </SheetContent>
      </Sheet>


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
