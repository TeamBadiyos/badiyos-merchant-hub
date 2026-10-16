import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Star } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { AccessDenied, PendingApproval } from "@/components/GateNotice";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/use-require-auth";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Insights — badiyos Merchant Portal" },
      { name: "description", content: "Store visits, conversion, visit sources, top items, repeat customers, ratings and peak hours." },
      { property: "og:title", content: "Insights — badiyos Merchant Portal" },
      { property: "og:description", content: "How customers find and order from your badiyos shop." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InsightsPage,
});

const TX = {
  en: {
    title: "Insights", today: "Today", d7: "7 days", d30: "30 days", visits: "Store visits", unique: "Unique visitors",
    orders: "Orders", conv: "Conversion", sources: "Visits by source", browse: "App browse", search: "Search",
    link: "Store link", banner: "Banner", top: "Top 5 items", repeat: "Repeat customers", rating: "Average rating",
    reviews: "Last 5 reviews", peak: "Peak order hours", none: "No data yet", noReviews: "No reviews yet", sold: "sold",
  },
  mr: {
    title: "इनसाइट्स", today: "आज", d7: "७ दिवस", d30: "३० दिवस", visits: "दुकान भेटी", unique: "वेगळे भेट देणारे",
    orders: "ऑर्डर्स", conv: "रूपांतरण", sources: "भेटींचा स्रोत", browse: "अ‍ॅप ब्राउझ", search: "शोध",
    link: "दुकान लिंक", banner: "बॅनर", top: "टॉप ५ आयटम", repeat: "पुन्हा येणारे ग्राहक", rating: "सरासरी रेटिंग",
    reviews: "शेवटचे ५ रिव्ह्यू", peak: "जास्त ऑर्डरचे तास", none: "अजून माहिती नाही", noReviews: "अजून रिव्ह्यू नाहीत", sold: "विकले",
  },
};

type Insights = {
  visits: number; unique: number; orders: number;
  sources: Record<"browse" | "search" | "link" | "banner", number>;
  top_items: { name: string; qty: number }[];
  customers: number; repeat_customers: number;
  rating_avg: number | null; rating_count: number;
  reviews: { rating: number; comment: string | null; at: string }[];
  hours: { h: number; n: number }[];
};

function InsightsPage() {
  const { lang } = useI18n();
  const L = TX[lang === "mr" ? "mr" : "en"];
  const { can } = useAuth();
  const merchant = useRequireAuth();
  const allowed = can("view_reports");
  const [days, setDays] = useState(1);

  const q = useQuery({
    queryKey: ["merchant-insights", merchant?.id, days],
    enabled: !!merchant?.id && allowed && merchant?.status === "approved",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("merchant_insights", { _days: days });
      if (error) throw error;
      return data as unknown as Insights;
    },
  });

  if (!merchant) return null;
  if (merchant.status !== "approved") return <AppShell title={L.title}><PendingApproval /></AppShell>;
  if (!allowed) return <AppShell title={L.title}><AccessDenied /></AppShell>;

  const d = q.data;
  const conv = d && d.unique > 0 ? Math.round((d.orders / d.unique) * 1000) / 10 : 0;
  const repeat = d && d.customers > 0 ? Math.round((d.repeat_customers / d.customers) * 100) : 0;
  const srcTotal = d ? Object.values(d.sources).reduce((a, b) => a + Number(b), 0) : 0;
  const maxHour = d ? Math.max(1, ...d.hours.map((h) => Number(h.n))) : 1;
  const card = "rounded-2xl border border-border bg-card p-4 shadow-card";

  return (
    <AppShell title={L.title} onRefresh={() => q.refetch()}>
      <div className="space-y-4">
        <div className="flex gap-2">
          {([[1, L.today], [7, L.d7], [30, L.d30]] as const).map(([n, label]) => (
            <button key={n} onClick={() => setDays(n)}
              className={`rounded-full px-4 py-2 text-xs font-bold ${days === n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {label}
            </button>
          ))}
        </div>

        {q.isLoading || !d ? (
          <Loader2 className="mx-auto size-6 animate-spin text-primary" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              {[[L.visits, d.visits], [L.unique, d.unique], [L.orders, d.orders], [L.conv, `${conv}%`]].map(([l, v]) => (
                <div key={String(l)} className={card}>
                  <p className="num text-2xl font-extrabold text-primary">{v}</p>
                  <p className="mt-1 text-xs font-bold text-muted-foreground">{l}</p>
                </div>
              ))}
            </div>

            <section className={card}>
              <h2 className="text-sm font-bold text-foreground">{L.sources}</h2>
              <div className="mt-3 space-y-2">
                {(["browse", "search", "link", "banner"] as const).map((k) => {
                  const n = Number(d.sources[k] ?? 0);
                  return (
                    <div key={k}>
                      <div className="flex justify-between text-xs font-semibold"><span>{L[k]}</span><span className="num">{n}</span></div>
                      <div className="mt-1 h-2 rounded-full bg-muted">
                        <div className="h-2 rounded-full bg-primary" style={{ width: `${srcTotal ? (n / srcTotal) * 100 : 0}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className={card}>
              <h2 className="text-sm font-bold text-foreground">{L.top}</h2>
              {d.top_items.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{L.none}</p> : (
                <ol className="mt-2 space-y-1">
                  {d.top_items.map((it, i) => (
                    <li key={it.name} className="flex justify-between text-sm">
                      <span className="truncate"><span className="num mr-2 font-bold text-primary">{i + 1}</span>{it.name}</span>
                      <span className="num shrink-0 text-muted-foreground">{Number(it.qty)} {L.sold}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <div className="grid grid-cols-2 gap-3">
              <div className={card}>
                <p className="num text-2xl font-extrabold text-primary">{repeat}%</p>
                <p className="mt-1 text-xs font-bold text-muted-foreground">{L.repeat}</p>
              </div>
              <div className={card}>
                <p className="num flex items-center gap-1 text-2xl font-extrabold text-primary">
                  {d.rating_avg ?? "—"} <Star className="size-5 fill-primary" />
                </p>
                <p className="mt-1 text-xs font-bold text-muted-foreground">{L.rating} · {d.rating_count}</p>
              </div>
            </div>

            <section className={card}>
              <h2 className="text-sm font-bold text-foreground">{L.reviews}</h2>
              {d.reviews.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{L.noReviews}</p> : (
                <ul className="mt-2 divide-y divide-border">
                  {d.reviews.map((r, i) => (
                    <li key={i} className="py-2">
                      <p className="text-xs font-bold text-primary">{"★".repeat(r.rating)}<span className="text-muted-foreground">{"★".repeat(5 - r.rating)}</span>
                        <span className="ml-2 font-semibold text-muted-foreground">{new Date(r.at).toLocaleDateString()}</span></p>
                      {r.comment && <p className="mt-1 text-sm text-foreground">{r.comment}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={card}>
              <h2 className="text-sm font-bold text-foreground">{L.peak}</h2>
              <div className="mt-3 flex h-28 items-end gap-[2px]">
                {d.hours.map((h) => (
                  <div key={h.h} className="flex flex-1 flex-col items-center justify-end">
                    <div className="w-full rounded-t bg-primary" style={{ height: `${(Number(h.n) / maxHour) * 100}%`, minHeight: Number(h.n) ? 2 : 0 }} />
                  </div>
                ))}
              </div>
              <div className="num mt-1 flex justify-between text-[10px] text-muted-foreground"><span>0</span><span>6</span><span>12</span><span>18</span><span>23</span></div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
