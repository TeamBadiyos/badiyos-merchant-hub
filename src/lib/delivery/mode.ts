import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/lib/auth";

export type AppMode = "store" | "delivery";
const MODE_KEY = "badiyos.mode";
const NAME_KEY = "badiyos.actorName";

/** Which parts of the app this login can use, and which one is showing. */
export function useAppMode() {
  const { context, can } = useAuth();
  const hasDelivery = context.deliveryEnabled && can("manage_delivery");
  const hasStore = context.storeEnabled;
  const [stored, setStored] = useState<AppMode | null>(null);

  useEffect(() => {
    const v = localStorage.getItem(MODE_KEY);
    if (v === "store" || v === "delivery") setStored(v);
  }, []);

  const mode: AppMode = !hasDelivery
    ? "store"
    : !hasStore
      ? "delivery"
      : (stored ?? "store");

  const setMode = useCallback((m: AppMode) => {
    localStorage.setItem(MODE_KEY, m);
    setStored(m);
  }, []);

  return { hasStore, hasDelivery, both: hasStore && hasDelivery, mode, setMode };
}

export function rememberMode(m: AppMode) {
  if (typeof window !== "undefined") localStorage.setItem(MODE_KEY, m);
}

export function readStoredMode(): AppMode | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(MODE_KEY);
  return v === "store" || v === "delivery" ? v : null;
}

export function getActorName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(NAME_KEY) ?? "";
}

export function useActorName() {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => setName(getActorName()), []);
  const save = useCallback((n: string) => {
    localStorage.setItem(NAME_KEY, n.trim());
    setName(n.trim());
  }, []);
  return { name, save };
}
