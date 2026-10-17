/// <reference types="google.maps" />
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { LocationPicker } from "@/components/delivery/LocationPicker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { friendlyErrorMessage } from "@/lib/friendly-error";
import { loadGoogleMaps } from "@/lib/google-maps";
import { useI18n } from "@/lib/i18n";

const TX = {
  en: {
    title: "Pin your shop door", hint: "Drag the pin to your shop's door.", confirm: "Confirm shop location",
    noAddr: "Move the pin to get the address", location: "Shop location", set: "Set shop location", change: "Change location",
    none: "No location set — customers can't order until you set it.", pending: "Change pending approval", approved: "Approved",
    rejected: "Change rejected", reason: "Reason", sent: "Sent to badiyos for approval", saved: "Shop location saved",
    note: "Changing the location needs badiyos approval. Your current pin stays until approved.",
  },
  mr: {
    title: "दुकानाच्या दारावर पिन लावा", hint: "पिन दुकानाच्या दारावर ओढा.", confirm: "दुकानाचे ठिकाण निश्चित करा",
    noAddr: "पत्ता मिळवण्यासाठी पिन हलवा", location: "दुकानाचे ठिकाण", set: "दुकानाचे ठिकाण सेट करा", change: "ठिकाण बदला",
    none: "ठिकाण सेट नाही — ते सेट करेपर्यंत ग्राहक ऑर्डर करू शकत नाहीत.", pending: "बदल मंजुरीसाठी बाकी", approved: "मंजूर",
    rejected: "बदल नाकारला", reason: "कारण", sent: "मंजुरीसाठी badiyos कडे पाठवले", saved: "दुकानाचे ठिकाण सेव्ह झाले",
    note: "ठिकाण बदलण्यासाठी badiyos ची मंजुरी लागते. मंजुरीपर्यंत सध्याचा पिन राहील.",
  },
} as const;

export function useShopLocationText() {
  const { lang } = useI18n();
  return TX[lang === "mr" ? "mr" : "en"];
}

/** Full-screen map: opens on GPS, drag pin, shows address, "Confirm shop location". */
export function ShopLocationSheet({
  open, onOpenChange, lat, lng, address, busy, onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lat: number | null;
  lng: number | null;
  address: string;
  busy?: boolean;
  onConfirm: (lat: number, lng: number, address: string) => void;
}) {
  const L = useShopLocationText();
  const [c, setC] = useState<{ lat: number | null; lng: number | null }>({ lat, lng });
  const [addr, setAddr] = useState(address);
  useEffect(() => {
    if (open) { setC({ lat, lng }); setAddr(address); }
  }, [open, lat, lng, address]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="left-0 top-0 flex h-[100dvh] max-h-none w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-3 rounded-none border-0 p-4 pb-6 sm:left-1/2 sm:top-1/2 sm:h-[90dvh] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:border">
        <DialogHeader className="shrink-0 pr-8 text-left">
          <DialogTitle className="text-base font-extrabold">{L.title}</DialogTitle>
          <p className="text-xs text-muted-foreground">{L.hint}</p>
        </DialogHeader>
        {open && (
          <LocationPicker
            lat={c.lat}
            lng={c.lng}
            autoLocate
            onChange={(a, b) => setC({ lat: a, lng: b })}
            onAddress={setAddr}
            className="flex min-h-0 flex-1 flex-col"
            mapClassName="min-h-0 flex-1"
          />
        )}
        <div className="shrink-0 rounded-2xl border border-border bg-muted/40 px-3 py-2">
          <p className="flex items-start gap-2 text-sm font-semibold text-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
            {addr || <span className="text-muted-foreground">{L.noAddr}</span>}
          </p>
        </div>
        <Button
          disabled={c.lat == null || c.lng == null || busy}
          onClick={() => c.lat != null && c.lng != null && onConfirm(c.lat, c.lng, addr)}
          className="h-12 w-full shrink-0 rounded-2xl text-base font-bold"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : L.confirm}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/** Small read-only map with the saved pin. */
export function MiniMap({ lat, lng }: { lat: number; lng: number }) {
  const el = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let marker: google.maps.Marker | null = null;
    void loadGoogleMaps()
      .then(() => {
        if (!el.current || !window.google?.maps) return;
        const g = window.google.maps;
        const map = new g.Map(el.current, {
          center: { lat, lng }, zoom: 17, disableDefaultUI: true, gestureHandling: "none", clickableIcons: false,
        });
        marker = new g.Marker({ position: { lat, lng }, map });
      })
      .catch(() => setFailed(true));
    return () => marker?.setMap(null);
  }, [lat, lng]);
  if (failed) {
    return (
      <a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noreferrer"
        className="block rounded-xl border border-border p-3 text-xs font-bold text-primary">📍 {lat.toFixed(5)}, {lng.toFixed(5)}</a>
    );
  }
  return <div ref={el} className="h-36 w-full overflow-hidden rounded-xl border border-border bg-muted" />;
}

