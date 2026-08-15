import { createFileRoute } from "@tanstack/react-router";
import { IndianRupee, PackageOpen, RefreshCw, Star, TrendingUp } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { demoMerchant } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/use-require-auth";

export const Route = createFileRoute("/home")({
  head: () => ({
    meta: [
      { title: "Shop dashboard — badiyos Merchant Portal" },
      {
        name: "description",
        content:
          "Track today's orders, sales and shop rating at a glance from your badiyos merchant dashboard.",
      },
      { property: "og:title", content: "Shop dashboard — badiyos" },
      {
        property: "og:description",
        content: "Today's orders, sales and rating for your badiyos shop.",
      },
    ],
  }),
  component: HomePage,
});

function greetingKey() {
  const h = new Date().getHours();
  if (h < 12) return "greetingMorning" as const;
  if (h < 17) return "greetingAfternoon" as const;
  return "greetingEvening" as const;
}

function HomePage() {
  const { t } = useI18n();
  const session = useRequireAuth();
  if (!session) return null;

  const stats = [
    { label: t("todayOrders"), value: String(demoMerchant.todayOrders), icon: PackageOpen },
    { label: t("todaySales"), value: `₹${demoMerchant.todaySales}`, icon: IndianRupee },
    { label: t("rating"), value: demoMerchant.rating.toFixed(1), icon: Star },
  ];

  return (
    <AppShell title={t("home")}>
      <div className="space-y-3">
        <div>
          <h1 className="text-xl font-extrabold text-foreground">
            {t(greetingKey())}, {session.ownerName.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground">{demoMerchant.area}</p>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {stats.map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className="rounded-2xl border border-border bg-card p-2 shadow-card"
            >
              <Icon className="size-2.5 text-primary" />
              <p className="num mt-1 text-lg font-extrabold text-foreground">{value}</p>
              <p className="text-[11px] leading-tight font-semibold text-muted-foreground">
                {label}
              </p>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1 text-base font-bold text-foreground">
            <TrendingUp className="size-2.5 text-primary" />
            {t("liveOrders")}
          </h2>
          <Button variant="ghost" size="sm" className="text-primary">
            <RefreshCw className="size-2" />
            {t("refresh")}
          </Button>
        </div>

        <div className="rounded-3xl border border-border bg-card p-4 text-center shadow-card">
          <div className="mx-auto flex size-8 items-center justify-center rounded-3xl bg-primary-soft">
            <PackageOpen className="size-4 text-primary" />
          </div>
          <h3 className="mt-2 text-base font-bold text-foreground">{t("noOrders")}</h3>
          <p className="mx-auto mt-1 max-w-[32ch] text-sm text-muted-foreground">
            {t("noOrdersSub")}
          </p>
        </div>

        <div className="space-y-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-2xl border border-dashed border-border bg-card/60 p-2"
            >
              <div className="size-5 rounded-2xl bg-muted" />
              <div className="flex-1 space-y-1">
                <div className="h-1 w-1/2 rounded-full bg-muted" />
                <div className="h-1 w-1/4 rounded-full bg-muted/70" />
              </div>
              <div className="h-2.5 w-8 rounded-full bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}