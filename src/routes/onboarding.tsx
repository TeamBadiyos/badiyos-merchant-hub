import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Loader2,
  MapPin,
  Store,
  UtensilsCrossed,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { DocumentUpload, type DocType } from "@/components/DocumentUpload";
import { LegalConsent } from "@/components/LegalConsent";
import { Wordmark } from "@/components/Wordmark";
import { LocationPicker } from "@/components/delivery/LocationPicker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { friendlyErrorMessage } from "@/lib/friendly-error";
import { hapticImpact, hapticNotify } from "@/lib/haptics";
import { useI18n, type Key } from "@/lib/i18n";
import { lookupRegionDefaults } from "@/lib/locale-config";
import { DAYS, hhmm } from "@/lib/schedule";
import {
  digitsOnly,
  upperAlnum,
  validateGstin,
  validateIfsc,
  validatePan,
  validatePincode,
} from "@/lib/validation";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Join badiyos — Merchant signup" },
      {
        name: "description",
        content:
          "Sign up your shop or restaurant on badiyos in 8 simple steps: business, timings, documents and agreement.",
      },
      { property: "og:title", content: "Join badiyos as a merchant" },
      { property: "og:description", content: "Register your shop or restaurant on badiyos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OnboardingPage,
});

const TOTAL = 8;
const region = lookupRegionDefaults();
type Errors = Record<string, string | null>;
type DayRow = { open_time: string; close_time: string; is_closed: boolean };
type Agreement = {
  id: string;
  template_type: string;
  title: string;
  body: string;
  status: string;
};

