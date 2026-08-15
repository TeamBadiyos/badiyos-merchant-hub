import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Merchant = Database["public"]["Tables"]["merchants"]["Row"];

export const ALL_PERMISSIONS = [
  "view_orders",
  "manage_orders",
  "manage_products",
  "view_reports",
  "manage_staff",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

export type MerchantContext = {
  merchantId: string | null;
  isOwner: boolean;
  permissions: Permission[];
  staffName: string | null;
};

const EMPTY_CONTEXT: MerchantContext = {
  merchantId: null,
  isOwner: false,
  permissions: [],
  staffName: null,
};

type AuthState = {
  /** Supabase auth user id, when signed in. */
  userId: string | null;
  merchant: Merchant | null;
  context: MerchantContext;
  /** Owner always true; staff depend on their role permissions. */
  can: (permission: Permission) => boolean;
  ready: boolean;
  refresh: () => Promise<Merchant | null>;
  ensureDraft: (phone: string) => Promise<Merchant | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  userId: null,
  merchant: null,
  context: EMPTY_CONTEXT,
  can: () => false,
  ready: false,
  refresh: async () => null,
  ensureDraft: async () => null,
  signOut: async () => {},
});

async function fetchMerchant(): Promise<Merchant | null> {
  const { data, error } = await supabase.from("merchants").select("*").maybeSingle();
  if (error) {
    console.error("[auth] merchant fetch failed", error.message);
    return null;
  }
  return data ?? null;
}

async function fetchContext(): Promise<MerchantContext> {
  const { data, error } = await supabase.rpc("merchant_my_context");
  if (error) {
    console.error("[auth] context fetch failed", error.message);
    return EMPTY_CONTEXT;
  }
  const payload = (data ?? {}) as {
    merchant_id?: string | null;
    is_owner?: boolean;
    permissions?: string[];
    staff_name?: string | null;
  };
  return {
    merchantId: payload.merchant_id ?? null,
    isOwner: Boolean(payload.is_owner),
    permissions: (payload.permissions ?? []).filter((p): p is Permission =>
      (ALL_PERMISSIONS as readonly string[]).includes(p),
    ),
    staffName: payload.staff_name ?? null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [context, setContext] = useState<MerchantContext>(EMPTY_CONTEXT);
  const [ready, setReady] = useState(false);
  const queryClient = useQueryClient();

  const refresh = useCallback(async () => {
    const [next, ctx] = await Promise.all([fetchMerchant(), fetchContext()]);
    setMerchant(next);
    setContext(ctx);
    return next;
  }, []);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      const id = data.session?.user.id ?? null;
      setUserId(id);
      if (id) await refresh();
      if (active) setReady(true);
    };
    void bootstrap();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      setUserId(session?.user.id ?? null);
      if (event === "SIGNED_OUT") {
        setMerchant(null);
        setContext(EMPTY_CONTEXT);
        queryClient.clear();
        return;
      }
      void refresh();
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [refresh, queryClient]);

  const ensureDraft = useCallback(
    async (phone: string) => {
      const { error } = await supabase.rpc("merchant_ensure_draft", { _phone: phone });
      if (error) {
        console.error("[auth] ensure draft failed", error.message);
        return null;
      }
      return refresh();
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setMerchant(null);
    setContext(EMPTY_CONTEXT);
    setUserId(null);
    queryClient.clear();
  }, [queryClient]);

  const can = useCallback(
    (permission: Permission) => context.isOwner || context.permissions.includes(permission),
    [context],
  );

  const value = useMemo(
    () => ({ userId, merchant, context, can, ready, refresh, ensureDraft, signOut }),
    [userId, merchant, context, can, ready, refresh, ensureDraft, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

/** Where should a signed-in merchant land, based on their application state? */
export function routeForMerchant(merchant: Merchant | null): string {
  if (!merchant) return "/login";
  if (merchant.status === "draft") return "/onboarding";
  return "/home";
}
