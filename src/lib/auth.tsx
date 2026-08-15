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

type AuthState = {
  /** Supabase auth user id, when signed in. */
  userId: string | null;
  merchant: Merchant | null;
  ready: boolean;
  refresh: () => Promise<Merchant | null>;
  ensureDraft: (phone: string) => Promise<Merchant | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  userId: null,
  merchant: null,
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [ready, setReady] = useState(false);
  const queryClient = useQueryClient();

  const refresh = useCallback(async () => {
    const next = await fetchMerchant();
    setMerchant(next);
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
    setUserId(null);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo(
    () => ({ userId, merchant, ready, refresh, ensureDraft, signOut }),
    [userId, merchant, ready, refresh, ensureDraft, signOut],
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