type Req = { id: string; status: string; rejection_reason: string | null; address: string };

/** Profile card: mini map + Set (first time, saves directly) / Change (goes to badiyos for approval). */
export function ShopLocationCard({
  merchant, isOwner, onSaved,
}: {
  merchant: { id: string; latitude: number | null; longitude: number | null; address: string | null };
  isOwner: boolean;
  onSaved: () => Promise<unknown> | void;
}) {
  const L = useShopLocationText();
  const { lang } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const has = merchant.latitude != null && merchant.longitude != null;

  const last = useQuery({
    queryKey: ["shop-location-request", merchant.id],
    enabled: isOwner,
    queryFn: async () => {
      const { data, error } = await supabase.from("merchant_location_change_requests" as never)
        .select("id,status,rejection_reason,address").eq("merchant_id", merchant.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data as Req | null;
    },
  });
  const r = last.data;
  const pending = r?.status === "pending";

  const confirm = async (lat: number, lng: number, address: string) => {
    setBusy(true);
    try {
      if (!has) {
        const patch = { latitude: lat, longitude: lng, ...(address.trim() ? { address: address.trim() } : {}) };
        const { error } = await supabase.from("merchants").update(patch).eq("id", merchant.id);
        if (error) throw error;
        toast.success(L.saved);
        await onSaved();
      } else {
        const { error } = await supabase.rpc("merchant_location_change_submit" as never, {
          _store_id: merchant.id, _lat: lat, _lng: lng, _address: address.trim() || merchant.address || "",
        } as never);
        if (error) throw error;
        toast.success(L.sent);
        await qc.invalidateQueries({ queryKey: ["shop-location-request", merchant.id] });
      }
      setOpen(false);
    } catch (e) {
      toast.error(friendlyErrorMessage(e as Error, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 py-3">
      <p className="text-[11px] font-semibold text-muted-foreground">{L.location}</p>
      {has ? (
        <MiniMap lat={merchant.latitude!} lng={merchant.longitude!} />
      ) : (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-bold text-destructive">{L.none}</p>
      )}
      {isOwner && r && (
        <p className={`text-xs font-bold ${pending ? "text-warning" : r.status === "approved" ? "text-success" : "text-destructive"}`}>
          {pending ? L.pending : r.status === "approved" ? L.approved : L.rejected}
          {r.status === "rejected" && r.rejection_reason ? ` · ${L.reason}: ${r.rejection_reason}` : ""}
        </p>
      )}
      {isOwner && (
        <>
          <Button variant={has ? "outline" : "default"} disabled={pending} onClick={() => setOpen(true)} className="w-full rounded-xl">
            <MapPin className="size-4" />
            {has ? L.change : L.set}
          </Button>
          {has && <p className="text-[11px] text-muted-foreground">{L.note}</p>}
          <ShopLocationSheet
            open={open}
            onOpenChange={setOpen}
            lat={merchant.latitude}
            lng={merchant.longitude}
            address={merchant.address ?? ""}
            busy={busy}
            onConfirm={(a, b, c) => void confirm(a, b, c)}
          />
        </>
      )}
    </div>
  );
}
