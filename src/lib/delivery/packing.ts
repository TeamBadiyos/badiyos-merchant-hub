import { useCallback, useEffect, useState } from "react";

const PACKED_KEY = "badiyos.delivery.packedTrips";
const PACKED_EVENT = "badiyos:packed-trips-changed";

function readPackedTrips(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PACKED_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function useTripPacked(tripId: string) {
  const [packed, setPackedState] = useState(false);

  useEffect(() => {
    const sync = () => setPackedState(readPackedTrips().includes(tripId));
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(PACKED_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(PACKED_EVENT, sync);
    };
  }, [tripId]);

  const setPacked = useCallback(
    (next: boolean) => {
      const ids = new Set(readPackedTrips());
      if (next) ids.add(tripId);
      else ids.delete(tripId);
      localStorage.setItem(PACKED_KEY, JSON.stringify([...ids]));
      setPackedState(next);
      window.dispatchEvent(new Event(PACKED_EVENT));
    },
    [tripId],
  );

  return { packed, setPacked };
}

export function printPackingList(elementId: string) {
  const element = document.getElementById(elementId);
  if (!element) return;
  element.classList.add("packing-list-printing");
  const cleanup = () => element.classList.remove("packing-list-printing");
  window.addEventListener("afterprint", cleanup, { once: true });
  window.print();
  window.setTimeout(cleanup, 1_000);
}