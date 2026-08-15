import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BarChart3, IndianRupee, Loader2, PackageOpen, Receipt } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell, PlaceholderPanel } from "@/components/AppShell";
import { AccessDenied, PendingApproval } from "@/components/GateNotice";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { useI18n, type Key } from "@/lib/i18n";
import { inr } from "@/lib/order-status";
import {
  fetchCompletedOrders,
  resolveRange,
  revenueSeries,
  summarise,
  topProducts,
  type RangeKey,
} from "@/lib/reports";
import { useRequireAuth } from "@/lib/use-require-auth";

const RANGES: { key: RangeKey; label: Key }[] = [
  { key: "today", label: "rangeToday" },
  { key: "week", label: "rangeWeek" },
  { key: "month", label: "rangeMonth" },
  { key: "custom", label: "rangeCustom" },
];

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports — badiyos Merchant Portal" },
      {
        name: "description",
        content:
          "See sales totals, average order value, revenue trends and your top selling products for any date range.",
      },
      { property: "og:title", content: "Reports — badiyos Merchant Portal" },
      { property: "og:description", content: "Sales analytics for your badiyos shop." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  const merchant = useRequireAuth();
  const allowed = can("view_reports");
  const [rangeKey, setRangeKey] = useState<RangeKey>("week");
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const range = useMemo(() => resolveRange(rangeKey, from, to), [rangeKey, from, to]);

  const orders = useQuery({
    queryKey: ["reports", merchant?.id, rangeKey, range.from.toISOString(), range.to.toISOString()],
    enabled: Boolean(merchant?.id) && allowed && merchant?.status === "approved",
    queryFn: () => fetchCompletedOrders(range),
  });

  const summary = summarise(orders.data ?? []);
  const series = useMemo(() => revenueSeries(orders.data ?? [], range), [orders.data, range]);
  const top = useMemo(() => topProducts(orders.data ?? []), [orders.data]);

  if (!merchant) return null;
  if (merchant.status !== "approved")
    return (
      <AppShell title={t("reports")}>
        <PendingApproval />
      </AppShell>
    );
  if (!allowed)
    return (
      <AppShell title={t("reports")}>
        <AccessDenied />
      </AppShell>
    );

  const stats = [
    { label: t("totalOrders"), value: String(summary.count), icon: PackageOpen },
    { label: t("totalRevenue"), value: inr(summary.revenue), icon: IndianRupee },
    { label: t("avgOrderValue"), value: inr(summary.average), icon: Receipt },
  ];

  return (
    <AppShell title={t("reports")}>
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          {RANGES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setRangeKey(key)}
              className={`rounded-full px-4 py-2 text-xs font-bold transition-colors ${
                rangeKey === key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {t(label)}
            </button>
          ))}
        </div>

        {rangeKey === "custom" && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold">{t("from")}</Label>
              <Input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className="num rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold">{t("to")}</Label>
              <Input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                className="num rounded-xl"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          {stats.map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-2xl border border-border bg-card p-4 shadow-card">
              <Icon className="size-5 text-primary" />
              <p className="num mt-2 text-base font-extrabold text-foreground">{value}</p>
              <p className="text-[11px] leading-tight font-semibold text-muted-foreground">
                {label}
              </p>
            </div>
          ))}
        </div>

        {orders.isLoading && (
          <div className="flex justify-center py-10">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        )}

        {!orders.isLoading && summary.count === 0 && (
          <PlaceholderPanel
            title={t("reports")}
            description={t("noReportData")}
            icon={BarChart3}
          />
        )}

        {summary.count > 0 && (
          <>
            <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
              <h2 className="text-sm font-bold text-foreground">{t("revenueOverTime")}</h2>
              <div className="mt-4 h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series} margin={{ left: -18, right: 4, top: 4 }}>
                    <CartesianGrid vertical={false} strokeOpacity={0.15} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      fontSize={10}
                      interval="preserveStartEnd"
                    />
                    <YAxis tickLine={false} axisLine={false} fontSize={10} width={48} />
                    <Tooltip
                      formatter={(value) => inr(Number(value))}
                      contentStyle={{ borderRadius: 12, fontSize: 12 }}
                    />
                    <Bar
                      dataKey="revenue"
                      fill="var(--color-primary)"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={28}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-bold text-foreground">{t("topProducts")}</h2>
              {top.map((product, i) => (
                <div
                  key={`${product.name}-${i}`}
                  className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-card"
                >
                  <span className="num flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-xs font-extrabold text-primary">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-foreground">{product.name}</p>
                    <p className="num text-xs font-semibold text-muted-foreground">
                      {product.quantity} {t("qtySold")} · {inr(product.revenue)}
                    </p>
                  </div>
                </div>
              ))}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
