import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownLeft, ArrowUpRight, Loader2, Percent, Wallet as WalletIcon } from "lucide-react";

import { AppShell, PlaceholderPanel } from "@/components/AppShell";
import { AccessDenied, PendingApproval } from "@/components/GateNotice";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { inr } from "@/lib/order-status";
import { useRequireAuth } from "@/lib/use-require-auth";

export const Route = createFileRoute("/wallet")({
  head: () => ({
    meta: [
      { title: "Wallet — badiyos Merchant Portal" },
      {
        name: "description",
        content:
          "Track your net earnings, platform commission and pending payout balance, with a full settlement history.",
      },
      { property: "og:title", content: "Wallet — badiyos Merchant Portal" },
      { property: "og:description", content: "Earnings, commission and payouts for your shop." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WalletPage,
});

function WalletPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  const merchant = useRequireAuth();
  const allowed = can("view_reports");
  const approved = merchant?.status === "approved";

  const completed = useQuery({
    queryKey: ["wallet", "orders", merchant?.id],
    enabled: Boolean(merchant?.id) && allowed && approved,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("merchant_orders")
        .select("total_amount, commission_amount")
        .eq("status", "completed");
      if (error) throw error;
      return data;
    },
  });

  const ledger = useQuery({
    queryKey: ["wallet", "ledger", merchant?.id],
    enabled: Boolean(merchant?.id) && allowed && approved,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallet_ledger")
        .select("*")
        .eq("owner_type", "merchant")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  if (!merchant) return null;

  const revenue = (completed.data ?? []).reduce((s, o) => s + Number(o.total_amount ?? 0), 0);
  const commission = (completed.data ?? []).reduce(
    (s, o) => s + Number(o.commission_amount ?? 0),
    0,
  );
  const earned = revenue - commission;
  const paidOut = (ledger.data ?? [])
    .filter((row) => row.type === "debit")
    .reduce((s, row) => s + Number(row.amount ?? 0), 0);
  const pending = earned - paidOut;

  const cards = [
    { label: t("totalEarned"), value: inr(earned), icon: WalletIcon },
    { label: t("commissionPaid"), value: inr(commission), icon: Percent },
    { label: t("pendingPayout"), value: inr(pending), icon: ArrowUpRight },
  ];

  return (
    <AppShell
      title={t("wallet")}
      onRefresh={() => Promise.all([completed.refetch(), ledger.refetch()])}
    >
      {!approved ? (
        <PendingApproval />
      ) : !allowed ? (
        <AccessDenied />
      ) : (
        <div className="space-y-6">
          <div className="bg-brand-gradient rounded-3xl p-6 text-primary-foreground shadow-brand">
            <p className="text-xs font-bold uppercase opacity-80">{t("pendingPayout")}</p>
            <p className="num mt-2 text-3xl font-extrabold">{inr(pending)}</p>
            <p className="mt-2 text-xs font-semibold opacity-80">{t("payoutNote")}</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {cards.map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-2xl border border-border bg-card p-4 shadow-card">
                <Icon className="size-5 text-primary" />
                <p className="num mt-2 text-sm font-extrabold text-foreground">{value}</p>
                <p className="text-[11px] leading-tight font-semibold text-muted-foreground">
                  {label}
                </p>
              </div>
            ))}
          </div>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-foreground">{t("ledger")}</h2>
            {ledger.isLoading && (
              <div className="flex justify-center py-8">
                <Loader2 className="size-6 animate-spin text-primary" />
              </div>
            )}
            {!ledger.isLoading && (ledger.data ?? []).length === 0 && (
              <PlaceholderPanel
                title={t("ledger")}
                description={t("noLedger")}
                icon={WalletIcon}
              />
            )}
            {(ledger.data ?? []).map((row) => {
              const isCredit = row.type === "credit";
              return (
                <div
                  key={row.id}
                  className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-card"
                >
                  <span
                    className={`flex size-10 shrink-0 items-center justify-center rounded-2xl ${
                      isCredit ? "bg-primary-soft text-primary" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isCredit ? (
                      <ArrowDownLeft className="size-5" />
                    ) : (
                      <ArrowUpRight className="size-5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-foreground">
                      {isCredit ? t("credit") : t("debit")}
                    </p>
                    <p className="num truncate text-xs font-semibold text-muted-foreground">
                      {row.reason} ·{" "}
                      {new Date(row.created_at).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <p
                    className={`num shrink-0 text-sm font-extrabold ${
                      isCredit ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {isCredit ? "+" : "−"}
                    {inr(row.amount)}
                  </p>
                </div>
              );
            })}
          </section>
        </div>
      )}
    </AppShell>
  );
}
