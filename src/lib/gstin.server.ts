/** Server-only GSTIN lookup. GSTIN_API_KEY never leaves the server runtime. */

export type GstinLookup = {
  gstin: string;
  legal_name: string;
  trade_name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  status: string;
};

export type GstinResult =
  | { ok: true; data: GstinLookup }
  | { ok: false; code: string; message: string };

const MAX_ATTEMPTS = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function pick(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function flatten(input: unknown, depth = 0): Record<string, unknown> {
  if (!input || typeof input !== "object" || depth > 4) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (value && typeof value === "object") Object.assign(out, flatten(value, depth + 1));
    else if (!(key in out)) out[key] = value;
  }
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!value || typeof value !== "object") out[key] = value;
  }
  return out;
}

export async function lookupGstin(gstin: string): Promise<GstinResult> {
  const apiKey = process.env["GSTIN_API_KEY"];
  if (!apiKey) {
    console.error("[verify-gstin] GSTIN_API_KEY missing");
    return { ok: false, code: "NOT_CONFIGURED", message: "GST verification is not configured yet." };
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Response;
    try {
      response = await fetch(`https://www.gstinapi.in/v1/gstin/${gstin}`, {
        headers: { "x-api-key": apiKey, Accept: "application/json" },
      });
    } catch (error) {
      console.error("[verify-gstin] network error", error);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(400 * attempt);
        continue;
      }
      return {
        ok: false,
        code: "NETWORK",
        message: "Could not reach the GST service. Please try again or enter details manually.",
      };
    }

    if (response.status === 429 || response.status === 502) {
      if (attempt < MAX_ATTEMPTS) {
        await sleep(500 * attempt * attempt);
        continue;
      }
      return response.status === 429
        ? {
            ok: false,
            code: "RATE_LIMITED",
            message: "GST service is busy right now. Please try again in a minute.",
          }
        : {
            ok: false,
            code: "UPSTREAM",
            message: "GST service is temporarily unavailable. Please try again shortly.",
          };
    }

    if (response.status === 404) {
      return {
        ok: false,
        code: "NOT_FOUND",
        message: "This GSTIN was not found. Please check the number.",
      };
    }
    if (response.status === 400) {
      return { ok: false, code: "BAD_REQUEST", message: "This GSTIN format is not valid." };
    }
    if (response.status === 402) {
      return {
        ok: false,
        code: "QUOTA",
        message: "GST verification quota is exhausted. Please enter your details manually.",
      };
    }
    if (response.status === 401 || response.status === 403) {
      console.error("[verify-gstin] auth rejected", response.status);
      return {
        ok: false,
        code: "FORBIDDEN",
        message: "GST verification is unavailable right now. Please enter your details manually.",
      };
    }
    if (!response.ok) {
      console.error("[verify-gstin] unexpected status", response.status);
      return {
        ok: false,
        code: "UNKNOWN",
        message: "GST verification failed. Please enter your details manually.",
      };
    }

    const payload = (await response.json()) as unknown;
    const flat = flatten(payload);
    return {
      ok: true,
      data: {
        gstin,
        legal_name: pick(flat, ["legal_name", "legalName", "lgnm", "name"]),
        trade_name: pick(flat, ["trade_name", "tradeName", "tradeNam", "tradenam"]),
        address: pick(flat, ["address", "adr", "full_address", "principal_address", "bnm"]),
        city: pick(flat, ["city", "dst", "district", "loc", "locality"]),
        state: pick(flat, ["state", "stcd", "state_name"]),
        pincode: pick(flat, ["pincode", "pin", "pncd", "zip"]),
        status: pick(flat, ["status", "sts", "gst_status", "gstin_status"]) || "Unknown",
      },
    };
  }

  return { ok: false, code: "UNKNOWN", message: "GST verification failed. Please try again." };
}
