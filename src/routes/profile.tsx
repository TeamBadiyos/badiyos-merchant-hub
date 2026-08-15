import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Building2, Globe, LogOut, ShieldCheck } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useAuth, demoMerchant } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/use-require-auth";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile & settings — badiyos Merchant Portal" },
      {
        name: "description",
        content:
          "Switch between English and Marathi, review your shop details and manage your badiyos merchant account.",
      },
      { property: "og:title", content: "Profile & settings — badiyos" },
      { property: "og:description", content: "Language, shop details and account settings." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { t, lang, setLang } = useI18n();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const session = useRequireAuth();
  if (!session) return null;

  return (
    <AppShell title={t("profile")}>
      <div className="space-y-2">
        <div className="rounded-3xl border border-border bg-card p-3 shadow-card">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-2xl bg-primary-soft">
              <Building2 className="size-3.5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-extrabold text-foreground">
                {session.shopName}
              </p>
              <p className="num text-sm text-muted-foreground">+91 {session.mobile}</p>
              <p className="text-sm text-muted-foreground">{demoMerchant.area}</p>
            </div>
          </div>
          <p className="mt-2 flex items-center gap-1 rounded-xl bg-primary-soft px-1.5 py-1 text-xs font-bold text-accent-foreground">
            <ShieldCheck className="size-2" />
            {t("verified")}
          </p>
        </div>

        <div className="rounded-3xl border border-border bg-card p-3 shadow-card">
          <p className="flex items-center gap-1 text-sm font-bold text-foreground">
            <Globe className="size-2.5 text-primary" />
            {t("language")}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {(["en", "mr"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`rounded-2xl border px-2 py-2 text-sm font-bold transition-colors ${
                  lang === l
                    ? "border-primary bg-primary-soft text-accent-foreground"
                    : "border-border bg-background text-muted-foreground"
                }`}
              >
                {l === "en" ? "English" : "मराठी"}
              </button>
            ))}
          </div>
        </div>

        <Button
          variant="outline"
          size="lg"
          onClick={() => {
            signOut();
            navigate({ to: "/login", replace: true });
          }}
          className="w-full rounded-2xl border-destructive/30 text-base font-bold text-destructive hover:bg-destructive/10"
        >
          <LogOut className="size-2.5" />
          {t("logout")}
        </Button>
      </div>
    </AppShell>
  );
}