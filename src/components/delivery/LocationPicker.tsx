import { Crosshair } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useDT } from "@/lib/delivery/i18n";
import { loadGoogleMaps } from "@/lib/google-maps";

const LATUR = { lat: 18.4088, lng: 76.5604 };

/** Tap-to-pin Google map. The Maps script is loaded only in the browser. */
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
  const [error, setError] = useState(false);

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

  return (
    <div className="space-y-2">
      <div
        ref={el}
        className="h-56 w-full overflow-hidden rounded-xl border border-border bg-muted"
      />
      {error && <p className="text-xs text-destructive">{dt("mapUnavailable")}</p>}
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
