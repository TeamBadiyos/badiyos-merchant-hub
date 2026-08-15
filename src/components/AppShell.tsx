import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Boxes,
  ChevronRight,
  Home,
  LifeBuoy,
  LogOut,
  Menu,
  Receipt,
  Settings,
  ShoppingBag,
  Store,
  User,
  Wallet,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { BrandMark, Wordmark } from "@/components/Wordmark";
import { useAuth } from "@/lib/auth";
import { useI18n, type Key } from "@/lib/i18n";

const tabs: { to: string; key: Key; icon: typeof Home }[] = [
  { to: "/home", key: "home", icon: Home },
  { to: "/orders", key: "orders", icon: Receipt },
  { to: "/catalogue", key: "catalogue", icon: ShoppingBag },
  { to: "/profile", key: "profile", icon: User },
];

const menuItems: { key: Key; icon: typeof Home }[] = [
  { key: "inventory", icon: Boxes },
  { key: "reports", icon: BarChart3 },
  { key: "payouts", icon: Wallet },
  { key: "settings", icon: Settings },
  { key: "support", icon: LifeBuoy },
];

export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useI18n();
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(true);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col border-border bg-background sm:border-x">
        <header className="bg-brand-gradient sticky top-0 z-20 px-3 pt-3 pb-4 text-primary-foreground">
          <div className="flex items-center gap-2">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger
                aria-label={t("menu")}
                className="-ml-1 rounded-xl p-1 transition-colors hover:bg-primary-foreground/15"
              >
                <Menu className="size-3" />
              </SheetTrigger>
              <SheetContent side="left" className="w-[300px] p-0">
                <div className="bg-brand-gradient px-3 pt-6 pb-3 text-primary-foreground">
                  <BrandMark className="size-6 text-xl" />
                  <p className="mt-2 text-base font-bold">{session?.shopName ?? "badiyos"}</p>
                  <p className="num text-sm opacity-80">
                    {session ? `+91 ${session.mobile}` : t("tagline")}
                  </p>
                </div>
                <nav className="flex flex-col p-2">
                  {menuItems.map(({ key, icon: Icon }) => (
                    <button
                      key={key}
                      className="flex items-center gap-2 rounded-xl px-2 py-2 text-left text-sm font-semibold text-foreground transition-colors hover:bg-accent"
                    >
                      <Icon className="size-2.5 text-primary" />
                      <span className="flex-1">{t(key)}</span>
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                        {t("comingSoon")}
                      </span>
                    </button>
                  ))}
                  <div className="my-2 h-px bg-border" />
                  <button
                    onClick={() => {
                      signOut();
                      setOpen(false);
                      navigate({ to: "/login", replace: true });
                    }}
                    className="flex items-center gap-2 rounded-xl px-2 py-2 text-left text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <LogOut className="size-2.5" />
                    {t("logout")}
                  </button>
                </nav>
              </SheetContent>
            </Sheet>

            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold uppercase opacity-80">{title}</p>
              <p className="truncate text-base font-bold">{session?.shopName ?? "badiyos"}</p>
            </div>

            <label className="flex items-center gap-1 rounded-full bg-primary-foreground/15 px-1.5 py-1 text-xs font-bold">
              <Store className="size-2" />
              <span className="hidden xs:inline">{shopOpen ? t("openNow") : t("closed")}</span>
              <Switch
                checked={shopOpen}
                onCheckedChange={setShopOpen}
                aria-label={t("shopStatus")}
                className="data-[state=checked]:bg-primary-foreground/90 data-[state=unchecked]:bg-primary-foreground/30 [&_span]:bg-primary"
              />
            </label>
          </div>
        </header>

        <main className="flex-1 px-3 pt-3 pb-14">{children}</main>

        <nav className="fixed bottom-0 z-20 w-full max-w-[520px] border-t border-border bg-card/95 backdrop-blur">
          <ul className="grid grid-cols-4">
            {tabs.map(({ to, key, icon: Icon }) => {
              const active = pathname === to;
              return (
                <li key={to}>
                  <Link
                    to={to}
                    className={`flex flex-col items-center gap-0.5 py-1.5 text-[11px] font-bold transition-colors ${
                      active ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    <span
                      className={`flex size-4 items-center justify-center rounded-xl transition-colors ${
                        active ? "bg-primary-soft" : ""
                      }`}
                    >
                      <Icon className="size-2.5" />
                    </span>
                    {t(key)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}

export function PlaceholderPanel({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: typeof Home;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-4 text-center shadow-card">
      <div className="mx-auto flex size-7 items-center justify-center rounded-2xl bg-primary-soft">
        <Icon className="size-3.5 text-primary" />
      </div>
      <h2 className="mt-2 text-base font-bold text-foreground">{title}</h2>
      <p className="mx-auto mt-1 max-w-[34ch] text-sm text-muted-foreground">{description}</p>
      <div className="mt-3 space-y-1.5">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-2 rounded-xl bg-muted/70 p-2">
            <div className="size-4 rounded-lg bg-border/70" />
            <div className="flex-1 space-y-1">
              <div className="h-1 w-2/3 rounded-full bg-border/70" />
              <div className="h-1 w-1/3 rounded-full bg-border/50" />
            </div>
            <ChevronRight className="size-2 text-border" />
          </div>
        ))}
      </div>
    </div>
  );
}