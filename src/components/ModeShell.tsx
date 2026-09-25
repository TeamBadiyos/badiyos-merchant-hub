import type { ReactNode } from "react";

import { AppShell } from "@/components/AppShell";
import { DeliveryShell } from "@/components/delivery/DeliveryShell";
import { useAppMode } from "@/lib/delivery/mode";

/**
 * Shared screens (Staff, Profile) that are reachable from both the store menu
 * and the delivery menu. Keeps the user inside whichever mode they are in, so
 * opening Staff from the delivery menu never drops them into the store app.
 */
export function ModeShell({
  title,
  children,
  onRefresh,
}: {
  title: string;
  children: ReactNode;
  onRefresh?: () => Promise<unknown> | void;
}) {
  const { mode } = useAppMode();
  if (mode === "delivery") return <DeliveryShell title={title}>{children}</DeliveryShell>;
  return (
    <AppShell title={title} onRefresh={onRefresh}>
      {children}
    </AppShell>
  );
}
