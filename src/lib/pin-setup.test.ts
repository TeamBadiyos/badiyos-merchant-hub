import { describe, expect, test } from "bun:test";
import { saveMerchantLoginPin } from "./pin-setup";

describe("PIN setup session safety", () => {
  test("a signed-out user cannot send a PIN-saving request", async () => {
    let calls = 0;
    const result = await saveMerchantLoginPin({
      auth: { getSession: async () => ({ data: { session: null }, error: null }) },
      rpc: async () => { calls += 1; return { error: null }; },
    }, "1234");
    expect(result).toEqual({ ok: false, reason: "session" });
    expect(calls).toBe(0);
  });

  test("PIN saving sends the current user's bearer and reads the result", async () => {
    let authenticatedRequest = false;
    const result = await saveMerchantLoginPin({
      auth: { getSession: async () => ({ data: { session: { access_token: "test-session" } }, error: null }) },
      rpc: async (name, args, options) => {
        authenticatedRequest = name === "merchant_set_login_pin"
          && args.p_pin === "1234"
          && options.headers.Authorization === "Bearer test-session";
        return { error: null };
      },
    }, "1234");
    expect(authenticatedRequest).toBe(true);
    expect(result).toEqual({ ok: true });
  });

  test("a rejected save never reports completion", async () => {
    const result = await saveMerchantLoginPin({
      auth: { getSession: async () => ({ data: { session: { access_token: "test-session" } }, error: null }) },
      rpc: async () => ({ error: { code: "42501" } }),
    }, "1234");
    expect(result).toEqual({ ok: false, reason: "save" });
  });
});