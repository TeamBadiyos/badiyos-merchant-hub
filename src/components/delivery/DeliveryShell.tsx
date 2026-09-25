import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ChevronRight,
  Home,
  Languages,
  LogOut,
  MapPin,
  Menu,
  Phone,
  Receipt,
  Settings,
  Truck,
  User,
  Users,
  Wallet,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { ModeSwitch } from "@/components/delivery/ModeSwitch";
import { Wordmark } from "@/components/Wordmark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";
import { useDeliveryDeepLinks } from "@/lib/delivery/deep-links";
import { useDT } from "@/lib/delivery/i18n";
import { useActorName, useAppMode } from "@/lib/delivery/mode";
import { useI18n } from "@/lib/i18n";
import { usePushRegistration } from "@/lib/push";
import { useRequireAuth } from "@/lib/use-require-auth";

const SUPPORT_TEL = "tel:+918007444464";

const tabs = [
  { to: "/delivery", key: "home", icon: Home },
  { to: "/delivery/orders", key: "orders", icon: Receipt },
  { to: "/delivery/receivers", key: "receivers", icon: Users },
  { to: "/delivery/wallet", key: "wallet", icon: Wallet },
] as const;

export function DeliveryShell({ title, children }: { title: string; children: ReactNode }) {
  const dt = useDT();
  const { lang, setLang } = useI18n();
  const merchant = useRequireAuth();
  const { signOut, context, can, ready } = useAuth();
  const { hasDelivery } = useAppMode();
  const { name, save } = useActorName();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  usePushRegistration(context.merchantId ?? merchant?.id);
  useDeliveryDeepLinks();

  useEffect(() => {
    if (ready && merchant && !hasDelivery) void navigate({ to: "/home", replace: true });
  }, [ready, merchant, hasDelivery, navigate]);

  if (!merchant || !hasDelivery) return null;

  const inactive = context.deliveryStatus === "inactive" || context.deliveryStatus === "suspended";

  const center = (body: ReactNode) => (
    <div className="flex h-full items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-card">
        {body}
      </div>
    </div>
  );

  if (inactive)
    return center(
      <>
        <Truck className="mx-auto size-10 text-primary" />
        <p className="mt-4 text-lg font-bold text-foreground">{dt("inactiveTitle")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{dt("inactiveSub")}</p>
        <Button asChild size="lg" className="mt-6 h-12 w-full">
          <a href={SUPPORT_TEL}>
            <Phone className="size-5" />
            {dt("callBadiyos")}
          </a>
        </Button>
        {context.storeEnabled && (
          <Button variant="ghost" className="mt-2 w-full" onClick={() => navigate({ to: "/home" })}>
            {dt("back")}
          </Button>
        )}
      </>,
    );

  if (name === "")
    return center(
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) save(draft);
        }}
      >
        <User className="mx-auto size-10 text-primary" />
        <p className="mt-4 text-lg font-bold text-foreground">{dt("yourName")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{dt("yourNameSub")}</p>
        <Input
          autoFocus
          className="mt-5 h-12 text-base"
          value={draft}
          maxLength={60}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={dt("needName")}
        />
        <Button type="submit" size="lg" className="mt-4 h-12 w-full" disabled={!draft.trim()}>
          {dt("save")}
        </Button>
      </form>,
    );

  const menu = [
    { to: "/delivery/pickup-points", label: dt("pickupPoints"), icon: MapPin, show: true },
    { to: "/staff", label: dt("staff"), icon: Users, show: can("manage_staff") },
    { to: "/delivery/settings", label: dt("settings"), icon: Settings, show: true },
    { to: "/profile", label: dt("profile"), icon: User, show: true },
  ];

  return (
    <div className="h-full overflow-hidden bg-background">
      <div className="safe-x mx-auto flex h-full w-full max-w-[520px] flex-col border-border bg-background sm:border-x">
        <header className="bg-brand-gradient safe-top z-20 shrink-0 px-6 pb-6 text-primary-foreground">
          <div className="flex items-center gap-4 pt-6">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger aria-label="Menu" className="-ml-2 rounded-xl p-2 hover:bg-primary-foreground/15">
                <Menu className="size-6" />
              </SheetTrigger>
              <SheetContent side="left" className="w-[300px] p-0">
                <div className="bg-brand-gradient px-6 pt-12 pb-6 text-primary-foreground">
                  <Wordmark on="dark" className="h-6" />
                  <p className="mt-4 text-base font-bold">{merchant.store_name ?? "badiyos"}</p>
                  <p className="text-sm opacity-80">{name}</p>
                </div>
                <nav className="flex flex-col p-4">
                  {menu
                    .filter((m) => m.show)
                    .map(({ to, label, icon: Icon }) => (
                      <Link
                        key={to}
                        to={to}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-4 rounded-xl px-4 py-4 text-sm font-semibold text-foreground hover:bg-accent"
                      >
                        <Icon className="size-5 text-primary" />
                        <span className="flex-1">{label}</span>
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </Link>
                    ))}
                  <button
                    onClick={() => setLang(lang === "en" ? "mr" : "en")}
                    className="flex items-center gap-4 rounded-xl px-4 py-4 text-left text-sm font-semibold text-foreground hover:bg-accent"
                  >
                    <Languages className="size-5 text-primary" />
                    <span className="flex-1">{dt("language")}</span>
                    <span className="text-xs font-bold text-muted-foreground">
                      {lang === "en" ? "English" : "मराठी"}
                    </span>
                  </button>
                  <div className="my-4 h-px bg-border" />
                  <button
                    onClick={() =>
                      void signOut().then(() => navigate({ to: "/login", replace: true }))
                    }
                    className="flex items-center gap-4 rounded-xl px-4 py-4 text-left text-sm font-semibold text-destructive hover:bg-destructive/10"
                  >
                    <LogOut className="size-5" />
                    {dt("logout")}
                  </button>
                </nav>
              </SheetContent>
            </Sheet>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold uppercase opacity-80">{title}</p>
              <p className="truncate text-base font-bold">{merchant.store_name ?? "badiyos"}</p>
            </div>
            <ModeSwitch current="delivery" />
          </div>
        </header>

        <main className="app-scroll relative flex-1">
          <div className="px-6 pt-6 pb-32">{children}</div>
        </main>

        <nav className="safe-bottom fixed bottom-0 z-20 w-full max-w-[520px] border-t border-border bg-card/95 backdrop-blur">
          <ul className="grid grid-cols-4">
            {tabs.map(({ to, key, icon: Icon }) => {
              const active = to === "/delivery" ? pathname === to || pathname === "/delivery/" : pathname.startsWith(to);
              return (
                <li key={to}>
                  <Link
                    to={to}
                    className={`flex flex-col items-center gap-1 py-3 text-[11px] font-bold ${
                      active ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    <span
                      className={`flex size-8 items-center justify-center rounded-xl ${active ? "bg-primary-soft" : ""}`}
                    >
                      <Icon className="size-5" />
                    </span>
                    {dt(key)}
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

/** Standard delivery route head(). */
export function deliveryHead(title: string, description: string) {
  return {
    meta: [
      { title: `${title} — badiyos Delivery` },
      { name: "description", content: description },
      { property: "og:title", content: `${title} — badiyos Delivery` },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  };
}
