import { createFileRoute } from "@tanstack/react-router";
import { LifeBuoy, MessageCircle, Phone } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/use-require-auth";

const SUPPORT_NUMBER = "8007444464";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Help & support — badiyos Merchant Portal" },
      {
        name: "description",
        content:
          "Talk to the badiyos support team on WhatsApp or call for help with orders, payouts and your shop account.",
      },
      { property: "og:title", content: "Help & support — badiyos Merchant Portal" },
      {
        property: "og:description",
        content: "WhatsApp or call the badiyos merchant support team.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SupportPage,
});

function SupportPage() {
  const { t } = useI18n();
  const { merchant } = useAuth();
  const authed = useRequireAuth();
  if (!authed) return null;

  return (
    <AppShell title={t("support")}>
      <div className="space-y-5">
        <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-card">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary-soft">
            <LifeBuoy className="size-7 text-primary" />
          </div>
          <h2 className="mt-4 text-base font-bold text-foreground">{t("support")}</h2>
          <p className="mx-auto mt-2 max-w-[34ch] text-sm text-muted-foreground">
            {t("supportSub")}
          </p>
          <p className="num mt-4 text-2xl font-extrabold tracking-wide text-foreground">
            +91 {SUPPORT_NUMBER}
          </p>
          <p className="mt-1 text-xs font-semibold text-muted-foreground">{t("supportHours")}</p>

          <div className="mt-6 space-y-3">
            <a
              href={`https://wa.me/91${SUPPORT_NUMBER}`}
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
            >
              <MessageCircle className="size-5" />
              {t("supportWhatsapp")}
            </a>
            <a
              href={`tel:+91${SUPPORT_NUMBER}`}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-bold text-foreground transition-colors hover:bg-accent"
            >
              <Phone className="size-5 text-primary" />
              {t("supportCall")}
            </a>
          </div>
        </div>

        {merchant && (
          <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {t("supportYourShop")}
            </p>
            <p className="mt-1 text-sm font-bold text-foreground">{merchant.store_name ?? "—"}</p>
            {merchant.phone && (
              <p className="num text-xs text-muted-foreground">+91 {merchant.phone}</p>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
