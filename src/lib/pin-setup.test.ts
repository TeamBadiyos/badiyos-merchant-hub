import { describe, it as test } from "node:test";
import assert from "node:assert/strict";
import { saveMerchantLoginPin } from "./pin-setup";

describe("PIN setup session safety", () => {
  test("a signed-out user cannot send a PIN-saving request", async () => {
    let calls = 0;
    const result = await saveMerchantLoginPin({
      auth: { getSession: async () => ({ data: { session: null }, error: null }) },
      rpc: () => { calls += 1; return { setHeader: async () => ({ error: null }) }; },
    }, "1234");
    assert.deepEqual(result, { ok: false, reason: "session" });
    assert.equal(calls, 0);
  });

  test("PIN saving sends the current user's bearer and reads the result", async () => {
    let authenticatedRequest = false;
    const result = await saveMerchantLoginPin({
      auth: { getSession: async () => ({ data: { session: { access_token: "test-session" } }, error: null }) },
      rpc: (name, args) => ({ setHeader: async (header, value) => {
        authenticatedRequest = name === "merchant_set_login_pin"
          && args.p_pin === "1234"
          && header === "Authorization" && value === "Bearer test-session";
        return { error: null };
      } }),
    }, "1234");
    assert.equal(authenticatedRequest, true);
    assert.deepEqual(result, { ok: true });
  });

  test("a rejected save never reports completion", async () => {
    const result = await saveMerchantLoginPin({
      auth: { getSession: async () => ({ data: { session: { access_token: "test-session" } }, error: null }) },
      rpc: () => ({ setHeader: async () => ({ error: { code: "42501" } }) }),
    }, "1234");
    assert.deepEqual(result, { ok: false, reason: "save" });
  });
});