import { createFileRoute } from "@tanstack/react-router";
import { ShoppingBag } from "lucide-react";

import { AppShell, PlaceholderPanel } from "@/components/AppShell";
import { useI18n } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/use-require-auth";

export const Route = createFileRoute("/catalogue")({
  head: () => ({
    meta: [
      { title: "Catalogue — badiyos Merchant Portal" },
      {
        name: "description",
        content: "Manage the products and services your shop offers on badiyos.",
      },
      { property: "og:title", content: "Catalogue — badiyos Merchant Portal" },
      { property: "og:description", content: "Products and services for your badiyos shop." },
    ],
  }),
  component: CataloguePage,
});

function CataloguePage() {
  const { t } = useI18n();
  const session = useRequireAuth();
  if (!session) return null;

  return (
    <AppShell title={t("catalogue")}>
      <PlaceholderPanel
        title={t("comingSoon")}
        description={t("catalogueEmpty")}
        icon={ShoppingBag}
      />
    </AppShell>
  );
}