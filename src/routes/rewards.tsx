import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Gift, Loader2, Target, Undo2 } from "lucide-react";

import { AppShell, PlaceholderPanel } from "@/components/AppShell";
import { AccessDenied, PendingApproval } from "@/components/GateNotice";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { inr } from "@/lib/order-status";
import { useRequireAuth } from "@/lib/use-require-auth";

export const Route = createFileRoute("/rewards")({
  head: () => ({
    meta: [
      { title: "Rewards & bonuses — badiyos Merchant Portal" },
      {
        name: "description",
        content:
          "See the bonuses badiyos has credited to your shop, your running total and the reward targets currently running.",
      },
      { property: "og:title", content: "Rewards & bonuses — badiyos Merchant Portal" },
      {
        property: "og:description",
        content: "Track credited merchant bonuses and active reward targets for your shop.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RewardsPage,
});

type Ledger = {
  id: string;
  reward_type: string;
  reward_value: number;
  status: string;
  notes: string | null;
  credited_at: string;
  reversed_at: string | null;
  reversal_reason: string | null;
  program: { name: string } | null;
};

type Program = {
  id: string;
  name: string;
  trigger_type: string;
  condition: Record<string, unknown> | null;
  reward_type: string;
  reward_value: number;
  valid_until: string | null;
};

/** Coins are shown as a plain count; everything else is money. */
function rewardAmount(type: string, value: number, coinLabel: string) {
  return type.toLowerCase().includes("coin")
    ? `${Number(value)} ${coinLabel}`
    : inr(Number(value));
}

function periodStart(period: string) {
  const now = new Date();
  if (period === "monthly") return new Date(now.getFullYear(), now.getMonth(), 1);
  const day = now.getDay(); // week starts Monday
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((day + 6) % 7));
  return start;
}

function RewardsPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  const merchant = useRequireAuth();
  const allowed = can("view_reports");
  const approved = merchant?.status === "approved";
  const enabled = Boolean(merchant?.id) && allowed && approved;

  const ledger = useQuery({
    queryKey: ["rewards", "ledger", merchant?.id],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reward_ledger")
        .select(
          "id, reward_type, reward_value, status, notes, credited_at, reversed_at, reversal_reason, program:reward_programs(name)",
        )
        .eq("actor_type", "merchant")
        .order("credited_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Ledger[];
    },
  });

  const programs = useQuery({
    queryKey: ["rewards", "programs"],
    enabled,
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from("reward_programs")
        .select("id, name, trigger_type, condition, reward_type, reward_value, valid_until")
        .eq("actor_type", "merchant")
        .eq("is_active", true)
        .or(`valid_until.is.null,valid_until.gte.${nowIso}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Program[];
    },
  });

  /** Completed order counts per period, used for countable progress bars. */
  const counts = useQuery({
    queryKey: ["rewards", "counts", merchant?.id],
    enabled,
    queryFn: async () => {
      const countFor = (period: "weekly" | "monthly") =>
        supabase
          .from("merchant_orders")
          .select("id", { count: "exact", head: true })
          .eq("status", "completed")
          .gte("created_at", periodStart(period).toISOString());
      const weekly = await countFor("weekly");
      const monthly = await countFor("monthly");
      if (weekly.error) throw weekly.error;
      if (monthly.error) throw monthly.error;
      return { weekly: weekly.count ?? 0, monthly: monthly.count ?? 0 };
    },
  });

  if (!merchant) return null;

  const rows = ledger.data ?? [];
  const credited = rows.filter((row) => row.status === "credited" && !row.reversed_at);
  const coinTotal = credited
    .filter((row) => row.reward_type.toLowerCase().includes("coin"))
    .reduce((s, row) => s + Number(row.reward_value ?? 0), 0);
  const cashTotal = credited
    .filter((row) => !row.reward_type.toLowerCase().includes("coin"))
    .reduce((s, row) => s + Number(row.reward_value ?? 0), 0);

  return (
    <AppShell
      title={t("rewards")}
      onRefresh={() => Promise.all([ledger.refetch(), programs.refetch(), counts.refetch()])}
    >
      {!approved ? (
        <PendingApproval />
      ) : !allowed ? (
        <AccessDenied />
      ) : (
        <div className="space-y-6">
          <div className="bg-brand-gradient rounded-3xl p-6 text-primary-foreground shadow-brand">
            <p className="text-xs font-bold uppercase opacity-80">{t("rewardsTotal")}</p>
            <p className="num mt-2 text-3xl font-extrabold">{inr(cashTotal)}</p>
            {coinTotal > 0 && (
              <p className="num mt-1 text-sm font-bold opacity-90">
                + {coinTotal} {t("rewardCoins")}
              </p>
            )}
            <p className="mt-2 text-xs font-semibold opacity-80">{t("rewardsNote")}</p>
          </div>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-foreground">{t("activeBonuses")}</h2>
            {programs.isLoading && (
              <div className="flex justify-center py-8">
                <Loader2 className="size-6 animate-spin text-primary" />
              </div>
            )}
            {!programs.isLoading && (programs.data ?? []).length === 0 && (
              <PlaceholderPanel
                title={t("activeBonuses")}
                description={t("noActiveBonuses")}
                icon={Target}
              />
            )}
            {(programs.data ?? []).map((program) => {
              const condition = (program.condition ?? {}) as { count?: number; period?: string };
              const target =
                program.trigger_type === "count_threshold" ? Number(condition.count ?? 0) : 0;
              const period = condition.period === "monthly" ? "monthly" : "weekly";
              const done = target > 0 ? (counts.data?.[period] ?? 0) : 0;
              const pct = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;
              return (
                <div
                  key={program.id}
                  className="rounded-2xl border border-border bg-card p-4 shadow-card"
                >
                  <div className="flex items-start gap-3">
                    <span className="bg-primary-soft flex size-10 shrink-0 items-center justify-center rounded-2xl text-primary">
                      <Gift className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-foreground">{program.name}</p>
                      <p className="num text-xs font-semibold text-muted-foreground">
                        {rewardAmount(program.reward_type, program.reward_value, t("rewardCoins"))}
                      </p>
                    </div>
                  </div>
                  {target > 0 && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground">
                        <span>
                          {t("rewardProgress")} ·{" "}
                          {period === "monthly" ? t("rewardPeriodMonth") : t("rewardPeriodWeek")}
                        </span>
                        <span className="num">
                          {done}/{target}
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-foreground">{t("rewardHistory")}</h2>
            {ledger.isLoading && (
              <div className="flex justify-center py-8">
                <Loader2 className="size-6 animate-spin text-primary" />
              </div>
            )}
            {!ledger.isLoading && rows.length === 0 && (
              <PlaceholderPanel
                title={t("rewardHistory")}
                description={t("noRewards")}
                icon={Gift}
              />
            )}
            {rows.map((row) => {
              const reversed = Boolean(row.reversed_at) || row.status === "reversed";
              return (
                <div
                  key={row.id}
                  className={`flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-card ${
                    reversed ? "opacity-70" : ""
                  }`}
                >
                  <span
                    className={`flex size-10 shrink-0 items-center justify-center rounded-2xl ${
                      reversed
                        ? "bg-muted text-muted-foreground"
                        : "bg-primary-soft text-primary"
                    }`}
                  >
                    {reversed ? <Undo2 className="size-5" /> : <Gift className="size-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-foreground">
                      {row.program?.name ?? row.reward_type}
                    </p>
                    <p className="num truncate text-xs font-semibold text-muted-foreground">
                      {new Date(row.credited_at).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                      {reversed ? ` · ${t("rewardReversed")}` : ""}
                      {reversed && row.reversal_reason ? ` · ${row.reversal_reason}` : ""}
                    </p>
                  </div>
                  <p
                    className={`num shrink-0 text-sm font-extrabold ${
                      reversed ? "text-muted-foreground line-through" : "text-primary"
                    }`}
                  >
                    {rewardAmount(row.reward_type, row.reward_value, t("rewardCoins"))}
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