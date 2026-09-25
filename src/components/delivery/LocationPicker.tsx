import { Crosshair } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { useDT } from "@/lib/delivery/i18n";

const LATUR: [number, number] = [18.4088, 76.5604];

/** Tap-to-pin map (OpenStreetMap). Leaflet is loaded only in the browser. */
export function LocationPicker({
  lat,
  lng,
  onChange,
}: {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
}) {
  const dt = useDT();
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<{ set: (lat: number, lng: number) => void } | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let disposed = false;
    void (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (disposed || !el.current) return;
      const start: [number, number] = lat != null && lng != null ? [lat, lng] : LATUR;
      map = L.map(el.current).setView(start, lat != null ? 16 : 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);
      const marker = L.circleMarker(start, { radius: 10, color: "#800080", fillOpacity: 0.8 });
      if (lat != null) marker.addTo(map);
      const set = (a: number, b: number) => {
        marker.setLatLng([a, b]);
        if (map && !map.hasLayer(marker)) marker.addTo(map);
        map?.setView([a, b], Math.max(map.getZoom(), 16));
        cb.current(Number(a.toFixed(6)), Number(b.toFixed(6)));
      };
      api.current = { set };
      map.on("click", (e) => set(e.latlng.lat, e.latlng.lng));
    })();
    return () => {
      disposed = true;
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2">
      <div ref={el} className="h-56 w-full overflow-hidden rounded-xl border border-border" />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{dt("pinOnMap")}</p>
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
