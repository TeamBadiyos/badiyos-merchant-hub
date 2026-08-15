/**
 * Server-only merchant auth helpers.
 * Never imported by client code (blocked by the *.server.ts convention):
 * AISENSY_API_KEY / service-role key stay in the server runtime.
 */
import { createClient, type Session } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

const OTP_TTL_MINUTES = 5;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_OTP_PER_HOUR = 5;

export const merchantEmailForPhone = (phone: string) => `merchant-${phone}@badiyos.internal`;

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

/** Mints a real Supabase session for a merchant phone number. */
export async function mintMerchantSession(phone: string): Promise<Session> {
  const email = merchantEmailForPhone(phone);

  // Ensure a confirmed auth user exists BEFORE minting the link — confirming the
  // mailbox afterwards invalidates the freshly issued token.
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    phone_confirm: false,
    user_metadata: { merchant_phone: phone },
  });
  if (createError && !/already|registered|exists/i.test(createError.message)) {
    console.error("[merchant-auth] createUser failed", createError.message);
    throw new Error("Could not complete login. Please try again.");
  }
  void created;

  const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError || !link?.properties?.hashed_token) {
    console.error("[merchant-auth] generateLink failed", linkError?.message);
    throw new Error("Could not complete login. Please try again.");
  }

  const { data, error } = await publicClient().auth.verifyOtp({
    type: "email",
    token_hash: link.properties.hashed_token,
  });
  if (error || !data.session) {
    console.error("[merchant-auth] verifyOtp failed", error?.message);
    throw new Error("Could not complete login. Please try again.");
  }
  return data.session;
}

export type RateLimitResult = { ok: true } | { ok: false; message: string; retryAfter: number };

export async function checkOtpRateLimit(phone: string, ip: string | null): Promise<RateLimitResult> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("otp_rate_limits")
    .select("created_at")
    .eq("phone", phone)
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  const rows = data ?? [];
  const last = rows[0]?.created_at ? new Date(rows[0].created_at).getTime() : 0;
  const elapsed = (Date.now() - last) / 1000;
  if (last && elapsed < RESEND_COOLDOWN_SECONDS) {
    return {
      ok: false,
      message: "Please wait before requesting another code.",
      retryAfter: Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed),
    };
  }
  if (rows.length >= MAX_OTP_PER_HOUR) {
    return {
      ok: false,
      message: "Too many OTP requests. Please try again after an hour.",
      retryAfter: 3600,
    };
  }

  await supabaseAdmin.from("otp_rate_limits").insert({ phone, ip });
  return { ok: true };
}

export async function createOtpCode(phone: string): Promise<string> {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expires = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();
  const { error } = await supabaseAdmin
    .from("otp_codes")
    .insert({ phone, code, expires_at: expires, is_verified: false });
  if (error) {
    console.error("[merchant-auth] otp insert failed", error.message);
    throw new Error("Could not send OTP. Please try again.");
  }
  return code;
}

/** Sends the OTP over WhatsApp through AiSensy (same campaign as the Partner App). */
export async function sendWhatsappOtp(phone: string, code: string): Promise<void> {
  const apiKey = process.env["AISENSY_API_KEY"];
  const campaignName = process.env["AISENSY_OTP_CAMPAIGN"];
  if (!apiKey || !campaignName) {
    console.error("[merchant-auth] AiSensy secrets missing");
    throw new Error("OTP service is not configured yet. Please contact support.");
  }

  const response = await fetch("https://backend.aisensy.com/campaign/t1/api/v2", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey,
      campaignName,
      destination: `91${phone}`,
      userName: "badiyos",
      source: "merchant-portal",
      templateParams: [code],
    }),
  });

  if (!response.ok) {
    console.error("[merchant-auth] AiSensy send failed", response.status, await response.text());
    throw new Error("Could not send OTP on WhatsApp. Please try again.");
  }
}

export async function consumeOtpCode(phone: string, code: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("otp_codes")
    .select("id")
    .eq("phone", phone)
    .eq("code", code)
    .eq("is_verified", false)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1);

  const row = data?.[0];
  if (!row) return false;

  await supabaseAdmin.from("otp_codes").update({ is_verified: true }).eq("id", row.id);
  return true;
}
