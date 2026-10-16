import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  BarChart3,
  Clock,
  Languages,
  Share2,
  Boxes,
  ChevronRight,
  Home,
  LifeBuoy,
  LogOut,
  Receipt,
  Gift,
  User,
  Users,
  Wallet,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { ModeSwitch } from "@/components/delivery/ModeSwitch";
import { NewOrderSheet } from "@/components/NewOrderSheet";
import { useDeliveryDeepLinks } from "@/lib/delivery/deep-links";
import { useAppMode } from "@/lib/delivery/mode";
import { PullIndicator } from "@/components/PullIndicator";
import { useOrderRealtime } from "@/lib/use-order-realtime";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Wordmark } from "@/components/Wordmark";
import { useAuth, type Permission } from "@/lib/auth";
import { useNativeOrderActions } from "@/lib/native-order-actions";
import { usePushRegistration } from "@/lib/push";
import { hapticImpact } from "@/lib/haptics";
import { useI18n, type Key } from "@/lib/i18n";
import { useAvailability } from "@/lib/use-availability";
import { useEdgeSwipeBack } from "@/lib/use-edge-swipe-back";
import { useNativeBack } from "@/lib/use-native-back";
import { usePullToRefresh } from "@/lib/use-pull-to-refresh";

type NavItem = { to: string; key: Key; icon: typeof Home; permission?: Permission; ownerOnly?: boolean };

const tabs: NavItem[] = [
  { to: "/home", key: "home", icon: Home, permission: "view_orders" },
  { to: "/orders", key: "orders", icon: Receipt, permission: "view_orders" },
  { to: "/products", key: "products", icon: Boxes, permission: "manage_products" },
  { to: "/wallet", key: "navMoney", icon: Wallet, ownerOnly: true },
];

