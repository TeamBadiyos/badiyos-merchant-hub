// Single place that loads the Google Maps JavaScript API in this app.
// Never add a second maps.googleapis.com script tag anywhere else.

declare global {
  interface Window {
    google?: typeof google;
    __badiyosInitMap?: () => void;
  }
}

let loadPromise: Promise<void> | null = null;

export function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.maps) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const key = import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY"] as
      | string
      | undefined;
    if (!key) {
      reject(new Error("Google Maps key not configured."));
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-badiyos-gmaps="1"]');
    if (existing) {
      const done = () => (window.google?.maps ? resolve() : reject(new Error("Maps failed")));
      existing.addEventListener("load", done);
      existing.addEventListener("error", () => reject(new Error("Maps failed")));
      return;
    }

    window.__badiyosInitMap = () => resolve();
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__badiyosInitMap`;
    script.async = true;
    script.dataset["badiyosGmaps"] = "1";
    script.onerror = () => reject(new Error("Failed to load Google Maps."));
    document.head.appendChild(script);
  }).catch((e) => {
    loadPromise = null;
    throw e;
  });

  return loadPromise;
}
