import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { AccessDenied, PendingApproval } from "@/components/GateNotice";
import { OrderCard } from "@/components/OrderCard";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import type { Key } from "@/lib/i18n";
import { isPaymentSettled } from "@/lib/order-status";
import { fetchOrders } from "@/lib/orders";
import { useRequireAuth } from "@/lib/use-require-auth";

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "Orders — badiyos Merchant Portal" },
      {
        name: "description",
        content:
          "Search and filter your full badiyos order history by status — pending, accepted, ready or completed.",
      },
      { property: "og:title", content: "Orders — badiyos Merchant Portal" },
      { property: "og:description", content: "Full order history for your badiyos shop." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrdersPage,
});

type Tab = "active" | "completed" | "cancelled";
type Range = "today" | "week" | "month" | "custom";

const TABS: { v: Tab; k: Key }[] = [
  { v: "active", k: "tabActive" },
  { v: "completed", k: "tabCompleted" },
  { v: "cancelled", k: "tabCancelled" },
];
const RANGES: { v: Range; k: Key }[] = [
  { v: "today", k: "fToday" },
  { v: "week", k: "fWeek" },
  { v: "month", k: "fMonth" },
  { v: "custom", k: "fCustom" },
];

const TAB_OF = (status: string): Tab =>
  status === "rejected" || status === "cancelled"
    ? "cancelled"
    : status === "delivered" || status === "completed"
      ? "completed"
      : "active";

function rangeStart(range: Range, from: string): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (range === "week") d.setDate(d.getDate() - 6);
  if (range === "month") d.setDate(d.getDate() - 29);
  if (range === "custom") {
    if (from) return new Date(`${from}T00:00:00`).toISOString();
    d.setDate(d.getDate() - 29);
  }
  return d.toISOString();
}

function OrdersPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  const merchant = useRequireAuth();
  const allowed = can("view_orders");
  const [tab, setTab] = useState<Tab>("active");
  const [range, setRange] = useState<Range>("week");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [term, setTerm] = useState("");

  // Realtime is already subscribed once in the shell — no second channel here.
  const since = rangeStart(range, from);
  const until = range === "custom" && to ? new Date(`${to}T23:59:59`).toISOString() : null;

  // Paged by date range: 100 newest first, "Load older" walks further back.
  const orders = useInfiniteQuery({
    queryKey: ["orders", "all", merchant?.id, since, until],
    enabled: Boolean(merchant?.id) && allowed && merchant?.status === "approved",
    initialPageParam: until as string | null,
    queryFn: ({ pageParam }) =>
      fetchOrders(undefined, {
        since,
        limit: 100,
        ...(pageParam ? { before: pageParam } : {}),
      }),
    getNextPageParam: (lastPage) =>
      lastPage.length === 100 ? lastPage[lastPage.length - 1]?.created_at : undefined,
  });

  const allOrders = useMemo(() => orders.data?.pages.flat() ?? [], [orders.data]);

  const filtered = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return allOrders.filter((order) => {
      if (!isPaymentSettled(order)) return false;
      if (TAB_OF(order.status) !== tab) return false;
      return !needle || order.order_number.toLowerCase().includes(needle);
    });
  }, [allOrders, tab, term]);

  if (!merchant) return null;

  return (
    <AppShell title={t("orders")} onRefresh={() => orders.refetch()}>
      {merchant.status !== "approved" ? (
        <PendingApproval />
      ) : !allowed ? (
        <AccessDenied />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 rounded-2xl bg-muted p-1">
            {TABS.map(({ v, k }) => (
              <button
                key={v}
                onClick={() => setTab(v)}
                className={`rounded-xl py-2 text-xs font-bold transition-colors ${
                  tab === v ? "bg-card text-primary shadow-card" : "text-muted-foreground"
                }`}
              >
                {t(k)}
              </button>
            ))}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {RANGES.map(({ v, k }) => (
              <button
                key={v}
                onClick={() => setRange(v)}
                className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold ${
                  range === v ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground"
                }`}
              >
                {t(k)}
              </button>
            ))}
          </div>

          {range === "custom" && (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] font-bold uppercase text-muted-foreground">
                {t("dateFrom")}
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 rounded-xl" />
              </label>
              <label className="text-[11px] font-bold uppercase text-muted-foreground">
                {t("dateTo")}
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 rounded-xl" />
              </label>
            </div>
          )}

          <div className="flex items-center gap-3 rounded-2xl border border-input bg-background px-4">
            <Search className="size-4 text-muted-foreground" />
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder={t("searchOrderNo")}
              inputMode="search"
              className="border-0 bg-transparent px-0 text-sm font-semibold shadow-none focus-visible:ring-0"
            />
          </div>

          {orders.isLoading && (
            <div className="flex justify-center py-10">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          )}

          {!orders.isLoading && filtered.length === 0 && (
            <p className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              {term ? t("noResults") : t("noOrders")}
            </p>
          )}

          {filtered.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}

          {orders.hasNextPage && (
            <button
              onClick={() => orders.fetchNextPage()}
              disabled={orders.isFetchingNextPage}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-input bg-background py-3 text-sm font-bold text-primary"
            >
              {orders.isFetchingNextPage && (
                <Loader2 className="size-4 animate-spin" />
              )}
              {t("loadOlder")}
            </button>
          )}
        </div>
      )}
    </AppShell>
  );
}
