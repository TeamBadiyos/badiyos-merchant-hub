import { createFileRoute } from "@tanstack/react-router";
import { Receipt } from "lucide-react";

import { AppShell, PlaceholderPanel } from "@/components/AppShell";
import { useI18n } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/use-require-auth";

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "Orders — badiyos Merchant Portal" },
      {
        name: "description",
        content: "See new, ongoing and completed customer orders for your badiyos shop.",
      },
      { property: "og:title", content: "Orders — badiyos Merchant Portal" },
      { property: "og:description", content: "New, ongoing and completed badiyos orders." },
    ],
  }),
  component: OrdersPage,
});

function OrdersPage() {
  const { t } = useI18n();
  const merchant = useRequireAuth();
  if (!merchant) return null;

  return (
    <AppShell title={t("orders")}>
      <PlaceholderPanel title={t("noOrders")} description={t("ordersEmpty")} icon={Receipt} />
    </AppShell>
  );
}