type PinClient = {
  auth: {
    getSession: () => Promise<{
      data: { session: { access_token: string } | null };
      error: unknown;
    }>;
  };
  rpc: (
    name: "merchant_set_login_pin",
    args: { p_pin: string },
    options: { headers: { Authorization: string } },
  ) => PromiseLike<{ error: unknown }>;
};

/** PIN setup must never fall back to an anonymous database request. */
export async function saveMerchantLoginPin(client: PinClient, pin: string) {
  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.access_token) {
    return { ok: false, reason: "session" } as const;
  }
  const result = await client.rpc(
    "merchant_set_login_pin",
    { p_pin: pin },
    { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  );
  return result.error
    ? ({ ok: false, reason: "save" } as const)
    : ({ ok: true } as const);
}