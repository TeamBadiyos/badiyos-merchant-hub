// Silent token refresh (same rules as the Customer App):
// - only 401s from /rest/v1/ or /storage/v1/ sent with a real user access token;
// - before signing out, check the failing session is still the current one —
//   if a newer session exists, retry once with it instead;
// - one refresh at a time (the library's own refresh is awaited via getSession);
// - sign out with scope "local" only.
import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";

type AnyClient = SupabaseClient<any, any, any>;

let getClient: () => AnyClient | undefined = () => undefined;
let refreshing: Promise<string | null> | null = null;
let signingOut = false;

export function registerSessionGuardClient(fn: () => AnyClient | undefined) {
  getClient = fn;
}

function urlOf(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function isGuardedUrl(url: string) {
  return url.includes("/rest/v1/") || url.includes("/storage/v1/");
}

/** Returns the bearer token only when it is a real user access token (JWT with a sub). */
function userTokenOf(headers: Headers, apiKey: string): string | null {
  const auth = headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  if (!token || token === apiKey || token === headers.get("apikey")) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = atob((parts[1] ?? "").replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as { sub?: string; role?: string };
    if (!payload.sub || payload.role === "anon" || payload.role === "service_role") return null;
    return token;
  } catch {
    return null;
  }
}

/** Current access token; getSession waits for any refresh the library is running. */
async function currentToken(): Promise<string | null> {
  const client = getClient();
  if (!client) return null;
  try {
    const { data } = await client.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
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

/**
 * Resolve a usable token for a request that failed with `failedToken`.
 * Returns a newer token to retry with, or null when the failing session is
 * still current and could not be refreshed (then sign out).
 */
async function recoverToken(failedToken: string): Promise<string | null> {
  if (refreshing) await refreshing;
  const now = await currentToken();
  if (now && now !== failedToken) return now; // newer session already exists
  const refreshed = await refreshOnce();
  if (refreshed && refreshed !== failedToken) return refreshed;
  const after = await currentToken();
  if (after && after !== failedToken) return after;
  return null;
}

async function forceRelogin(failedToken: string) {
  if (signingOut) return;
  // Re-check: never sign out a newer session.
  const now = await currentToken();
  if (now && now !== failedToken) return;
  signingOut = true;
  try {
    await getClient()?.auth.signOut({ scope: "local" });
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

/** Wraps a fetch so qualifying 401s trigger refresh + one retry. */
export function withSessionRefresh(baseFetch: typeof fetch, apiKey = ""): typeof fetch {
  return async (input, init) => {
    const url = urlOf(input);
    const isRequest = typeof Request !== "undefined" && input instanceof Request;
    const retryInput = isRequest ? (input as Request).clone() : input;
    const res = await baseFetch(input, init);
    if (res.status !== 401 || typeof window === "undefined" || !isGuardedUrl(url)) return res;

    const sent = new Headers(isRequest ? (retryInput as Request).headers : undefined);
    if (init?.headers) new Headers(init.headers).forEach((v, k) => sent.set(k, v));
    const failedToken = userTokenOf(sent, apiKey);
    if (!failedToken) return res; // anon/publishable-only request

    const token = await recoverToken(failedToken);
    if (!token) {
      void forceRelogin(failedToken);
      return res;
    }
    sent.set("Authorization", `Bearer ${token}`);
    // Retry exactly once — the result is returned as-is.
    return baseFetch(retryInput, { ...init, headers: sent });
  };
}

/** App-start check: validate an existing session with the same "same session?" rule. */
export async function verifySessionOnStart() {
  const client = getClient();
  if (!client || typeof window === "undefined") return;
  const { data } = await client.auth.getSession();
  const startToken = data.session?.access_token;
  if (!startToken) return;
  const { error } = await client.auth.getUser(startToken);
  if (!error) return;
  const status = (error as { status?: number }).status;
  const isJwtError = status === 401 || status === 403 || /jwt|token/i.test(error.message);
  if (!isJwtError) return;
  const token = await recoverToken(startToken);
  if (!token) void forceRelogin(startToken);
}
