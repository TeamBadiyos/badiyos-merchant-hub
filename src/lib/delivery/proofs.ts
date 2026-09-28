import { supabase } from "@/integrations/supabase/client";

import { bizRpc } from "./api";
import { proofDownloadUrls } from "./proofs.functions";

export type ProofPhoto = {
  id: string;
  storage_path: string;
  seal_codes: string[] | null;
  captured_at: string | null;
  created_at: string;
  location_unverified: boolean | null;
  expert_id: string | null;
};

export type StopProofs = {
  stop_id?: string;
  status?: string;
  completed_via: "otp" | "photo" | null;
  completed_at?: string | null;
  proofs: ProofPhoto[];
};

export type ProofRow = {
  stop_id: string;
  courier_order_id: string;
  completed_at: string;
  completed_via: "otp" | "photo" | null;
  receiver_id: string | null;
  receiver_name: string | null;
  rider_name: string | null;
  seal_codes: string[];
  photo_paths: string[];
  location_unverified: boolean;
};

export const orderProofs = (id: string) => bizRpc<StopProofs>("business_order_proofs", { _order_id: id }, false);
export const stopProofs = (id: string) => bizRpc<StopProofs>("business_stop_proofs", { _stop_id: id }, false);
export const proofReport = (a: {
  merchantId: string; from: string; to: string; receiverId?: string | null; limit?: number; offset?: number;
}) =>
  bizRpc<{ total: number; rows: ProofRow[] }>(
    "business_proof_report",
    { _merchant_id: a.merchantId, _from: a.from, _to: a.to, _receiver_id: a.receiverId ?? null, _limit: a.limit ?? 100, _offset: a.offset ?? 0 },
    false,
  );

export async function proofSettings() {
  const { data } = await supabase
    .from("business_profiles")
    .select("drop_proof_mode, proof_retention_days" as never)
    .maybeSingle();
  return (data ?? null) as { drop_proof_mode: string | null; proof_retention_days: number | null } | null;
}

const cache = new Map<string, { url: string; at: number }>();
const TTL = 4 * 60_000;

function extract(body: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      for (const it of v) {
        const o = it as Record<string, unknown>;
        const p = (o?.["path"] ?? o?.["storage_path"]) as string | undefined;
        const u = (o?.["url"] ?? o?.["signed_url"] ?? o?.["signedUrl"]) as string | undefined;
        if (p && u) out[p] = u;
      }
      return;
    }
    const o = v as Record<string, unknown>;
    for (const k of ["urls", "items", "data", "files"]) if (k in o) walk(o[k]);
    for (const [k, val] of Object.entries(o)) if (typeof val === "string" && val.startsWith("http")) out[k] = val;
  };
  walk(body);
  return out;
}

/** Signed URLs for storage paths, in batches of 300, cached ~4 minutes. */
export async function signProofUrls(paths: string[], force = false): Promise<Record<string, string>> {
  const now = Date.now();
  const need = [...new Set(paths)].filter((p) => force || !cache.has(p) || now - cache.get(p)!.at > TTL);
  for (let i = 0; i < need.length; i += 300) {
    const { body } = await proofDownloadUrls({ data: { paths: need.slice(i, i + 300) } });
    const map = extract(JSON.parse(body));
    for (const [p, u] of Object.entries(map)) cache.set(p, { url: u, at: Date.now() });
  }
  return Object.fromEntries(paths.filter((p) => cache.has(p)).map((p) => [p, cache.get(p)!.url]));
}

export const istDate = (d: string | Date) =>
  new Date(new Date(d).getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
export const istTime = (d: string) =>
  new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
export const todayIst = () => istDate(new Date());
