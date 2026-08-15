import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Receipt, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell, PlaceholderPanel } from "@/components/AppShell";
import { AccessDenied, PendingApproval } from "@/components/GateNotice";
import { OrderCard } from "@/components/OrderCard";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { ORDER_STATUSES, STATUS_LABEL } from "@/lib/order-status";
import { fetchOrders, itemsSummary } from "@/lib/orders";
import { useOrderRealtime } from "@/lib/use-order-realtime";
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

function OrdersPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  const merchant = useRequireAuth();
  const allowed = can("view_orders");
  const [status, setStatus] = useState<string>("all");
  const [term, setTerm] = useState("");

  useOrderRealtime(merchant?.id);

  const orders = useQuery({
    queryKey: ["orders", "all", merchant?.id],
    enabled: Boolean(merchant?.id) && allowed && merchant?.status === "approved",
    queryFn: () => fetchOrders(),
  });

  const filtered = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return (orders.data ?? []).filter((order) => {
      if (status !== "all" && order.status !== status) return false;
      if (!needle) return true;
      return (
        order.order_number.toLowerCase().includes(needle) ||
        itemsSummary(order).toLowerCase().includes(needle)
      );
    });
  }, [orders.data, status, term]);

  if (!merchant) return null;

  return (
    <AppShell title={t("orders")}>
      {merchant.status !== "approved" ? (
        <PendingApproval />
      ) : !allowed ? (
        <AccessDenied />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl border border-input bg-background px-4">
            <Search className="size-4 text-muted-foreground" />
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder={t("search")}
              className="border-0 bg-transparent px-0 text-sm font-semibold shadow-none focus-visible:ring-0"
            />
          </div>

          <div className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1">
            {(["all", ...ORDER_STATUSES] as const).map((value) => (
              <button
                key={value}
                onClick={() => setStatus(value)}
                className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition-colors ${
                  status === value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {value === "all" ? t("all") : t(STATUS_LABEL[value])}
              </button>
            ))}
          </div>

          {orders.isLoading && (
            <div className="flex justify-center py-10">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          )}

          {!orders.isLoading && filtered.length === 0 && (
            <PlaceholderPanel
              title={orders.data?.length ? t("noResults") : t("noOrders")}
              description={t("ordersEmpty")}
              icon={Receipt}
            />
          )}

          {filtered.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
