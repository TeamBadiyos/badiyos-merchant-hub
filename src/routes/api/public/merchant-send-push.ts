import { createFileRoute } from "@tanstack/react-router";

/**
 * merchant-send-push — data-only FCM v1 sender for new merchant orders.
 *
 * Mirrors the shared project's `expert-send-push` contract exactly:
 *  - authenticated with the `x-trigger-secret` header (same
 *    `edge_runtime_config.push_trigger_secret` value the expert triggers use)
 *  - Firebase service account credentials from FIREBASE_SERVICE_ACCOUNT_JSON
 *  - data-only message (NO `notification` block) so the Android app always
 *    wakes and raises its own full-screen ringing alert
 *  - android.priority = HIGH, data carries
 *    type/order_id/title/body/amount/timeout_seconds
 *
 * Called by the `notify_merchant_new_order` DB trigger on merchant_orders.
 */

type Payload = {
  order_id?: string;
  merchant_id?: string;
  alert_type?: string;
  title?: string;
  body?: string;
  amount?: number | string | null;
  timeout_seconds?: number;
};

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): Uint8Array {
  const raw = atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function googleAccessToken(sa: {
  client_email: string;
  private_key: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const enc = new TextEncoder();
  const header = b64url(enc.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = b64url(
    enc.encode(
      JSON.stringify({
        iss: sa.client_email,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      }),
    ),
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(`${header}.${claims}`)),
  );
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${b64url(sig)}`,
    }),
  });
  const json = (await res.json()) as { access_token?: string; error_description?: string };
  if (!json.access_token) throw new Error(json.error_description ?? "token_exchange_failed");
  return json.access_token;
}

export const Route = createFileRoute("/api/public/merchant-send-push")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["PUSH_TRIGGER_SECRET"] ?? "";
        const provided = request.headers.get("x-trigger-secret") ?? "";
        if (!expected || provided !== expected) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }

        try {
          const payload = (await request.json()) as Payload;
          if (!payload.order_id || !payload.merchant_id) {
            return Response.json({ error: "order_id_and_merchant_id_required" }, { status: 400 });
          }

          const sa = JSON.parse(process.env["FIREBASE_SERVICE_ACCOUNT_JSON"] ?? "{}") as {
            client_email?: string;
            private_key?: string;
            project_id?: string;
          };
          if (!sa.client_email || !sa.private_key || !sa.project_id) {
            return Response.json({ error: "firebase_service_account_missing" }, { status: 500 });
          }

          const supabaseUrl = process.env["SUPABASE_URL"]!;
          const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
          const tokensRes = await fetch(
            `${supabaseUrl}/rest/v1/device_tokens?select=fcm_token&user_type=eq.merchant&user_id=eq.${payload.merchant_id}`,
            { headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` } },
          );
          if (!tokensRes.ok) {
            return Response.json({ error: await tokensRes.text() }, { status: 500 });
          }
          const tokens = (await tokensRes.json()) as { fcm_token: string }[];
          if (!tokens.length) return Response.json({ sent: 0, reason: "no_tokens" });

          const bearer = await googleAccessToken({
            client_email: sa.client_email,
            private_key: sa.private_key,
          });

          const data: Record<string, string> = {
            type: payload.alert_type ?? "new_order",
            order_id: payload.order_id,
            title: payload.title ?? "New order",
            body: payload.body ?? "You have a new order waiting.",
            amount: payload.amount == null ? "" : String(payload.amount),
            timeout_seconds: String(payload.timeout_seconds ?? 45),
          };

          let sent = 0;
          let failed = 0;
          for (const row of tokens) {
            const res = await fetch(
              `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
              {
                method: "POST",
                headers: {
                  authorization: `Bearer ${bearer}`,
                  "content-type": "application/json",
                },
                body: JSON.stringify({
                  message: {
                    token: row.fcm_token,
                    data,
                    android: { priority: "HIGH", ttl: `${data["timeout_seconds"]}s` },
                  },
                }),
              },
            );
            if (res.ok) {
              sent += 1;
            } else {
              failed += 1;
              console.error("[merchant-send-push] fcm error", res.status, await res.text());
              if (res.status === 404) {
                await fetch(
                  `${supabaseUrl}/rest/v1/device_tokens?fcm_token=eq.${encodeURIComponent(row.fcm_token)}`,
                  {
                    method: "DELETE",
                    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
                  },
                );
              }
            }
          }

          return Response.json({ sent, failed });
        } catch (err) {
          console.error("[merchant-send-push]", err);
          return Response.json({ error: (err as Error).message }, { status: 400 });
        }
      },
    },
  },
});