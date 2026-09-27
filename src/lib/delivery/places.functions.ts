// Address search + reverse geocoding for delivery place forms.
// Google Places/Geocoding are called server-side through the connector gateway
// (the browser key is only allowed to render maps).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";
// Bias suggestions around Latur, Maharashtra (the service area).
const BIAS = { lat: 18.4088, lng: 76.5604, radius: 60000 };

function creds() {
  const lovable = process.env["LOVABLE_API_KEY"];
  const key = process.env["GOOGLE_MAPS_API_KEY"];
  if (!lovable || !key) throw new Error("Address search is not configured.");
  return {
    Authorization: `Bearer ${lovable}`,
    "X-Connection-Api-Key": key,
    "Content-Type": "application/json",
  };
}

async function readError(res: Response): Promise<never> {
  const body = await res.text();
  console.error(`[places] ${res.status} ${body}`);
  throw new Error("Address search is not available right now.");
}

export type AddressSuggestion = { placeId: string; text: string };

export const searchAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ input: z.string().trim().min(3).max(200), sessionToken: z.string().min(8).max(64) }).parse(d),
  )
  .handler(async ({ data }): Promise<AddressSuggestion[]> => {
    const res = await fetch(`${GATEWAY}/places/v1/places:autocomplete`, {
      method: "POST",
      headers: {
        ...creds(),
        "X-Goog-FieldMask":
          "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
      },
      body: JSON.stringify({
        input: data.input,
        sessionToken: data.sessionToken,
        includedRegionCodes: ["in"],
        locationBias: {
          circle: { center: { latitude: BIAS.lat, longitude: BIAS.lng }, radius: BIAS.radius },
        },
      }),
    });
    if (!res.ok) await readError(res);
    const json = (await res.json()) as {
      suggestions?: { placePrediction?: { placeId?: string; text?: { text?: string } } }[];
    };
    return (json.suggestions ?? [])
      .map((s) => ({ placeId: s.placePrediction?.placeId ?? "", text: s.placePrediction?.text?.text ?? "" }))
      .filter((s) => s.placeId && s.text)
      .slice(0, 6);
  });

export type ResolvedAddress = { address: string; lat: number; lng: number };

export const resolveAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ placeId: z.string().min(5).max(300), sessionToken: z.string().min(8).max(64) }).parse(d),
  )
  .handler(async ({ data }): Promise<ResolvedAddress> => {
    const url = `${GATEWAY}/places/v1/places/${encodeURIComponent(data.placeId)}?sessionToken=${encodeURIComponent(data.sessionToken)}`;
    const res = await fetch(url, {
      headers: { ...creds(), "X-Goog-FieldMask": "formattedAddress,displayName,location" },
    });
    if (!res.ok) await readError(res);
    const json = (await res.json()) as {
      formattedAddress?: string;
      displayName?: { text?: string };
      location?: { latitude?: number; longitude?: number };
    };
    const lat = json.location?.latitude;
    const lng = json.location?.longitude;
    if (lat == null || lng == null) throw new Error("This place has no location. Pick it on the map.");
    const name = json.displayName?.text;
    const formatted = json.formattedAddress ?? "";
    const address = name && !formatted.startsWith(name) ? `${name}, ${formatted}` : formatted;
    return { address, lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
  });

export const addressFromLatLng = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).parse(d))
  .handler(async ({ data }): Promise<{ address: string }> => {
    const res = await fetch(
      `${GATEWAY}/maps/api/geocode/json?latlng=${data.lat},${data.lng}&region=in`,
      { headers: creds() },
    );
    if (!res.ok) await readError(res);
    const json = (await res.json()) as { results?: { formatted_address?: string }[] };
    return { address: json.results?.[0]?.formatted_address ?? "" };
  });
