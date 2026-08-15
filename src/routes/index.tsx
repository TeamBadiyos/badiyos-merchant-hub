import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { BrandMark, Wordmark } from "@/components/Wordmark";
import { routeForMerchant, useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "badiyos Merchant Portal — Run your shop in Latur" },
      {
        name: "description",
        content:
          "Login to the badiyos Merchant Portal to manage orders, catalogue, payouts and shop timings from your phone.",
      },
      { property: "og:title", content: "badiyos Merchant Portal — Run your shop in Latur" },
      {
        property: "og:description",
        content: "Login to the badiyos Merchant Portal to manage orders, catalogue, payouts and shop timings from your phone.",
      },
    ],
  }),
  component: Splash,
});

function Splash() {
  const { userId, merchant, ready } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      void navigate({ to: userId ? routeForMerchant(merchant) : "/login", replace: true });
    }, 1500);
    return () => clearTimeout(timer);
  }, [ready, userId, merchant, navigate]);

  return (
    <div className="bg-brand-gradient safe-top safe-bottom flex h-full min-h-screen flex-col items-center justify-center gap-4 px-6 text-primary-foreground">
      <BrandMark className="size-20 animate-in zoom-in-75 duration-500" />
      <div className="animate-in text-center fade-in duration-700">
        <h1 className="sr-only">badiyos Merchant Portal</h1>
        <Wordmark on="dark" className="mx-auto h-9" />
        <p className="mt-2 text-sm font-semibold tracking-wide uppercase opacity-85">
          {t("tagline")}
        </p>
      </div>
      <div className="mt-6 h-2 w-24 overflow-hidden rounded-full bg-primary-foreground/25">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-primary-foreground" />
      </div>
      <p className="absolute bottom-8 text-xs opacity-75">Latur, Maharashtra</p>
    </div>
  );
}