/** Avatar menu. Billing (POS) and the separate wallet/rewards/reports entries are gone. */
const links: NavItem[] = [
  { to: "/profile", key: "storeProfile", icon: User },
  { to: "/reports", key: "insights", icon: BarChart3, permission: "view_reports" },
  { to: "/rewards", key: "referMerchant", icon: Gift, ownerOnly: true },
  { to: "/staff", key: "staff", icon: Users, ownerOnly: true },
  { to: "/settings", key: "timingsHolidays", icon: Clock },
  { to: "/support", key: "helpChat", icon: LifeBuoy },
];

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
  const { t, lang, setLang } = useI18n();
  const { merchant, signOut, can, context, ready } = useAuth();
  const navigate = useNavigate();
  const { hasStore, hasDelivery } = useAppMode();
  usePushRegistration(context.merchantId ?? merchant?.id);
  useNativeOrderActions();
  useDeliveryDeepLinks();
  // Single live subscription for the whole store app (screens no longer add their own).
  useOrderRealtime(merchant?.status === "approved" ? merchant.id : null, can("view_orders"));
  const [open, setOpen] = useState(false);
  const { availability, accepting, scheduleBlocked, setAccepting } = useAvailability();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const scrollRef = useRef<HTMLElement>(null);
  const { pull, refreshing, threshold } = usePullToRefresh(scrollRef, onRefresh);
  const { dragX, animating } = useEdgeSwipeBack(!open, "/home");
  useNativeBack();

  // Delivery-only businesses must never land on a store screen.
  useEffect(() => {
    if (ready && merchant && !hasStore && hasDelivery) {
      void navigate({ to: "/delivery", replace: true });
    }
  }, [ready, merchant, hasStore, hasDelivery, navigate]);

  if (merchant && !hasStore && hasDelivery) return null;


  return (
    <div className="h-full overflow-hidden bg-background">
      <NewOrderSheet />
      <div
        className={`safe-x mx-auto flex h-full w-full max-w-[520px] flex-col border-border bg-background sm:border-x ${
          animating ? "transition-transform duration-200 ease-out" : ""
        }`}
        style={dragX ? { transform: `translate3d(${dragX}px,0,0)` } : undefined}
      >
        <header className="safe-top z-20 shrink-0 border-b border-border bg-card px-4">
          <div className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-extrabold text-foreground">
                {merchant?.store_name ?? "badiyos"}
              </p>
              <p className="truncate text-xs font-semibold text-muted-foreground">{title}</p>
            </div>
            <ModeSwitch current="store" />
            <button
              type="button"
              disabled={setAccepting.isPending || merchant?.status !== "approved"}
              onClick={() => {
                hapticImpact("medium");
                setAccepting.mutate(!accepting);
              }}
              aria-label={t("shopStatus")}
              title={scheduleBlocked ? t("availPausedHint") : undefined}
              className={`flex h-10 items-center gap-2 rounded-full border px-3 text-xs font-extrabold transition-colors disabled:opacity-60 ${
                availability.open
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-muted text-muted-foreground"
              }`}
            >
              <span
                className={`size-2.5 rounded-full ${availability.open ? "bg-primary-foreground" : "bg-muted-foreground"}`}
              />
              {availability.open ? t("openUpper") : t("closedUpper")}
              <Switch checked={accepting} tabIndex={-1} className="pointer-events-none scale-90" />
            </button>
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger
                aria-label={t("menu")}
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-extrabold text-primary"
              >
                {(merchant?.store_name ?? "b").trim().charAt(0).toUpperCase()}
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] p-0">
                <div className="border-b border-border px-6 pt-12 pb-5">
                  <Wordmark className="h-6" />
                  <p className="mt-4 text-base font-extrabold text-foreground">
                    {merchant?.store_name ?? "badiyos"}
                  </p>
                  <p className="num text-sm text-muted-foreground">
                    {merchant?.phone ? `+91 ${merchant.phone}` : t("tagline")}
                  </p>
                </div>
                <nav className="flex flex-col p-3">
                  {links
                    .filter((item) => (item.ownerOnly ? context.isOwner : !item.permission || can(item.permission)))
                    .map(({ to, key, icon: Icon }) => (
                      <Link
                        key={to}
                        to={to}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-4 rounded-xl px-4 py-3.5 text-left text-sm font-semibold text-foreground transition-colors hover:bg-accent"
                      >
                        <Icon className="size-5 text-primary" />
                        <span className="flex-1">{t(key)}</span>
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </Link>
                    ))}
                  <button
                    type="button"
                    onClick={() => {
                      const url = merchant?.store_slug
                        ? `https://badiyos.com/store/${merchant.store_slug}`
                        : "https://badiyos.com";
                      if (navigator.share) {
                        void navigator.share({ title: merchant?.store_name ?? "badiyos", url }).catch(() => {});
                      } else {
                        void navigator.clipboard.writeText(url).then(() => toast.success(t("shareCopied")));
                      }
                    }}
                    className="flex items-center gap-4 rounded-xl px-4 py-3.5 text-left text-sm font-semibold text-foreground transition-colors hover:bg-accent"
                  >
                    <Share2 className="size-5 text-primary" />
                    <span className="flex-1">{t("shareStore")}</span>
                  </button>
                  <div className="flex items-center gap-4 rounded-xl px-4 py-3.5 text-sm font-semibold text-foreground">
                    <Languages className="size-5 text-primary" />
                    <span className="flex-1">{t("language")}</span>
                    <div className="flex rounded-full bg-muted p-1 text-xs font-bold">
                      {(["en", "mr"] as const).map((l) => (
                        <button
                          key={l}
                          type="button"
                          onClick={() => setLang(l)}
                          className={`rounded-full px-3 py-1 ${lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                        >
                          {l === "en" ? "EN" : "मराठी"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="my-3 h-px bg-border" />
                  <button
                    onClick={() => {
                      void signOut().then(() => {
                        setOpen(false);
                        return navigate({ to: "/login", replace: true });
                      });
                    }}
                    className="flex items-center gap-4 rounded-xl px-4 py-3.5 text-left text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <LogOut className="size-5" />
                    {t("logout")}
                  </button>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </header>

        <main ref={scrollRef} className="app-scroll relative flex-1">
          {onRefresh && <PullIndicator pull={pull} refreshing={refreshing} threshold={threshold} />}
          <div
            className={pull ? "" : "transition-transform duration-200 ease-out"}
            style={{ transform: `translate3d(0,${pull}px,0)` }}
          >
            <div className="px-4 pt-4 pb-32">{children}</div>
          </div>
        </main>

        <nav className="safe-bottom fixed bottom-0 z-20 w-full max-w-[520px] border-t border-border bg-card/95 backdrop-blur print:hidden">
          {(() => {
            const visible = tabs.filter((tab) => (tab.ownerOnly ? context.isOwner : !tab.permission || can(tab.permission)));
            return (
              <ul
                className="grid"
                style={{ gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))` }}
              >
                {visible.map(({ to, key, icon: Icon }) => {
              const label = to === "/products" && merchant?.service_type === "food" ? t("navMenu") : t(key);
              const active = pathname === to || pathname.startsWith(`${to}/`);
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
                    {label}
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