import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";

import { PHONE_RE, PIN_RE, OTP_RE } from "./validation";

/**
 * Pre-login check: does this number already have a PIN? Runs server-side with the
 * admin client so the underlying RPC stays unreachable from an anonymous browser session.
 */
export const merchantHasPin = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ phone: z.string().regex(PHONE_RE) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: hasPin, error } = await supabaseAdmin.rpc("merchant_has_login_pin", {
      p_phone: data.phone,
    });
    if (error) {
      console.error("[merchant-auth] pin lookup failed", error.message);
      return { hasPin: false as const };
    }
    return { hasPin: Boolean(hasPin) };
  });

export const sendMerchantOtp = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ phone: z.string().regex(PHONE_RE) }).parse(input))
  .handler(async ({ data }) => {
    const { checkOtpRateLimit, createOtpCode, sendWhatsappOtp } = await import("./auth.server");

    const ip =
      getRequestHeader("cf-connecting-ip") ??
      getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
      null;

    const limit = await checkOtpRateLimit(data.phone, ip);
    if (!limit.ok) {
      return { ok: false as const, message: limit.message, retryAfter: limit.retryAfter };
    }

    const code = await createOtpCode(data.phone);
    await sendWhatsappOtp(data.phone, code);
    return { ok: true as const, message: "OTP sent on WhatsApp." };
  });

export const verifyMerchantOtp = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ phone: z.string().regex(PHONE_RE), code: z.string().regex(OTP_RE) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { consumeOtpCode, mintMerchantSession } = await import("./auth.server");

    const valid = await consumeOtpCode(data.phone, data.code);
    if (!valid) {
      return { ok: false as const, message: "That code is incorrect or has expired." };
    }

    const session = await mintMerchantSession(data.phone);
    return {
      ok: true as const,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    };
  });

export const verifyMerchantPin = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ phone: z.string().regex(PHONE_RE), pin: z.string().regex(PIN_RE) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { mintMerchantSession } = await import("./auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: result, error } = await supabaseAdmin.rpc("merchant_verify_pin_internal", {
      p_phone: data.phone,
      p_pin: data.pin,
    });
    if (error) {
      console.error("[merchant-auth] pin verify failed", error.message);
      return { ok: false as const, code: "ERROR", message: "Could not verify PIN. Please try again." };
    }

    const payload = (result ?? {}) as {
      ok?: boolean;
      error?: string;
      retry_after_seconds?: number;
      attempts_left?: number;
    };

    if (!payload.ok) {
      const messages: Record<string, string> = {
        NOT_REGISTERED: "This number is not registered yet. Please log in with OTP.",
        NO_PIN: "No PIN is set for this number. Please log in with OTP.",
        LOCKED: `Too many wrong attempts. Try again in ${Math.ceil((payload.retry_after_seconds ?? 900) / 60)} minutes.`,
        BAD_PIN:
          payload.attempts_left != null
            ? `Incorrect PIN. ${payload.attempts_left} attempt(s) left.`
            : "Incorrect PIN.",
      };
      return {
        ok: false as const,
        code: payload.error ?? "BAD_PIN",
        message: messages[payload.error ?? "BAD_PIN"] ?? "Incorrect PIN.",
      };
    }

    const session = await mintMerchantSession(data.phone);
    return {
      ok: true as const,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    };
  });
