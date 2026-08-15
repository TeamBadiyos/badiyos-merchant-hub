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
  ScanLine,
  Settings,
  ShoppingBag,
  Store,
  User,
  Users,
  Wallet,
} from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import { PullIndicator } from "@/components/PullIndicator";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Wordmark } from "@/components/Wordmark";
import { useAuth, type Permission } from "@/lib/auth";
import { useNativeOrderActions } from "@/lib/native-order-actions";
import { usePushRegistration } from "@/lib/push";
import { hapticImpact } from "@/lib/haptics";
import { useI18n, type Key } from "@/lib/i18n";
import { useEdgeSwipeBack } from "@/lib/use-edge-swipe-back";
import { usePullToRefresh } from "@/lib/use-pull-to-refresh";

const tabs: { to: string; key: Key; icon: typeof Home; permission?: Permission }[] = [
  { to: "/home", key: "home", icon: Home, permission: "view_orders" },
  { to: "/orders", key: "orders", icon: Receipt, permission: "view_orders" },
  { to: "/pos", key: "pos", icon: ScanLine, permission: "manage_orders" },
  { to: "/profile", key: "profile", icon: User },
];

/** Live screens in the side menu, gated by role permissions. */
const links: { to: string; key: Key; icon: typeof Home; permission?: Permission }[] = [
  { to: "/products", key: "products", icon: Boxes, permission: "manage_products" },
  { to: "/catalogue", key: "catalogue", icon: ShoppingBag },
  { to: "/reports", key: "reports", icon: BarChart3, permission: "view_reports" },
  { to: "/wallet", key: "wallet", icon: Wallet, permission: "view_reports" },
  { to: "/staff", key: "rolesStaff", icon: Users, permission: "manage_staff" },
  { to: "/settings", key: "settings", icon: Settings },
];

const menuItems: { key: Key; icon: typeof Home }[] = [{ key: "support", icon: LifeBuoy }];

export function AppShell({
  title,
  children,
  onRefresh,
}: {
  title: string;
  children: ReactNode;
  /** Enables native-style pull-to-refresh on this screen's scroll area. */
  onRefresh?: () => Promise<unknown> | void;
}) {
  const { t } = useI18n();
  const { merchant, signOut, can, context } = useAuth();
  const navigate = useNavigate();
  usePushRegistration(context.merchantId ?? merchant?.id);
  useNativeOrderActions();
  const [open, setOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(true);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const scrollRef = useRef<HTMLElement>(null);
  const { pull, refreshing, threshold } = usePullToRefresh(scrollRef, onRefresh);
  const { dragX, animating } = useEdgeSwipeBack(!open);

  return (
    <div className="h-full overflow-hidden bg-background">
      <div
        className={`safe-x mx-auto flex h-full w-full max-w-[520px] flex-col border-border bg-background sm:border-x ${
          animating ? "transition-transform duration-200 ease-out" : ""
        }`}
        style={dragX ? { transform: `translate3d(${dragX}px,0,0)` } : undefined}
      >
        <header className="bg-brand-gradient safe-top z-20 shrink-0 px-6 pb-8 text-primary-foreground">
          <div className="flex items-center gap-4 pt-6">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger
                aria-label={t("menu")}
                className="-ml-2 rounded-xl p-2 transition-colors hover:bg-primary-foreground/15"
              >
                <Menu className="size-6" />
              </SheetTrigger>
              <SheetContent side="left" className="w-[300px] p-0">
                <div className="bg-brand-gradient px-6 pt-12 pb-6 text-primary-foreground">
                  <Wordmark on="dark" className="h-6" />
                  <p className="mt-4 text-base font-bold">{merchant?.store_name ?? "badiyos"}</p>
                  <p className="num text-sm opacity-80">
                    {merchant?.phone ? `+91 ${merchant.phone}` : t("tagline")}
                  </p>
                </div>
                <nav className="flex flex-col p-4">
                  {links
                    .filter((item) => !item.permission || can(item.permission))
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
                onCheckedChange={(next) => {
                  hapticImpact("medium");
                  setShopOpen(next);
                }}
                aria-label={t("shopStatus")}
                className="data-[state=checked]:bg-primary-foreground/90 data-[state=unchecked]:bg-primary-foreground/30 [&_span]:bg-primary"
              />
            </label>
          </div>
        </header>

        <main ref={scrollRef} className="app-scroll relative flex-1">
          {onRefresh && <PullIndicator pull={pull} refreshing={refreshing} threshold={threshold} />}
          <div
            className={pull ? "" : "transition-transform duration-200 ease-out"}
            style={{ transform: `translate3d(0,${pull}px,0)` }}
          >
            <div className="px-6 pt-6 pb-32">{children}</div>
          </div>
        </main>

        <nav className="safe-bottom fixed bottom-0 z-20 w-full max-w-[520px] border-t border-border bg-card/95 backdrop-blur print:hidden">
          {(() => {
            const visible = tabs.filter((tab) => !tab.permission || can(tab.permission));
            return (
              <ul
                className="grid"
                style={{ gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))` }}
              >
                {visible.map(({ to, key, icon: Icon }) => {
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
            );
          })()}
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