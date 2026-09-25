import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function limits() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const read = async (key: string, fallback: number) => {
    const { data, error } = await (supabaseAdmin.rpc as unknown as (
      f: string,
      a: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>)("courier_setting", { _key: key, _default: fallback });
    const n = Number(data);
    return error || !Number.isFinite(n) ? fallback : n;
  };
  return { min: await read("business_topup_min", 500), max: await read("business_topup_max", 100000) };
}

export const getTopupLimits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => limits());

/** Creates the Razorpay order for a delivery-wallet top-up. */
export const createTopupOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ amount: z.number().positive() }).parse(d))
  .handler(async ({ data, context }) => {
    const keyId = process.env["RAZORPAY_KEY_ID"];
    const secret = process.env["RAZORPAY_KEY_SECRET"];
    if (!keyId || !secret) return { error: "Payments are not set up yet" as const };

    const { data: mid } = await context.supabase.rpc("current_merchant_id");
    if (!mid) return { error: "Not a merchant" as const };

    const { min, max } = await limits();
    if (data.amount < min || data.amount > max)
      return { error: `Amount must be between ${min} and ${max}` };

    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${btoa(`${keyId}:${secret}`)}`,
      },
      body: JSON.stringify({
        amount: Math.round(data.amount * 100),
        currency: "INR",
        receipt: `mwt_${String(mid).slice(0, 8)}_${Date.now()}`,
        notes: { purpose: "merchant_wallet_topup", merchant_id: String(mid) },
      }),
    });
    if (!res.ok) {
      console.error("[topup] razorpay order failed", res.status, await res.text());
      return { error: "Could not start payment. Try again." };
    }
    const order = (await res.json()) as { id: string; amount: number };
    return { orderId: order.id, amountPaise: order.amount, keyId, merchantId: String(mid) };
  });
