import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarOff, Clock, CreditCard, Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { PendingApproval } from "@/components/GateNotice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { inr } from "@/lib/order-status";
import { DAYS, hhmm, todayIso, type ScheduleOverride, type StoreHour } from "@/lib/schedule";
import { useRequireAuth } from "@/lib/use-require-auth";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Store timings & billing plan — badiyos Merchant Portal" },
      {
        name: "description",
        content:
          "Set your weekly shop timings, mark holidays and review your badiyos subscription plan and invoices.",
      },
      { property: "og:title", content: "Store timings & billing plan — badiyos" },
      {
        property: "og:description",
        content: "Weekly open/close hours, closed dates and subscription invoices.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

type DayForm = { is_closed: boolean; open_time: string; close_time: string };

function SettingsPage() {
  const { t } = useI18n();
  const merchant = useRequireAuth();
  const queryClient = useQueryClient();
  const merchantId = merchant?.id;

  const [form, setForm] = useState<Record<number, DayForm>>({});
  const [overrideDate, setOverrideDate] = useState(todayIso());
  const [overrideNote, setOverrideNote] = useState("");

  const hours = useQuery({
    queryKey: ["store-hours", merchantId],
    enabled: Boolean(merchantId),
    queryFn: async () => {
      const { data, error } = await supabase.from("merchant_store_hours").select("*");
      if (error) throw error;
      return (data ?? []) as StoreHour[];
    },
  });

  const overrides = useQuery({
    queryKey: ["schedule-overrides", merchantId],
    enabled: Boolean(merchantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("merchant_schedule_overrides")
        .select("*")
        .order("override_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ScheduleOverride[];
    },
  });

  const invoices = useQuery({
    queryKey: ["subscription-invoices", merchantId],
    enabled: Boolean(merchantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("merchant_subscription_invoices")
        .select("*")
        .order("billing_month", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const tier = useQuery({
    queryKey: ["fee-tier", merchant?.fee_tier_id],
    enabled: Boolean(merchant?.fee_tier_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("merchant_fee_tiers")
        .select("*")
        .eq("id", merchant!.fee_tier_id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!hours.data) return;
    const next: Record<number, DayForm> = {};
    for (const { day } of DAYS) {
      const row = hours.data.find((h) => h.day_of_week === day);
      next[day] = {
        is_closed: row?.is_closed ?? false,
        open_time: hhmm(row?.open_time ?? null) || "09:00",
        close_time: hhmm(row?.close_time ?? null) || "21:00",
      };
    }
    setForm(next);
  }, [hours.data]);

  const saveHours = useMutation({
    mutationFn: async () => {
      for (const { day } of DAYS) {
        const value = form[day];
        if (!value) continue;
        const existing = hours.data?.find((h) => h.day_of_week === day);
        const payload = {
          merchant_id: merchantId!,
          day_of_week: day,
          is_closed: value.is_closed,
          open_time: value.is_closed ? null : value.open_time,
          close_time: value.is_closed ? null : value.close_time,
        };
        const { error } = existing
          ? await supabase.from("merchant_store_hours").update(payload).eq("id", existing.id)
          : await supabase.from("merchant_store_hours").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(t("saved"));
      void queryClient.invalidateQueries({ queryKey: ["store-hours"] });
    },
    onError: () => toast.error("Could not save the timings."),
  });

  const addOverride = useMutation({
    mutationFn: async (date: string) => {
      const { error } = await supabase.from("merchant_schedule_overrides").insert({
        merchant_id: merchantId!,
        override_date: date,
        is_closed: true,
        note: overrideNote.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("saved"));
      setOverrideNote("");
      void queryClient.invalidateQueries({ queryKey: ["schedule-overrides"] });
    },
    onError: () => toast.error("Could not add that date."),
  });

  const removeOverride = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("merchant_schedule_overrides").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["schedule-overrides"] }),
    onError: () => toast.error("Could not remove that date. Ask badiyos support to clear it."),
  });

  if (!merchant) return null;
  if (merchant.status !== "approved") {
    return (
      <AppShell title={t("settings")}>
        <PendingApproval />
      </AppShell>
    );
  }

  return (
    <AppShell title={t("settings")}>
      <div className="space-y-4">
        <section className="rounded-3xl border border-border bg-card p-5 shadow-card">
          <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
            <Clock className="size-5 text-primary" />
            {t("storeSchedule")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("storeScheduleSub")}</p>

          {hours.isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="size-5 animate-spin text-primary" />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {DAYS.map(({ day, key }) => {
                const value = form[day];
                if (!value) return null;
                return (
                  <div key={day} className="rounded-2xl bg-muted/60 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-foreground">{t(key)}</p>
                      <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                        {t("closedDay")}
                        <Switch
                          checked={value.is_closed}
                          onCheckedChange={(checked) =>
                            setForm((prev) => ({ ...prev, [day]: { ...value, is_closed: checked } }))
                          }
                          aria-label={`${t(key)} ${t("closedDay")}`}
                        />
                      </label>
                    </div>
                    {!value.is_closed && (
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-[11px] font-semibold text-muted-foreground">
                            {t("openTime")}
                          </Label>
                          <Input
                            type="time"
                            value={value.open_time}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                [day]: { ...value, open_time: e.target.value },
                              }))
                            }
                            className="num mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] font-semibold text-muted-foreground">
                            {t("closeTime")}
                          </Label>
                          <Input
                            type="time"
                            value={value.close_time}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                [day]: { ...value, close_time: e.target.value },
                              }))
                            }
                            className="num mt-1"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <Button
                className="w-full"
                size="lg"
                disabled={saveHours.isPending}
                onClick={() => saveHours.mutate()}
              >
                {saveHours.isPending && <Loader2 className="size-4 animate-spin" />}
                {t("saveSchedule")}
              </Button>
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-border bg-card p-5 shadow-card">
          <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
            <CalendarOff className="size-5 text-primary" />
            {t("overrides")}
          </h2>

          <div className="mt-4 space-y-3">
            <div>
              <Label className="text-[11px] font-semibold text-muted-foreground">
                {t("overrideDate")}
              </Label>
              <Input
                type="date"
                value={overrideDate}
                onChange={(e) => setOverrideDate(e.target.value)}
                className="num mt-1"
              />
            </div>
            <div>
              <Label className="text-[11px] font-semibold text-muted-foreground">
                {t("overrideReason")}
              </Label>
              <Input
                value={overrideNote}
                onChange={(e) => setOverrideNote(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                disabled={addOverride.isPending}
                onClick={() => addOverride.mutate(overrideDate)}
              >
                <Plus className="size-4" />
                {t("addOverride")}
              </Button>
              <Button
                variant="outline"
                disabled={addOverride.isPending}
                onClick={() => addOverride.mutate(todayIso())}
              >
                {t("closeToday")}
              </Button>
            </div>
          </div>

          <ul className="mt-4 space-y-2">
            {(overrides.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noOverrides")}</p>
            ) : (
              (overrides.data ?? []).map((o) => (
                <li
                  key={o.id}
                  className="flex items-center gap-3 rounded-xl bg-muted/60 px-4 py-3 text-sm"
                >
                  <span className="num flex-1 font-bold text-foreground">
                    {o.override_date}
                    {o.note ? <span className="font-normal text-muted-foreground"> — {o.note}</span> : null}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-destructive"
                    aria-label={t("remove")}
                    onClick={() => removeOverride.mutate(o.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="rounded-3xl border border-border bg-card p-5 shadow-card">
          <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
            <CreditCard className="size-5 text-primary" />
            {t("billingPlan")}
          </h2>

          {tier.data ? (
            <div className="mt-4 flex items-center justify-between rounded-2xl bg-primary-soft px-4 py-4">
              <div>
                <p className="text-[11px] font-bold text-muted-foreground">{t("currentPlan")}</p>
                <p className="text-base font-extrabold text-accent-foreground">{tier.data.name}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-bold text-muted-foreground">{t("monthlyFee")}</p>
                <p className="num text-base font-extrabold text-accent-foreground">
                  {inr(tier.data.monthly_fee)}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">{t("noPlan")}</p>
          )}

          <h3 className="mt-6 text-sm font-bold text-foreground">{t("planInvoices")}</h3>
          <ul className="mt-3 space-y-2">
            {(invoices.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noPlanInvoices")}</p>
            ) : (
              (invoices.data ?? []).map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-center justify-between rounded-xl bg-muted/60 px-4 py-3"
                >
                  <div>
                    <p className="num text-sm font-bold text-foreground">
                      {new Date(inv.billing_month).toLocaleDateString("en-IN", {
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                    <p className="num text-xs text-muted-foreground">{inr(inv.amount)}</p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                      inv.status === "paid"
                        ? "bg-primary/10 text-primary"
                        : inv.status === "overdue"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {inv.status === "paid"
                      ? t("statusPaid")
                      : inv.status === "overdue"
                        ? t("statusOverdue")
                        : t("statusPending")}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
