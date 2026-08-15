import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Session = {
  mobile: string;
  shopName: string;
  ownerName: string;
  hasPin: boolean;
};

const STORAGE_KEY = "badiyos.session";

/** Placeholder merchant profile — replaced by real backend data later. */
export const demoMerchant = {
  shopName: "Shri Ganesh Kirana Stores",
  ownerName: "Gaurav Baheti",
  area: "Ausa Road, Latur",
  todayOrders: 0,
  todaySales: 0,
  rating: 4.8,
};

const AuthContext = createContext<{
  session: Session | null;
  ready: boolean;
  signIn: (mobile: string) => void;
  setPin: () => void;
  signOut: () => void;
}>({ session: null, ready: false, signIn: () => {}, setPin: () => {}, signOut: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSession(JSON.parse(raw) as Session);
    } catch {
      /* ignore malformed session */
    }
    setReady(true);
  }, []);

  const persist = useCallback((next: Session | null) => {
    setSession(next);
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  }, []);

  const signIn = useCallback(
    (mobile: string) => {
      persist({
        mobile,
        shopName: demoMerchant.shopName,
        ownerName: demoMerchant.ownerName,
        hasPin: false,
      });
    },
    [persist],
  );

  const setPin = useCallback(() => {
    setSession((prev) => {
      if (!prev) return prev;
      const next = { ...prev, hasPin: true };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const signOut = useCallback(() => persist(null), [persist]);

  return (
    <AuthContext.Provider value={{ session, ready, signIn, setPin, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}