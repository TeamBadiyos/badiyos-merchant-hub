import { createFileRoute, Link } from "@tanstack/react-router";
import { BellRing, CheckCircle2, ChevronLeft, CircleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getAlertStatus, isAndroidApp, openAlertSetting, type AlertSetting, type AlertStatus } from "@/lib/alert-settings";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/battery-guide")({
  head: () => ({
    meta: [
      { title: "Order ringing & battery — badiyos Merchant" },
      { name: "description", content: "Make sure new orders ring loudly even when your phone is locked." },
      { property: "og:title", content: "Order ringing & battery — badiyos Merchant" },
      { property: "og:description", content: "Full-screen alerts, Do Not Disturb, battery and autostart settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BatteryGuide,
});

const OEMS: { key: string; name: string; en: string; mr: string }[] = [
  { key: "xiaomi", name: "Xiaomi / Redmi / POCO", en: "Settings → Apps → badiyos Merchant → Autostart ON. Battery saver → No restrictions. Lock the app in Recents (swipe down on it).", mr: "Settings → Apps → badiyos Merchant → Autostart चालू. Battery saver → No restrictions. Recents मध्ये ॲप लॉक करा." },
  { key: "vivo", name: "Vivo / iQOO", en: "Settings → Battery → Background power consumption → allow badiyos Merchant. i Manager → Autostart → ON.", mr: "Settings → Battery → Background power consumption → badiyos Merchant ला परवानगी द्या. i Manager → Autostart → चालू." },
  { key: "oppo", name: "Oppo / Realme / OnePlus", en: "Settings → Apps → badiyos Merchant → Battery → Allow background activity and Auto launch ON.", mr: "Settings → Apps → badiyos Merchant → Battery → Background activity आणि Auto launch चालू करा." },
  { key: "samsung", name: "Samsung", en: "Settings → Apps → badiyos Merchant → Battery → Unrestricted. Remove it from 'Sleeping apps'.", mr: "Settings → Apps → badiyos Merchant → Battery → Unrestricted. 'Sleeping apps' मधून काढा." },
];

function BatteryGuide() {
  const { lang } = useI18n();
  const mr = lang === "mr";
  const [status, setStatus] = useState<AlertStatus | null>(null);
  const native = isAndroidApp();

  const load = () => void getAlertStatus().then(setStatus);
  useEffect(() => {
    load();
    const onFocus = () => load();
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, []);

  const open = async (w: AlertSetting) => {
    const ok = await openAlertSetting(w);
    if (!ok) toast.error(mr ? "फोनच्या Settings मध्ये हे स्वतः उघडा." : "Please open this in your phone's Settings.");
  };

  const rows: { key: AlertSetting; ok?: boolean | undefined; title: string; help: string }[] = [
    { key: "notifications", ok: status?.notifications, title: mr ? "सूचना" : "Notifications", help: mr ? "नवीन ऑर्डर सूचना चालू ठेवा." : "Keep order notifications on." },
    { key: "fullScreen", ok: status?.fullScreen, title: mr ? "फुल-स्क्रीन अलर्ट" : "Full-screen alerts", help: mr ? "लॉक फोनवर ऑर्डर स्क्रीन उघडते." : "Opens the order screen on a locked phone." },
    { key: "dnd", ok: status?.dnd, title: mr ? "व्यत्यय आणू नका (DND)" : "Do Not Disturb", help: mr ? "DND चालू असतानाही वाजू द्या." : "Lets orders ring even in Do Not Disturb." },
    { key: "battery", ok: status?.battery, title: mr ? "बॅटरी निर्बंध नाही" : "No battery restriction", help: mr ? "फोन ॲप बंद करणार नाही." : "Stops the phone from putting the app to sleep." },
    { key: "autostart", title: mr ? "ऑटोस्टार्ट" : "Autostart", help: mr ? "फोन रीस्टार्टनंतरही ऑर्डर येतात." : "Orders still arrive after a restart." },
  ];

  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-md bg-background pb-10">
      <header className="sticky top-0 z-30 flex items-center gap-2 bg-background px-4 pb-3 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <Link to="/settings" className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted" aria-label="Back">
          <ChevronLeft className="h-6 w-6" />
        </Link>
        <h1 className="text-xl font-bold text-foreground">{mr ? "ऑर्डर रिंग आणि बॅटरी" : "Order ringing & battery"}</h1>
      </header>

      <section className="mx-4 rounded-3xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-start gap-3">
          <BellRing className="mt-0.5 h-5 w-5 text-primary" />
          <p className="text-sm text-foreground">
            {mr
              ? "फोन लॉक किंवा सायलेंट असला तरी नवीन ऑर्डर मोठ्याने वाजण्यासाठी खालील सर्व चालू करा."
              : "Turn on everything below so new orders ring loudly even when your phone is locked or on silent."}
          </p>
        </div>
        {!native && (
          <p className="mt-3 text-sm text-muted-foreground">
            {mr ? "ही सेटिंग्ज फक्त Android ॲपमध्ये आहेत." : "These settings are available in the Android app."}
          </p>
        )}
      </section>

      {native && (
        <ul className="mx-4 mt-4 space-y-2">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
              {r.ok === true ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
              ) : (
                <CircleAlert className="h-5 w-5 shrink-0 text-destructive" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-foreground">{r.title}</p>
                <p className="text-xs text-muted-foreground">{r.help}</p>
              </div>
              <Button size="sm" variant={r.ok ? "outline" : "default"} onClick={() => void open(r.key)}>
                {r.ok ? (mr ? "पहा" : "View") : mr ? "चालू करा" : "Turn on"}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <section className="mx-4 mt-6">
        <h2 className="text-sm font-bold text-foreground">{mr ? "तुमच्या फोनसाठी पायऱ्या" : "Steps for your phone"}</h2>
        <ul className="mt-2 space-y-2">
          {OEMS.map((o) => (
            <li
              key={o.key}
              className={`rounded-2xl border bg-card p-4 ${status?.manufacturer.includes(o.key) ? "border-primary" : "border-border"}`}
            >
              <p className="text-sm font-bold text-foreground">{o.name}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{mr ? o.mr : o.en}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
