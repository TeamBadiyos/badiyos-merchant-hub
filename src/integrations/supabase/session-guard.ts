// Silent token refresh: on a 401 from a non-auth Supabase endpoint, refresh the
// session once (single-flight) and retry the original request once; if refresh
// fails, sign out and send the user to /login.
import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";

type AnyClient = SupabaseClient<any, any, any>;

let getClient: () => AnyClient | undefined = () => undefined;
let refreshing: Promise<string | null> | null = null;
let signingOut = false;

export function registerSessionGuardClient(fn: () => AnyClient | undefined) {
  getClient = fn;
}

function isAuthUrl(url: string) {
  return url.includes("/auth/v1/");
}

function urlOf(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

/** Single-flight refresh. Resolves with the new access token, or null on failure. */
function refreshOnce(): Promise<string | null> {
  if (refreshing) return refreshing;
  const client = getClient();
  if (!client) return Promise.resolve(null);
  refreshing = client.auth
    .refreshSession()
    .then(({ data, error }) => (error || !data.session ? null : data.session.access_token))
    .catch(() => null)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function forceRelogin() {
  if (signingOut) return;
  signingOut = true;
  try {
    await getClient()?.auth.signOut();
  } catch {
    /* ignore */
  }
  if (typeof window === "undefined") return;
  toast.error("Please log in again");
  if (!window.location.pathname.startsWith("/login")) {
    setTimeout(() => window.location.replace("/login"), 1200);
  } else {
    signingOut = false;
  }
}

/** Wraps a fetch so 401s on non-auth endpoints trigger refresh + one retry. */
export function withSessionRefresh(baseFetch: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = urlOf(input);
    // Clone a Request up front so its body can be resent on retry.
    const retryInput =
      typeof Request !== "undefined" && input instanceof Request ? input.clone() : input;
    const res = await baseFetch(input, init);
    if (res.status !== 401 || isAuthUrl(url) || typeof window === "undefined") return res;

    const token = await refreshOnce();
    if (!token) {
      void forceRelogin();
      return res;
    }
    const headers = new Headers(
      typeof Request !== "undefined" && retryInput instanceof Request ? retryInput.headers : undefined,
    );
    if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    headers.set("Authorization", `Bearer ${token}`);
    // Retry exactly once — the result is returned as-is (no further retries).
    return baseFetch(retryInput, { ...init, headers });
  };
}

/** App-start check: validate an existing session; refresh or sign out on JWT errors. */
export async function verifySessionOnStart() {
  const client = getClient();
  if (!client || typeof window === "undefined") return;
  const { data } = await client.auth.getSession();
  if (!data.session) return;
  const { error } = await client.auth.getUser();
  if (!error) return;
  const status = (error as { status?: number }).status;
  const isJwtError = status === 401 || status === 403 || /jwt|token/i.test(error.message);
  if (!isJwtError) return;
  const token = await refreshOnce();
  if (!token) void forceRelogin();
}
