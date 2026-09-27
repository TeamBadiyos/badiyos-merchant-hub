/// <reference types="google.maps" />
import { useServerFn } from "@tanstack/react-start";
import { Crosshair, Loader2, MapPin, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDT } from "@/lib/delivery/i18n";
import {
  addressFromLatLng,
  resolveAddress,
  searchAddress,
  type AddressSuggestion,
} from "@/lib/delivery/places.functions";
import { loadGoogleMaps } from "@/lib/google-maps";

const LATUR = { lat: 18.4088, lng: 76.5604 };

/**
 * Address search + tap-to-pin Google map.
 * Picking a search result moves the pin; moving the pin fills the address back.
 */
export function LocationPicker({
  lat,
  lng,
  onChange,
  onAddress,
}: {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
  onAddress?: (address: string) => void;
}) {
  const dt = useDT();
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<{ set: (lat: number, lng: number) => void } | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;
  const addrCb = useRef(onAddress);
  addrCb.current = onAddress;
  const [error, setError] = useState(false);

  const doSearch = useServerFn(searchAddress);
  const doResolve = useServerFn(resolveAddress);
  const doReverse = useServerFn(addressFromLatLng);

  const [q, setQ] = useState("");
  const [items, setItems] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const token = useMemo(() => crypto.randomUUID(), []);
  const reqId = useRef(0);
  const skipReverse = useRef(false);

  // Fill the address box from whatever the pin now points at.
  const reverse = (a: number, b: number) => {
    if (!addrCb.current) return;
    setPinBusy(true);
    void doReverse({ data: { lat: a, lng: b } })
      .then((r) => {
        if (r.address) addrCb.current?.(r.address);
      })
      .catch(() => undefined)
      .finally(() => setPinBusy(false));
  };

  useEffect(() => {
    let disposed = false;
    let marker: google.maps.Marker | null = null;

    void loadGoogleMaps()
      .then(() => {
        if (disposed || !el.current || !window.google?.maps) return;
        const g = window.google.maps;
        const start = lat != null && lng != null ? { lat, lng } : LATUR;
        const map = new g.Map(el.current, {
          center: start,
          zoom: lat != null ? 17 : 13,
          clickableIcons: false,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
        });
        marker = new g.Marker({
          position: start,
          map: lat != null ? map : null,
          draggable: true,
        });

        const set = (a: number, b: number) => {
          const p = { lat: a, lng: b };
          marker?.setPosition(p);
          marker?.setMap(map);
          map.panTo(p);
          if ((map.getZoom() ?? 13) < 16) map.setZoom(16);
          cb.current(Number(a.toFixed(6)), Number(b.toFixed(6)));
          if (skipReverse.current) skipReverse.current = false;
          else reverse(Number(a.toFixed(6)), Number(b.toFixed(6)));
        };
        api.current = { set };

        map.addListener("click", (e: google.maps.MapMouseEvent) => {
          if (e.latLng) set(e.latLng.lat(), e.latLng.lng());
        });
        marker.addListener("dragend", () => {
          const p = marker?.getPosition();
          if (p) set(p.lat(), p.lng());
        });
      })
      .catch(() => {
        if (!disposed) setError(true);
      });

    return () => {
      disposed = true;
      marker?.setMap(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced address search.
  useEffect(() => {
    const text = q.trim();
    if (text.length < 3) {
      setItems([]);
      setOpen(false);
      return;
    }
    const id = ++reqId.current;
    setSearching(true);
    const t = setTimeout(() => {
      void doSearch({ data: { input: text, sessionToken: token } })
        .then((r) => {
          if (id !== reqId.current) return;
          setItems(r);
          setOpen(true);
        })
        .catch(() => {
          if (id === reqId.current) setItems([]);
        })
        .finally(() => {
          if (id === reqId.current) setSearching(false);
        });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const pick = (s: AddressSuggestion) => {
    setOpen(false);
    setQ(s.text);
    setSearching(true);
    void doResolve({ data: { placeId: s.placeId, sessionToken: token } })
      .then((r) => {
        skipReverse.current = true;
        api.current?.set(r.lat, r.lng);
        if (r.address) addrCb.current?.(r.address);
      })
      .catch(() => undefined)
      .finally(() => setSearching(false));
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-11 pl-9"
          placeholder={dt("searchAddress")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => items.length > 0 && setOpen(true)}
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
        {open && items.length > 0 && (
          <ul className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
            {items.map((s) => (
              <li key={s.placeId}>
                <button
                  type="button"
                  className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm hover:bg-accent"
                  onClick={() => pick(s)}
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{s.text}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div
        ref={el}
        className="h-56 w-full overflow-hidden rounded-xl border border-border bg-muted"
      />
      {error && <p className="text-xs text-destructive">{dt("mapUnavailable")}</p>}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {pinBusy ? dt("gettingAddress") : dt("pinOnMap")}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            navigator.geolocation?.getCurrentPosition((p) =>
              api.current?.set(p.coords.latitude, p.coords.longitude),
            )
          }
        >
          <Crosshair className="size-4" />
          {dt("useMyLocation")}
        </Button>
      </div>
    </div>
  );
}