function OnboardingPage() {
  const { t, lang } = useI18n();
  const { merchant, ready, userId, refresh } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [mapOpen, setMapOpen] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [form, setForm] = useState({
    service_type: "" as "" | "store" | "food",
    owner_name: "",
    email: "",
    store_name: "",
    store_category_id: "",
    address: "",
    city: region.city,
    state: region.state,
    country: region.country,
    pincode: "",
    pan: "",
    bank_account_number: "",
    bank_ifsc: "",
    bank_account_holder_name: "",
    upi_id: "",
    gstin: "",
    fssai_number: "",
    fssai_expiry: "",
    udyam_number: "",
  });
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({
    lat: null,
    lng: null,
  });
  const [days, setDays] = useState<Record<number, DayRow>>(() =>
    Object.fromEntries(
      DAYS.map(({ day }) => [day, { open_time: "09:00", close_time: "21:00", is_closed: false }]),
    ),
  );

  useEffect(() => {
    if (ready && !userId) void navigate({ to: "/login", replace: true });
  }, [ready, userId, navigate]);

  useEffect(() => {
    if (ready && merchant && merchant.status !== "draft" && merchant.status !== "pending_review") {
      void navigate({ to: "/home", replace: true });
    }
  }, [ready, merchant, navigate]);

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (!merchant || hydrated) return;
    void supabase.auth.getUser().then(({ data }) => {
      const meta = (data.user?.user_metadata ?? {}) as Record<string, string>;
      setForm((p) => ({
        ...p,
        email: p.email || meta["contact_email"] || "",
        upi_id: p.upi_id || meta["upi_id"] || "",
      }));
    });
    setForm((p) => ({
      ...p,
      service_type: (merchant.service_type as "store" | "food" | null) ?? "",
      owner_name: merchant.owner_name ?? "",
      email: merchant.email ?? "",
      upi_id: merchant.upi_id ?? "",
      fssai_number: merchant.fssai_number ?? "",
      fssai_expiry: merchant.fssai_expiry ?? "",
      udyam_number: merchant.udyam_number ?? "",
      store_name: merchant.store_name ?? "",
      store_category_id: merchant.store_category_id ?? "",
      address: merchant.address ?? "",
      city: merchant.city ?? region.city,
      state: merchant.state ?? region.state,
      country: merchant.country ?? region.country,
      pincode: merchant.pincode ?? "",
      pan: merchant.pan ?? "",
      bank_account_number: merchant.bank_account_number ?? "",
      bank_ifsc: merchant.bank_ifsc ?? "",
      bank_account_holder_name: merchant.bank_account_holder_name ?? "",
      gstin: merchant.gstin ?? "",
    }));
    setCoords({ lat: merchant.latitude ?? null, lng: merchant.longitude ?? null });
    setStep(Math.min(Math.max(merchant.onboarding_step || 2, 2), TOTAL));
    setHydrated(true);
  }, [merchant, hydrated]);

  const categories = useQuery({
    queryKey: ["store-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_categories")
        .select("id, name, slug, segment_id")
        .eq("is_active", true)
        .order("rank", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const documents = useQuery({
    queryKey: ["merchant-documents", merchant?.id],
    enabled: Boolean(merchant?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("merchant_documents")
        .select("doc_type, file_url")
        .eq("merchant_id", merchant!.id);
      if (error) throw error;
      return data;
    },
  });

  const hours = useQuery({
    queryKey: ["signup-hours", merchant?.id],
    enabled: Boolean(merchant?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("merchant_store_hours")
        .select("*")
        .eq("merchant_id", merchant!.id);
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    if (!hours.data?.length) return;
    setDays((prev) => {
      const next = { ...prev };
      for (const h of hours.data) {
        next[h.day_of_week] = {
          is_closed: h.is_closed,
          open_time: hhmm(h.open_time) || "09:00",
          close_time: hhmm(h.close_time) || "21:00",
        };
      }
      return next;
    });
  }, [hours.data]);

  const agreements = useQuery({
    queryKey: ["my-agreements", merchant?.id],
    enabled: Boolean(merchant?.id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("app_my_agreements");
      if (error) throw error;
      return (data as Agreement[] | null) ?? [];
    },
  });

  if (!ready || !merchant) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  const isFood = form.service_type === "food";
  const agreementType = isFood ? "restaurant" : "store";
  const agreement = (agreements.data ?? []).find((a) => a.template_type === agreementType);
  const commissionPct = merchant.commission_pct ?? merchant.commission_value ?? null;
  const docUrl = (d: DocType) =>
    d === "shop_photo"
      ? merchant.shop_photo_url
      : ((documents.data ?? []).find((x) => x.doc_type === d)?.file_url ?? null);

  const set = (key: keyof typeof form) => (value: string) => {
    setForm((p) => ({ ...p, [key]: value }));
    setErrors((p) => ({ ...p, [key]: null }));
  };

  const goTo = (n: number) => {
    setStep(n);
    document.querySelector(".app-scroll")?.scrollTo({ top: 0 });
  };

  const save = async (patch: Record<string, unknown>, next: number) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("merchants")
        .update({ ...patch, onboarding_step: Math.max(next, merchant.onboarding_step ?? 1) })
        .eq("id", merchant.id);
      if (error) {
        console.error(error);
        toast.error(friendlyErrorMessage(error, lang));
        return false;
      }
      await refresh();
      goTo(fixing ? TOTAL : next);
      return true;
    } finally {
      setSaving(false);
    }
  };

  const recordDocument = async (docType: DocType, path: string) => {
    if (docType === "shop_photo") {
      const { error } = await supabase
        .from("merchants")
        .update({ shop_photo_url: path })
        .eq("id", merchant.id);
      if (error) throw error;
      await refresh();
      return;
    }
    const existing = (documents.data ?? []).some((d) => d.doc_type === docType);
    const { error } = existing
      ? await supabase
          .from("merchant_documents")
          .update({ file_url: path, uploaded_at: new Date().toISOString() })
          .eq("merchant_id", merchant.id)
          .eq("doc_type", docType)
      : await supabase
          .from("merchant_documents")
          .insert({ merchant_id: merchant.id, doc_type: docType, file_url: path });
    if (error) throw error;
    await documents.refetch();
  };

  const check = (next: Errors) => {
    setErrors(next);
    return !Object.values(next).some(Boolean);
  };

  // ---------- step submits ----------
  const submit2 = () => {
    if (!form.service_type) return;
    void save({ service_type: form.service_type }, 3);
  };

  const submit3 = async () => {
    const email = form.email.trim();
    if (
      !check({
        owner_name: form.owner_name.trim() ? null : t("required"),
        email: !email || /^\S+@\S+\.\S+$/.test(email) ? null : t("required"),
      })
    )
      return;
    await supabase.auth.updateUser({ data: { contact_email: email || null } });
    await save({ owner_name: form.owner_name.trim(), email: email || null }, 4);
  };

  const submit4 = async () => {
    const category = (categories.data ?? []).find((c) => c.id === form.store_category_id);
    if (
      !check({
        store_name: form.store_name.trim() ? null : t("required"),
        store_category_id: category ? null : t("required"),
        address: form.address.trim() ? null : t("required"),
        pincode: validatePincode(form.pincode),
      })
    )
      return;
    await save(
      {
        store_name: form.store_name.trim(),
        store_category_id: category!.id,
        segment_id: category!.segment_id,
        address: form.address.trim(),
        city: form.city,
        state: form.state,
        country: form.country,
        pincode: form.pincode,
        ...(coords.lat != null && coords.lng != null
          ? { latitude: coords.lat, longitude: coords.lng }
          : {}),
      },
      5,
    );
  };

  const submit5 = async () => {
    setSaving(true);
    try {
      for (const { day } of DAYS) {
        const v = days[day]!;
        const payload = {
          merchant_id: merchant.id,
          day_of_week: day,
          is_closed: v.is_closed,
          open_time: v.is_closed ? null : v.open_time,
          close_time: v.is_closed ? null : v.close_time,
        };
        const existing = hours.data?.find((h) => h.day_of_week === day);
        const { error } = existing
          ? await supabase.from("merchant_store_hours").update(payload).eq("id", existing.id)
          : await supabase.from("merchant_store_hours").insert(payload);
        if (error) {
          toast.error(friendlyErrorMessage(error, lang));
          return;
        }
      }
      await hours.refetch();
    } finally {
      setSaving(false);
    }
    await save({}, 6);
  };

  const submit6 = async () => {
    const gst = form.gstin.trim();
    const upi = form.upi_id.trim();
    const docsOk =
      Boolean(docUrl("pan")) &&
      Boolean(merchant.shop_photo_url) &&
      (!isFood || Boolean(docUrl("fssai")));
    if (
      !check({
        pan: validatePan(form.pan),
        bank_account_number: /^\d{9,18}$/.test(form.bank_account_number)
          ? null
          : t("accountNumberInvalid"),
        bank_ifsc: validateIfsc(form.bank_ifsc),
        bank_account_holder_name: form.bank_account_holder_name.trim() ? null : t("required"),
        upi_id: !upi || /^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(upi) ? null : t("upiInvalid"),
        fssai_number: !isFood || /^\d{14}$/.test(form.fssai_number) ? null : t("fssaiInvalid"),
        fssai_expiry: !isFood || form.fssai_expiry ? null : t("required"),
        gstin: gst ? validateGstin(gst) : null,
        docs: docsOk ? null : t("docRequired"),
      })
    )
      return;
    await save(
      {
        pan: form.pan,
        bank_account_number: form.bank_account_number,
        bank_ifsc: form.bank_ifsc,
        bank_account_holder_name: form.bank_account_holder_name.trim(),
        upi_id: upi || null,
        fssai_number: isFood ? form.fssai_number : form.fssai_number || null,
        fssai_expiry: form.fssai_expiry || null,
        udyam_number: form.udyam_number.trim() || null,
        is_gst_registered: Boolean(gst),
        gstin: gst || null,
      },
      7,
    );
    const { error } = await supabase.rpc("app_merchant_issue_signup_agreement");
    if (error) console.error("[onboarding] agreement issue failed", error.message);
    void agreements.refetch();
  };

  const submitApplication = async () => {
    if (merchant.status === "pending_review") {
      setFixing(false);
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("merchant_submit_application");
      if (error) {
        toast.error(friendlyErrorMessage(error, lang));
        return;
      }
      hapticNotify("success");
      setFixing(false);
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  // ---------- status screen (submitted, or query raised by badiyos) ----------
  const queryNotes = merchant.query_notes?.trim() || "";
  const hasQuery = merchant.status === "draft" && Boolean(merchant.awaiting_reupload || queryNotes);
  if ((merchant.status === "pending_review" || hasQuery) && !fixing) {
    const queried = merchant.query_doc_types ?? [];
    const fixStep = queried.includes("shop_photo") && queried.length === 1
      ? 4
      : queried.length > 0 || /bank|ifsc|account|pan|fssai|खात|बँक/i.test(queryNotes)
        ? 6
        : 4;
    return (
      <StatusScreen
        status={hasQuery ? "query" : "review"}
        queryNotes={queryNotes}
        agreementPending={agreement?.status === "sent"}
        onFix={() => {
          setFixing(true);
          goTo(fixStep);
        }}
        onSign={() => {
          setFixing(true);
          goTo(7);
        }}
      />
    );
  }

  const footer = (onNext: () => void, label: Key = "saveContinue", disabled = false) => (
    <div className="flex gap-2 pt-2">
      {step > 2 && (
        <Button
          variant="outline"
          onClick={() => goTo(step - 1)}
          className="h-12 shrink-0 rounded-2xl px-4 text-sm font-bold"
        >
          <ArrowLeft className="size-5" />
          {t("back")}
        </Button>
      )}
      <Button
        disabled={saving || disabled}
        onClick={() => {
          hapticImpact("light");
          onNext();
        }}
        className="h-12 min-w-0 flex-1 rounded-2xl px-4 text-sm font-bold sm:text-base"
      >
        {saving && <Loader2 className="size-5 animate-spin" />}
        <span className="truncate">{t(label)}</span>
      </Button>
    </div>
  );

  const field = (
    key: keyof typeof form,
    label: string,
    extra?: { placeholder?: string; numeric?: boolean; transform?: (v: string) => string; max?: number },
  ) => (
    <div className="space-y-2">
      <Label htmlFor={key} className="text-sm font-bold">
        {label}
      </Label>
      <Input
        id={key}
        value={form[key]}
        placeholder={extra?.placeholder}
        inputMode={extra?.numeric ? "numeric" : undefined}
        maxLength={extra?.max}
        onChange={(e) => set(key)(extra?.transform ? extra.transform(e.target.value) : e.target.value)}
        className={`h-12 rounded-2xl text-base font-semibold ${extra?.numeric ? "num" : ""}`}
      />
      {errors[key] && <p className="text-xs font-bold text-destructive">{errors[key]}</p>}
    </div>
  );

  const titles: Record<number, Key> = {
    1: "su1Title",
    2: "su2Title",
    3: "su3Title",
    4: "su4Title",
    5: "su5Title",
    6: "su6Title",
    7: "su7Title",
    8: "su8Title",
  };

  return (
    <div className="app-scroll safe-top safe-bottom h-full bg-background pb-12">
      <header className="sticky top-0 z-10 border-b border-border bg-card px-4 py-4">
        <div className="mx-auto w-full max-w-[520px]">
          <div className="flex items-center justify-between">
            <Wordmark className="h-6" />
            <span className="num text-xs font-bold text-muted-foreground">
              {t("suStep")} {step} {t("suOf")} {TOTAL}
            </span>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${(step / TOTAL) * 100}%` }}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[520px] px-4 pt-5">
        {fixing && queryNotes && (
          <div className="mb-4 flex items-start gap-2 rounded-2xl border border-primary/30 bg-primary-soft p-4 text-sm font-bold text-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-primary" />
            {queryNotes}
          </div>
        )}
        <h1 className="text-xl font-extrabold text-foreground">{t(titles[step]!)}</h1>
        <div className="mt-4 space-y-4 rounded-2xl border border-border bg-card p-4 shadow-card">
          {step === 1 && (
            <>
              <Card>
                <p className="num text-2xl font-extrabold text-foreground">+91 {merchant.phone}</p>
                <p className="mt-1 flex items-center gap-1 text-xs font-bold text-primary">
                  <CheckCircle2 className="size-4" /> {t("su1Sub")}
                </p>
              </Card>
              {footer(() => goTo(2))}
            </>
          )}

          {step === 2 && (
            <>
              {(
                [
                  ["store", Store, "suStore", "suStoreSub"],
                  ["food", UtensilsCrossed, "suFood", "suFoodSub"],
                ] as const
              ).map(([value, Icon, title, sub]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, service_type: value }))}
                  className={`flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left transition-colors ${
                    form.service_type === value ? "border-primary bg-primary-soft" : "border-border"
                  }`}
                >
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-card text-primary shadow-card">
                    <Icon className="size-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-extrabold text-foreground">{t(title)}</span>
                    <span className="block text-xs text-muted-foreground">{t(sub)}</span>
                  </span>
                  {form.service_type === value && <Check className="size-5 text-primary" />}
                </button>
              ))}
              {footer(submit2, "saveContinue", !form.service_type)}
            </>
          )}

          {step === 3 && (
            <>
              {field("owner_name", t("ownerName"))}
              {field("email", t("email"), { placeholder: "name@example.com" })}
              {footer(() => void submit3())}
            </>
          )}

          {step === 4 && (
            <>
              {field("store_name", t("businessName"))}
              <div className="space-y-2">
                <Label className="text-sm font-bold">{t("storeType")}</Label>
                <Select value={form.store_category_id} onValueChange={set("store_category_id")}>
                  <SelectTrigger className="h-12 rounded-2xl text-sm font-semibold">
                    <SelectValue placeholder={t("chooseCategory")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(categories.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors["store_category_id"] && (
                  <p className="text-xs font-bold text-destructive">{errors["store_category_id"]}</p>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setMapOpen(true)}
                className="h-12 w-full justify-start rounded-2xl font-bold"
              >
                <MapPin className="size-5 text-primary" />
                {coords.lat != null ? t("changeOnMap") : t("pickOnMap")}
              </Button>
              {field("address", t("addressLine"), { placeholder: "Shop no, building, road, area" })}
              <div className="grid grid-cols-2 gap-3">
                {field("city", t("city"))}
                {field("pincode", t("pincode"), {
                  numeric: true,
                  max: 6,
                  transform: (v) => digitsOnly(v).slice(0, 6),
                })}
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">{t("contactPhone")}</Label>
                <Input value={`+91 ${merchant.phone}`} disabled className="num h-12 rounded-2xl" />
              </div>
              <DocumentUpload
                merchantId={merchant.id}
                docType="shop_photo"
                label={t("shopPhoto")}
                existingUrl={merchant.shop_photo_url}
                onUploaded={(path) => recordDocument("shop_photo", path)}
              />
              {footer(() => void submit4())}
              <Dialog open={mapOpen} onOpenChange={setMapOpen}>
                <DialogContent className="left-0 top-0 flex h-[100dvh] max-h-none w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-3 rounded-none border-0 p-4 pb-6 sm:left-1/2 sm:top-1/2 sm:h-[90dvh] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:border">
                  <DialogHeader className="shrink-0 pr-8 text-left">
                    <DialogTitle className="text-base font-extrabold">{t("mapPickTitle")}</DialogTitle>
                  </DialogHeader>
                  <LocationPicker
                    lat={coords.lat}
                    lng={coords.lng}
                    onChange={(lat, lng) => setCoords({ lat, lng })}
                    onAddress={(address) => setForm((p) => ({ ...p, address }))}
                    className="flex min-h-0 flex-1 flex-col"
                    mapClassName="min-h-0 flex-1"
                  />
                  <Button
                    disabled={coords.lat == null}
                    onClick={() => setMapOpen(false)}
                    className="h-12 w-full shrink-0 rounded-2xl text-base font-bold"
                  >
                    {t("useThisLocation")}
                  </Button>
                </DialogContent>
              </Dialog>
            </>
          )}

          {step === 5 && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  const mon = days[1]!;
                  setDays(Object.fromEntries(DAYS.map(({ day }) => [day, { ...mon }])));
                }}
                className="h-11 w-full rounded-2xl text-sm font-bold"
              >
                {t("copyMonday")}
              </Button>
              <ul className="space-y-2">
                {DAYS.map(({ day, key }) => {
                  const v = days[day]!;
                  const upd = (patch: Partial<DayRow>) =>
                    setDays((p) => ({ ...p, [day]: { ...p[day]!, ...patch } }));
                  return (
                    <li key={day} className="rounded-2xl border border-border p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-extrabold text-foreground">{t(key)}</span>
                        <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                          {t("closedDay")}
                          <Switch checked={v.is_closed} onCheckedChange={(c) => upd({ is_closed: c })} />
                        </label>
                      </div>
                      {!v.is_closed && (
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <Input
                            type="time"
                            aria-label={t("openTime")}
                            value={v.open_time}
                            onChange={(e) => upd({ open_time: e.target.value })}
                            className="num h-11 rounded-xl"
                          />
                          <Input
                            type="time"
                            aria-label={t("closeTime")}
                            value={v.close_time}
                            onChange={(e) => upd({ close_time: e.target.value })}
                            className="num h-11 rounded-xl"
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {footer(() => void submit5())}
            </>
          )}

          {step === 6 && (
            <>
              {field("pan", t("panNumber"), {
                max: 10,
                placeholder: "ABCDE1234F",
                transform: (v) => upperAlnum(v).slice(0, 10),
              })}
              <DocumentUpload
                merchantId={merchant.id}
                docType="pan"
                label={t("docPan")}
                existingUrl={docUrl("pan")}
                onUploaded={(p) => recordDocument("pan", p)}
              />
              <p className="pt-2 text-sm font-extrabold text-foreground">{t("bankDetails")}</p>
              {field("bank_account_holder_name", t("accountHolder"))}
              {field("bank_account_number", t("accountNumber"), {
                numeric: true,
                max: 18,
                transform: (v) => digitsOnly(v).slice(0, 18),
              })}
              {field("bank_ifsc", t("ifsc"), {
                max: 11,
                placeholder: "SBIN0001234",
                transform: (v) => upperAlnum(v).slice(0, 11),
              })}
              {field("upi_id", t("upiId"), { placeholder: "name@upi" })}
              <DocumentUpload
                merchantId={merchant.id}
                docType="shop_photo"
                label={t("shopPhoto")}
                existingUrl={merchant.shop_photo_url}
                onUploaded={(p) => recordDocument("shop_photo", p)}
              />
              {isFood && (
                <>
                  <p className="pt-2 text-sm font-extrabold text-foreground">{t("fssai")}</p>
                  {field("fssai_number", t("fssaiNumber"), {
                    numeric: true,
                    max: 14,
                    placeholder: "12345678901234",
                    transform: (v) => digitsOnly(v).slice(0, 14),
                  })}
                  <div className="space-y-1.5">
                    <Label className="text-sm font-bold">{t("fssaiExpiry")}</Label>
                    <Input
                      type="date"
                      value={form.fssai_expiry}
                      onChange={(e) => set("fssai_expiry")(e.target.value)}
                      className="num h-12 rounded-xl"
                    />
                    {errors["fssai_expiry"] && (
                      <p className="text-xs font-bold text-destructive">{errors["fssai_expiry"]}</p>
                    )}
                  </div>
                  <DocumentUpload
                    merchantId={merchant.id}
                    docType="fssai"
                    label={t("fssaiCertificate")}
                    existingUrl={docUrl("fssai")}
                    onUploaded={(p) => recordDocument("fssai", p)}
                  />
                </>
              )}
              <p className="pt-2 text-sm font-extrabold text-foreground">{t("udyamShopAct")}</p>
              {field("udyam_number", t("udyamNumber"), {
                max: 19,
                placeholder: "UDYAM-MH-00-0000000",
                transform: (v) => v.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 19),
              })}
              <DocumentUpload
                merchantId={merchant.id}
                docType="udyam"
                label={t("udyamShopAct")}
                optional
                existingUrl={docUrl("udyam") ?? docUrl("shop_license")}
                onUploaded={(p) => recordDocument("udyam", p)}
              />
              {field("gstin", t("gstinOptional"), {
                max: 15,
                placeholder: "27ABCDE1234F1Z5",
                transform: (v) => upperAlnum(v).slice(0, 15),
              })}
              {form.gstin.length === 15 && (
                <DocumentUpload
                  merchantId={merchant.id}
                  docType="gst_certificate"
                  label={t("docGst")}
                  optional
                  existingUrl={docUrl("gst_certificate")}
                  onUploaded={(p) => recordDocument("gst_certificate", p)}
                />
              )}
              {errors["docs"] && <p className="text-xs font-bold text-destructive">{errors["docs"]}</p>}
              {footer(() => void submit6())}
            </>
          )}

          {step === 7 && (
            <AgreementStep
              agreement={agreement}
              commissionPct={commissionPct}
              onSigned={() => void agreements.refetch()}
              footer={footer(() => void save({}, 8))}
            />
          )}

          {step === 8 && (
            <>
              <dl className="space-y-2 text-sm">
                {[
                  [t("su2Title"), form.service_type === "food" ? t("suFood") : t("suStore")],
                  [t("businessName"), form.store_name],
                  [t("ownerName"), form.owner_name],
                  [t("addressLine"), [form.address, form.pincode].filter(Boolean).join(", ")],
                  [t("panNumber"), form.pan],
                  [t("ifsc"), form.bank_ifsc],
                  [t("su7Title"), agreement?.status === "accepted" ? t("suSigned") : "—"],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4 border-b border-border pb-2">
                    <dt className="font-semibold text-muted-foreground">{label}</dt>
                    <dd className="num text-right font-bold text-foreground">{value || "—"}</dd>
                  </div>
                ))}
              </dl>
              {footer(() => void submitApplication(), "suSubmit")}
              <LegalConsent />
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-border p-4">{children}</div>;
}

function AgreementStep({
  agreement,
  commissionPct,
  onSigned,
  footer,
}: {
  agreement: Agreement | undefined;
  commissionPct: number | null;
  onSigned: () => void;
  footer: ReactNode;
}) {
  const { t, lang } = useI18n();
  const [readToEnd, setReadToEnd] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (el && el.scrollHeight <= el.clientHeight + 8) setReadToEnd(true);
  }, [agreement?.id]);

  const requestOtp = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("app_agreement_request_otp", { _agreement_id: agreement!.id });
    setBusy(false);
    if (error) {
      toast.error(friendlyErrorMessage(error, lang));
      return;
    }
    setOtpSent(true);
    toast.success(t("suOtpSent"));
  };
  const accept = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("app_agreement_accept", {
      _agreement_id: agreement!.id,
      _otp: otp,
      _device: navigator.userAgent,
    });
    setBusy(false);
    if (error) {
      toast.error(friendlyErrorMessage(error, lang));
      return;
    }
    hapticNotify("success");
    toast.success(t("suSigned"));
    onSigned();
  };

  return (
    <>
      <div className="rounded-2xl border-2 border-primary bg-primary-soft p-4 text-center">
        <p className="text-xs font-bold text-muted-foreground">{t("suCommissionBox")}</p>
        <p className="num text-3xl font-extrabold text-primary">
          {commissionPct != null ? `${commissionPct}%` : "—"}
        </p>
        <p className="text-[11px] font-semibold text-muted-foreground">+ GST</p>
      </div>

      {!agreement ? (
        <p className="text-sm text-muted-foreground">{t("suAgreementLater")}</p>
      ) : agreement.status === "accepted" ? (
        <p className="flex items-center gap-2 text-sm font-bold text-primary">
          <CheckCircle2 className="size-5" /> {t("suSigned")}
        </p>
      ) : (
        <>
          <div
            ref={boxRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setReadToEnd(true);
            }}
            className="selectable max-h-72 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-border p-4 text-sm leading-relaxed text-foreground"
          >
            {agreement.body.replace(/^#+\s*/gm, "").replace(/\*\*/g, "")}
          </div>
          {!readToEnd && (
            <p className="text-xs font-bold text-muted-foreground">{t("suScrollToEnd")}</p>
          )}
          {!otpSent ? (
            <Button
              disabled={!readToEnd || busy}
              onClick={() => void requestOtp()}
              className="h-12 w-full rounded-2xl font-bold"
            >
              {busy && <Loader2 className="size-5 animate-spin" />}
              {t("suIAgree")}
            </Button>
          ) : (
            <div className="space-y-2">
              <Label className="text-sm font-bold">{t("suEnterOtp")}</Label>
              <div className="flex gap-2">
                <Input
                  value={otp}
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(e) => setOtp(digitsOnly(e.target.value).slice(0, 6))}
                  className="num h-12 flex-1 rounded-2xl text-center text-lg font-bold tracking-widest"
                />
                <Button
                  disabled={otp.length < 4 || busy}
                  onClick={() => void accept()}
                  className="h-12 rounded-2xl px-5 font-bold"
                >
                  {busy && <Loader2 className="size-5 animate-spin" />}
                  {t("suSign")}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      {(!agreement || agreement.status === "accepted") && footer}
    </>
  );
}

function StatusScreen({
  status,
  queryNotes,
  agreementPending,
  onFix,
  onSign,
}: {
  status: "review" | "query";
  queryNotes: string;
  agreementPending: boolean;
  onFix: () => void;
  onSign: () => void;
}) {
  const { t } = useI18n();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const stages: Key[] = ["stSubmitted", "stReview", "stApproved", "stAddItems", "stLive"];
  const current = 1;
  return (
    <div className="app-scroll safe-top safe-bottom h-full bg-background px-4 pb-12">
      <div className="mx-auto w-full max-w-[520px] pt-8">
        <Wordmark className="h-6" />
        <h1 className="mt-6 text-2xl font-extrabold text-foreground">{t("su8Title")}</h1>

        {status === "query" && (
          <div className="mt-5 rounded-2xl border border-primary/30 bg-primary-soft p-4">
            <p className="flex items-center gap-2 text-xs font-extrabold text-accent-foreground">
              <AlertTriangle className="size-4" /> {t("queryFromTeam")}
            </p>
            <p className="mt-2 text-sm font-bold text-foreground">{queryNotes || "—"}</p>
            <Button onClick={onFix} className="mt-3 h-11 w-full rounded-2xl font-bold">
              {t("fixNow")}
            </Button>
          </div>
        )}

        <ol className="mt-6 space-y-0 rounded-2xl border border-border bg-card p-4 shadow-card">
          {stages.map((key, i) => {
            const done = i < current;
            const active = i === current;
            return (
              <li key={key} className="flex items-center gap-3 py-2.5">
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
                    done
                      ? "bg-primary text-primary-foreground"
                      : active
                        ? "border-2 border-primary text-primary"
                        : "border border-border text-muted-foreground"
                  }`}
                >
                  {done ? <Check className="size-4" /> : i + 1}
                </span>
                <span
                  className={`text-sm font-bold ${done || active ? "text-foreground" : "text-muted-foreground"}`}
                >
                  {t(key)}
                </span>
              </li>
            );
          })}
        </ol>

        {agreementPending && (
          <Button variant="outline" onClick={onSign} className="mt-4 h-12 w-full rounded-2xl font-bold">
            {t("signAgreement")}
          </Button>
        )}
        <button
          type="button"
          onClick={() => void signOut().then(() => navigate({ to: "/login", replace: true }))}
          className="mt-6 w-full text-center text-xs font-bold text-muted-foreground underline"
        >
          {t("logout")}
        </button>
      </div>
    </div>
  );
}
