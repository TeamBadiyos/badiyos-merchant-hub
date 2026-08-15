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
import { useAuth, type Permission } from "@/lib/auth";
import { useI18n, type Key } from "@/lib/i18n";

const tabs: { to: string; key: Key; icon: typeof Home; permission?: Permission }[] = [
  { to: "/home", key: "home", icon: Home, permission: "view_orders" },
  { to: "/orders", key: "orders", icon: Receipt, permission: "view_orders" },
  { to: "/catalogue", key: "catalogue", icon: ShoppingBag },
  { to: "/profile", key: "profile", icon: User },
];

/** Live screens in the side menu, gated by role permissions. */
const links: { to: string; key: Key; icon: typeof Home; permission: Permission }[] = [
  { to: "/products", key: "products", icon: Boxes, permission: "manage_products" },
  { to: "/staff", key: "rolesStaff", icon: Users, permission: "manage_staff" },
];

const menuItems: { key: Key; icon: typeof Home }[] = [
  { key: "reports", icon: BarChart3 },
  { key: "payouts", icon: Wallet },
  { key: "settings", icon: Settings },
  { key: "support", icon: LifeBuoy },
];

export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useI18n();
  const { merchant, signOut, can } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(true);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col border-border bg-background sm:border-x">
        <header className="bg-brand-gradient sticky top-0 z-20 px-6 pt-6 pb-8 text-primary-foreground">
          <div className="flex items-center gap-4">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger
                aria-label={t("menu")}
                className="-ml-2 rounded-xl p-2 transition-colors hover:bg-primary-foreground/15"
              >
                <Menu className="size-6" />
              </SheetTrigger>
              <SheetContent side="left" className="w-[300px] p-0">
                <div className="bg-brand-gradient px-6 pt-12 pb-6 text-primary-foreground">
                  <BrandMark className="size-12 text-xl" />
                  <p className="mt-4 text-base font-bold">{merchant?.store_name ?? "badiyos"}</p>
                  <p className="num text-sm opacity-80">
                    {merchant?.phone ? `+91 ${merchant.phone}` : t("tagline")}
                  </p>
                </div>
                <nav className="flex flex-col p-4">
                  {links
                    .filter((item) => can(item.permission))
                    .map(({ to, key, icon: Icon }) => (
                      <Link
                        key={to}
                        to={to}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-4 rounded-xl px-4 py-4 text-left text-sm font-semibold text-foreground transition-colors hover:bg-accent"
                      >
                        <Icon className="size-5 text-primary" />
                        <span className="flex-1">{t(key)}</span>
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </Link>
                    ))}
                  {menuItems.map(({ key, icon: Icon }) => (
                    <button
                      key={key}
                      className="flex items-center gap-4 rounded-xl px-4 py-4 text-left text-sm font-semibold text-foreground transition-colors hover:bg-accent"
                    >
                      <Icon className="size-5 text-primary" />
                      <span className="flex-1">{t(key)}</span>
                      <span className="rounded-full bg-muted px-3 py-1 text-[10px] font-bold text-muted-foreground">
                        {t("comingSoon")}
                      </span>
                    </button>
                  ))}
                  <div className="my-4 h-px bg-border" />
                  <button
                    onClick={() => {
                      void signOut().then(() => {
                        setOpen(false);
                        return navigate({ to: "/login", replace: true });
                      });
                    }}
                    className="flex items-center gap-4 rounded-xl px-4 py-4 text-left text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <LogOut className="size-5" />
                    {t("logout")}
                  </button>
                </nav>
              </SheetContent>
            </Sheet>

            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold uppercase opacity-80">{title}</p>
              <p className="truncate text-base font-bold">{merchant?.store_name ?? "badiyos"}</p>
            </div>

            <label className="flex items-center gap-2 rounded-full bg-primary-foreground/15 px-3 py-2 text-xs font-bold">
              <Store className="size-4" />
              <span className="hidden sm:inline">{shopOpen ? t("openNow") : t("closed")}</span>
              <Switch
                checked={shopOpen}
                onCheckedChange={setShopOpen}
                aria-label={t("shopStatus")}
                className="data-[state=checked]:bg-primary-foreground/90 data-[state=unchecked]:bg-primary-foreground/30 [&_span]:bg-primary"
              />
            </label>
          </div>
        </header>

        <main className="flex-1 px-6 pt-6 pb-28">{children}</main>

        <nav className="fixed bottom-0 z-20 w-full max-w-[520px] border-t border-border bg-card/95 backdrop-blur">
          <ul className="grid grid-cols-4">
            {tabs
              .filter((tab) => !tab.permission || can(tab.permission))
              .map(({ to, key, icon: Icon }) => {
              const active = pathname === to;
              return (
                <li key={to}>
                  <Link
                    to={to}
                    className={`flex flex-col items-center gap-1 py-3 text-[11px] font-bold transition-colors ${
                      active ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    <span
                      className={`flex size-8 items-center justify-center rounded-xl transition-colors ${
                        active ? "bg-primary-soft" : ""
                      }`}
                    >
                      <Icon className="size-5" />
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
    <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center shadow-card">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary-soft">
        <Icon className="size-7 text-primary" />
      </div>
      <h2 className="mt-4 text-base font-bold text-foreground">{title}</h2>
      <p className="mx-auto mt-2 max-w-[34ch] text-sm text-muted-foreground">{description}</p>
      <div className="mt-6 space-y-3">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-4 rounded-xl bg-muted/70 p-4">
            <div className="size-8 rounded-lg bg-border/70" />
            <div className="flex-1 space-y-2">
              <div className="h-2 w-2/3 rounded-full bg-border/70" />
              <div className="h-2 w-1/3 rounded-full bg-border/50" />
            </div>
            <ChevronRight className="size-4 text-border" />
          </div>
        ))}
      </div>
    </div>
  );
}