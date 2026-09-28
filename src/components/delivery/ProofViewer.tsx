import { useQuery } from "@tanstack/react-query";
import { Camera, ChevronLeft, ChevronRight, KeyRound, Loader2, MapPinOff, X } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDT } from "@/lib/delivery/i18n";
import { sealDisplay } from "@/lib/delivery/seals";
import { istTime, orderProofs, signProofUrls, stopProofs } from "@/lib/delivery/proofs";

export type ViewerPhoto = { path: string; time?: string | null; seals?: string[] | null; unverified?: boolean | null };

export function ProofBadge({ via }: { via: "otp" | "photo" | null | undefined }) {
  const dt = useDT();
  if (!via) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-bold text-primary">
      {via === "photo" ? <Camera className="size-3" /> : <KeyRound className="size-3" />}
      {via === "photo" ? dt("viaPhoto") : dt("viaOtp")}
    </span>
  );
}

/** Full-screen photo viewer with pinch zoom and swipe/arrow navigation. */
export function PhotoViewer({ photos, index, rider, onClose }: {
  photos: ViewerPhoto[]; index: number | null; rider?: string | null | undefined; onClose: () => void;
}) {
  const dt = useDT();
  const [i, setI] = useState(index ?? 0);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const g = useRef<{ d?: number; s?: number; x?: number; y?: number; px?: number; py?: number; sx?: number }>({});
  const urls = useQuery({
    queryKey: ["biz", "proof-urls", photos.map((p) => p.path).join("|")],
    queryFn: () => signProofUrls(photos.map((p) => p.path)),
    enabled: index !== null && photos.length > 0,
    staleTime: 3 * 60_000,
  });
  if (index === null) return null;
  const p = photos[i];
  if (!p) return null;
  const go = (n: number) => { setI((n + photos.length) % photos.length); setScale(1); setPos({ x: 0, y: 0 }); };
  const dist = (t: React.TouchList) => Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-foreground">
      <div className="safe-top flex items-center justify-between p-3 text-background">
        <span className="num text-sm font-bold">{i + 1}/{photos.length}</span>
        <button aria-label={dt("close")} onClick={onClose} className="rounded-full bg-background/20 p-2"><X className="size-5" /></button>
      </div>
      <div
        className="relative flex-1 touch-none overflow-hidden"
        onTouchStart={(e) => {
          if (e.touches.length === 2) g.current = { d: dist(e.touches), s: scale };
          else g.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY, px: pos.x, py: pos.y, sx: e.touches[0]!.clientX };
        }}
        onTouchMove={(e) => {
          if (e.touches.length === 2 && g.current.d) setScale(Math.min(5, Math.max(1, (g.current.s ?? 1) * (dist(e.touches) / g.current.d))));
          else if (e.touches.length === 1 && scale > 1 && g.current.x !== undefined)
            setPos({ x: (g.current.px ?? 0) + e.touches[0]!.clientX - g.current.x, y: (g.current.py ?? 0) + e.touches[0]!.clientY - (g.current.y ?? 0) });
        }}
        onTouchEnd={(e) => {
          if (scale <= 1 && g.current.sx !== undefined && e.changedTouches[0] && photos.length > 1) {
            const dx = e.changedTouches[0].clientX - g.current.sx;
            if (Math.abs(dx) > 60) go(i + (dx < 0 ? 1 : -1));
          }
          if (scale <= 1) setPos({ x: 0, y: 0 });
        }}
        onDoubleClick={() => { setScale(scale > 1 ? 1 : 2.5); setPos({ x: 0, y: 0 }); }}
      >
        {urls.data?.[p.path] ? (
          <img
            src={urls.data[p.path]}
            alt={dt("billPhoto")}
            className="absolute inset-0 m-auto max-h-full max-w-full object-contain"
            style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})` }}
            onError={() => void signProofUrls([p.path], true).then(() => urls.refetch())}
          />
        ) : urls.isError ? (
          <p className="p-6 text-center text-sm text-background">{dt("proofLoadFailed")}</p>
        ) : (
          <Loader2 className="absolute inset-0 m-auto size-8 animate-spin text-background" />
        )}
        {photos.length > 1 && (
          <>
            <button aria-label="prev" onClick={() => go(i - 1)} className="absolute left-2 top-1/2 rounded-full bg-background/20 p-2 text-background"><ChevronLeft className="size-5" /></button>
            <button aria-label="next" onClick={() => go(i + 1)} className="absolute right-2 top-1/2 rounded-full bg-background/20 p-2 text-background"><ChevronRight className="size-5" /></button>
          </>
        )}
      </div>
      <div className="safe-bottom space-y-1 p-4 text-sm text-background">
        <p className="num font-bold">
          {p.time ? new Date(p.time).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : ""}
          {rider ? ` · ${rider}` : ""}
        </p>
        {p.seals?.length ? <p className="num text-xs">{p.seals.map(sealDisplay).join(", ")}</p> : null}
        {p.unverified && (
          <span className="inline-flex items-center gap-1 rounded-full bg-background/20 px-2 py-0.5 text-[11px] font-bold">
            <MapPinOff className="size-3" /> {dt("locationFirstTime")}
          </span>
        )}
      </div>
    </div>
  );
}

/** Thumbnails for a proof set; tap opens the full-screen viewer. */
export function ProofThumbs({ photos, rider }: { photos: ViewerPhoto[]; rider?: string | null }) {
  const [open, setOpen] = useState<number | null>(null);
  const urls = useQuery({
    queryKey: ["biz", "proof-urls", photos.map((p) => p.path).join("|")],
    queryFn: () => signProofUrls(photos.map((p) => p.path)),
    enabled: photos.length > 0,
    staleTime: 3 * 60_000,
  });
  if (!photos.length) return null;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {photos.map((p, k) => (
          <button key={p.path} onClick={() => setOpen(k)} className="size-16 overflow-hidden rounded-lg border border-border bg-muted">
            {urls.data?.[p.path] ? <img src={urls.data[p.path]} alt="" className="size-full object-cover" /> : <Camera className="m-auto size-5 text-muted-foreground" />}
          </button>
        ))}
      </div>
      {open !== null && <PhotoViewer key={open} photos={photos} index={open} rider={rider} onClose={() => setOpen(null)} />}
    </>
  );
}

/** Inline proof block for a delivered drop stop (trip detail). */
export function StopProofBlock({ stopId, rider }: { stopId: string; rider?: string | null }) {
  const q = useQuery({ queryKey: ["biz", "stop-proofs", stopId], queryFn: () => stopProofs(stopId) });
  if (!q.data?.completed_via) return null;
  const photos = q.data.proofs.map((d) => ({ path: d.storage_path, time: d.captured_at ?? d.created_at, seals: d.seal_codes, unverified: d.location_unverified }));
  return (
    <div className="mt-3 space-y-2">
      <ProofBadge via={q.data.completed_via} />
      <ProofThumbs photos={photos} rider={rider} />
    </div>
  );
}

/** "Proof" button for a delivered order (orders list). */
export function OrderProofButton({ orderId }: { orderId: string }) {
  const dt = useDT();
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ["biz", "order-proofs", orderId], queryFn: () => orderProofs(orderId), enabled: open });
  const photos = (q.data?.proofs ?? []).map((d) => ({ path: d.storage_path, time: d.captured_at ?? d.created_at, seals: d.seal_codes, unverified: d.location_unverified }));
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Camera className="size-4" /> {dt("proof")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dt("deliveryProof")}</DialogTitle></DialogHeader>
          {q.isLoading ? <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" /> : q.error ? (
            <p className="text-sm text-destructive">{dt("proofLoadFailed")}</p>
          ) : !q.data?.completed_via ? (
            <p className="text-sm text-muted-foreground">{dt("noProofYet")}</p>
          ) : (
            <div className="space-y-3">
              <ProofBadge via={q.data.completed_via} />
              {q.data.completed_at && <p className="num text-xs text-muted-foreground">{istTime(q.data.completed_at)}</p>}
              <ProofThumbs photos={photos} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
