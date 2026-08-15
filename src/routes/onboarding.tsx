import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Building2,
  CheckCircle2,
  FileText,
  Loader2,
  MapPin,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { DocumentUpload, type DocType } from "@/components/DocumentUpload";
import { Wordmark } from "@/components/Wordmark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { verifyGstin } from "@/lib/gstin.functions";
import { useI18n } from "@/lib/i18n";
import { lookupRegionDefaults } from "@/lib/locale-config";
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
      { title: "Shop onboarding — badiyos Merchant Portal" },
      {
        name: "description",
        content:
          "Complete your badiyos shop profile: GST or business details, category, address, documents and bank details.",
      },
      { property: "og:title", content: "Shop onboarding — badiyos" },
      {
        property: "og:description",
        content: "Register your shop on badiyos in a few guided steps.",
      },
    ],
  }),
  component: OnboardingPage,
});

const TOTAL_STEPS = 4;
const region = lookupRegionDefaults();

type Errors = Record<string, string | null>;

function OnboardingPage() {
  const { t } = useI18n();
  const { merchant, ready, userId, refresh } = useAuth();
  const navigate = useNavigate();
  const verifyGstinFn = useServerFn(verifyGstin);

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [gstChoice, setGstChoice] = useState<boolean | null>(null);
  const [gstin, setGstin] = useState("");
  const [gstStatus, setGstStatus] = useState<string | null>(null);
  const [gstLookupDone, setGstLookupDone] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [form, setForm] = useState({
    store_name: "",
    owner_name: "",
    gst_legal_name: "",
    address: "",
    city: region.city,
    state: region.state,
    country: region.country,
    pincode: "",
    store_category_id: "",
    pan: "",
    bank_account_number: "",
    bank_ifsc: "",
    bank_account_holder_name: "",
  });

  useEffect(() => {
    if (ready && !userId) void navigate({ to: "/login", replace: true });
  }, [ready, userId, navigate]);

  useEffect(() => {
    if (ready && merchant && merchant.status !== "draft") {
      void navigate({ to: "/home", replace: true });
    }
  }, [ready, merchant, navigate]);

  // Hydrate the form from the saved draft exactly once per merchant load.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (!merchant || hydrated) return;
    setForm((prev) => ({
      ...prev,
      store_name: merchant.store_name ?? "",
      owner_name: merchant.owner_name ?? "",
      gst_legal_name: merchant.gst_legal_name ?? "",
      address: merchant.address ?? "",
      city: merchant.city ?? region.city,
      state: merchant.state ?? region.state,
      country: merchant.country ?? region.country,
      pincode: merchant.pincode ?? "",
      store_category_id: merchant.store_category_id ?? "",
      pan: merchant.pan ?? "",
      bank_account_number: merchant.bank_account_number ?? "",
      bank_ifsc: merchant.bank_ifsc ?? "",
      bank_account_holder_name: merchant.bank_account_holder_name ?? "",
    }));
    setGstChoice(merchant.is_gst_registered);
    setGstin(merchant.gstin ?? "");
    setGstStatus(merchant.gst_status ?? null);
    setGstLookupDone(Boolean(merchant.gstin));
    setStep(Math.min(Math.max(merchant.onboarding_step || 1, 1), TOTAL_STEPS));
    setHydrated(true);
  }, [merchant, hydrated]);

  const categories = useQuery({
    queryKey: ["store-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_categories")
        .select("id, name, segment_id")
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

  if (!ready || !merchant) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  const set = (key: keyof typeof form) => (value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: null }));
  };

  const saveDraft = async (patch: Record<string, unknown>, nextStep: number) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("merchants")
        .update({ ...patch, onboarding_step: nextStep })
        .eq("id", merchant.id);
      if (error) {
        console.error(error);
        toast.error("Could not save your details. Please try again.");
        return false;
      }
      await refresh();
      setStep(nextStep);
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
      if (error) console.error(error);
      await refresh();
      return;
    }
    const { error } = await supabase
      .from("merchant_documents")
      .insert({ merchant_id: merchant.id, doc_type: docType, file_url: path });
    if (error) console.error(error);
    await documents.refetch();
  };

  const uploadedTypes = new Set((documents.data ?? []).map((d) => d.doc_type));

  const handleGstinVerify = async () => {
    const err = validateGstin(gstin);
    setErrors((prev) => ({ ...prev, gstin: err }));
    if (err) return;

    setVerifying(true);
    try {
      const result = await verifyGstinFn({ data: { gstin } });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setForm((prev) => ({
        ...prev,
        gst_legal_name: result.data.legal_name || prev.gst_legal_name,
        store_name: prev.store_name || result.data.legal_name || "",
        address: result.data.address || prev.address,
        city: result.data.city || prev.city,
        pincode: result.data.pincode || prev.pincode,
      }));
      setGstStatus(result.data.status ?? null);
      setGstLookupDone(true);
      toast.success("GSTIN verified");
    } catch (error) {
      console.error(error);
      toast.error("Could not reach the GST service. Please try again.");
    } finally {
      setVerifying(false);
    }
  };

  const submitStep1 = async () => {
    if (gstChoice === null) return;
    const next: Errors = {};
    if (gstChoice) {
      next["gstin"] = validateGstin(gstin);
      if (!gstLookupDone) next["gstin"] = next["gstin"] ?? "Please verify your GSTIN first";
      if (!form.gst_legal_name.trim()) next["gst_legal_name"] = t("required");
    } else {
      if (!form.store_name.trim()) next["store_name"] = t("required");
      if (!form.owner_name.trim()) next["owner_name"] = t("required");
    }
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    await saveDraft(
      gstChoice
        ? {
            is_gst_registered: true,
            gstin,
            gst_legal_name: form.gst_legal_name,
            gst_status: gstStatus,
            store_name: form.store_name || form.gst_legal_name,
            owner_name: form.owner_name || null,
            address: form.address || null,
            city: form.city,
            pincode: form.pincode || null,
          }
        : {
            is_gst_registered: false,
            gstin: null,
            gst_legal_name: null,
            gst_status: null,
            store_name: form.store_name,
            owner_name: form.owner_name,
          },
      2,
    );
  };

  const submitStep2 = async () => {
    const category = (categories.data ?? []).find((c) => c.id === form.store_category_id);
    const next: Errors = {
      store_category_id: category ? null : t("required"),
      address: form.address.trim() ? null : t("required"),
      pincode: validatePincode(form.pincode),
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    await saveDraft(
      {
        store_category_id: category!.id,
        segment_id: category!.segment_id,
        address: form.address,
        city: form.city,
        state: form.state,
        country: form.country,
        pincode: form.pincode,
      },
      3,
    );
  };

  const submitStep3 = async () => {
    const next: Errors = {
      pan: validatePan(form.pan),
      bank_account_number: /^\d{9,18}$/.test(form.bank_account_number)
        ? null
        : "Enter a valid account number",
      bank_ifsc: validateIfsc(form.bank_ifsc),
      bank_account_holder_name: form.bank_account_holder_name.trim() ? null : t("required"),
      docs:
        uploadedTypes.has("aadhaar") &&
        uploadedTypes.has("pan") &&
        uploadedTypes.has("shop_license") &&
        uploadedTypes.has("cancelled_cheque") &&
        (!gstChoice || uploadedTypes.has("gst_certificate"))
          ? null
          : "Please upload all required documents",
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    await saveDraft(
      {
        pan: form.pan,
        bank_account_number: form.bank_account_number,
        bank_ifsc: form.bank_ifsc,
        bank_account_holder_name: form.bank_account_holder_name,
      },
      4,
    );
  };

  const submitApplication = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc("merchant_submit_application");
      if (error) {
        console.error(error);
        toast.error(error.message || "Could not submit your application.");
        return;
      }
      await refresh();
      toast.success("Application submitted");
    } finally {
      setSaving(false);
    }
  };

  const field = (
    key: keyof typeof form,
    label: string,
    extra?: {
      placeholder?: string;
      inputMode?: "text" | "numeric";
      transform?: (v: string) => string;
      maxLength?: number;
      disabled?: boolean;
    },
  ) => (
    <div className="space-y-2">
      <Label htmlFor={key} className="text-sm font-bold">
        {label}
      </Label>
      <Input
        id={key}
        value={form[key]}
        placeholder={extra?.placeholder}
        inputMode={extra?.inputMode}
        maxLength={extra?.maxLength}
        disabled={extra?.disabled}
        onChange={(e) => set(key)(extra?.transform ? extra.transform(e.target.value) : e.target.value)}
        className={`rounded-2xl text-base font-semibold ${extra?.inputMode === "numeric" ? "num" : ""}`}
      />
      {errors[key] && <p className="text-xs font-bold text-destructive">{errors[key]}</p>}
    </div>
  );

  if (merchant.status !== "draft") {
    return <ReviewScreen />;
  }

  return (
    <div className="app-scroll safe-top safe-bottom h-full bg-background pb-12">
      <header className="bg-brand-gradient px-6 pt-10 pb-12 text-primary-foreground">
        <div className="mx-auto w-full max-w-[520px]">
          <div className="flex items-center justify-between">
            <span className="text-xl">
              <Wordmark className="text-primary-foreground [&_span]:text-primary-foreground/70" />
            </span>
            <span className="num rounded-full bg-primary-foreground/15 px-3 py-1 text-xs font-bold">
              {t("onbStepOf")} {step} {t("onbOf")} {TOTAL_STEPS}
            </span>
          </div>
          <h1 className="mt-6 text-xl font-extrabold">{t("onbTitle")}</h1>
          <div className="mt-4 flex gap-2">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <div
                key={i}
                className={`h-2 flex-1 rounded-full ${
                  i + 1 <= step ? "bg-primary-foreground" : "bg-primary-foreground/25"
                }`}
              />
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto -mt-6 w-full max-w-[520px] px-6">
        <div className="space-y-4 rounded-3xl border border-border bg-card p-6 shadow-card">
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <BadgeCheck className="size-6 text-primary" />
                <h2 className="mt-3 text-base font-extrabold text-foreground">
                  {t("onbGstQuestion")}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("onbGstHelp")}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[true, false].map((choice) => (
                  <button
                    key={String(choice)}
                    onClick={() => setGstChoice(choice)}
                    className={`rounded-2xl border px-4 py-4 text-sm font-bold transition-colors ${
                      gstChoice === choice
                        ? "border-primary bg-primary-soft text-accent-foreground"
                        : "border-border bg-background text-muted-foreground"
                    }`}
                  >
                    {choice ? t("yes") : t("no")}
                  </button>
                ))}
              </div>

              {gstChoice === true && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="gstin" className="text-sm font-bold">
                      {t("onbGstinTitle")}
                    </Label>
                    <Input
                      id="gstin"
                      value={gstin}
                      placeholder="27ABCDE1234F1Z5"
                      maxLength={15}
                      onChange={(e) => {
                        setGstin(upperAlnum(e.target.value).slice(0, 15));
                        setErrors((prev) => ({ ...prev, gstin: null }));
                        setGstLookupDone(false);
                      }}
                      className="num rounded-2xl text-base font-bold tracking-wide"
                    />
                    {errors["gstin"] && (
                      <p className="text-xs font-bold text-destructive">{errors["gstin"]}</p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="lg"
                    disabled={verifying || gstin.length !== 15}
                    onClick={() => void handleGstinVerify()}
                    className="w-full rounded-2xl font-bold"
                  >
                    {verifying && <Loader2 className="size-5 animate-spin" />}
                    {t("onbVerifyGstin")}
                  </Button>

                  {gstStatus && gstStatus.toLowerCase() !== "active" && (
                    <p className="flex items-start gap-2 rounded-2xl bg-destructive/10 p-4 text-xs font-bold text-destructive">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                      This GSTIN shows as {gstStatus} — please confirm this is correct.
                    </p>
                  )}

                  {gstLookupDone && (
                    <div className="space-y-4 border-t border-border pt-4">
                      <div>
                        <p className="text-sm font-extrabold text-foreground">
                          {t("onbGstFetched")}
                        </p>
                        <p className="text-xs text-muted-foreground">{t("onbGstFetchedHelp")}</p>
                      </div>
                      {field("gst_legal_name", t("legalName"))}
                      {field("store_name", t("businessName"))}
                      {field("owner_name", t("ownerName"))}
                      {field("address", t("addressLine"))}
                      <div className="grid grid-cols-2 gap-3">
                        {field("city", t("city"))}
                        {field("pincode", t("pincode"), {
                          inputMode: "numeric",
                          maxLength: 6,
                          transform: (v) => digitsOnly(v).slice(0, 6),
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {gstChoice === false && (
                <div className="space-y-4 border-t border-border pt-4">
                  <p className="text-sm font-extrabold text-foreground">{t("onbManualTitle")}</p>
                  {field("store_name", t("businessName"))}
                  {field("owner_name", t("ownerName"))}
                </div>
              )}

              <Button
                size="lg"
                disabled={gstChoice === null || saving}
                onClick={() => void submitStep1()}
                className="w-full rounded-2xl text-base font-bold shadow-brand"
              >
                {saving && <Loader2 className="size-5 animate-spin" />}
                {t("saveContinue")}
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <MapPin className="size-6 text-primary" />
                <h2 className="mt-3 text-base font-extrabold text-foreground">
                  {t("onbBusinessTitle")}
                </h2>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">{t("category")}</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(categories.data ?? []).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => set("store_category_id")(c.id)}
                      className={`rounded-2xl border px-3 py-3 text-xs font-bold transition-colors ${
                        form.store_category_id === c.id
                          ? "border-primary bg-primary-soft text-accent-foreground"
                          : "border-border bg-background text-muted-foreground"
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
                {errors["store_category_id"] && (
                  <p className="text-xs font-bold text-destructive">{errors["store_category_id"]}</p>
                )}
              </div>
              {field("address", t("addressLine"), { placeholder: "Shop no, street, landmark" })}
              <div className="grid grid-cols-2 gap-3">
                {field("city", t("city"))}
                {field("pincode", t("pincode"), {
                  inputMode: "numeric",
                  maxLength: 6,
                  transform: (v) => digitsOnly(v).slice(0, 6),
                })}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {field("state", t("state"))}
                {field("country", t("country"))}
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setStep(1)}
                  className="rounded-2xl font-bold"
                >
                  <ArrowLeft className="size-5" />
                  {t("back")}
                </Button>
                <Button
                  size="lg"
                  disabled={saving}
                  onClick={() => void submitStep2()}
                  className="flex-1 rounded-2xl text-base font-bold shadow-brand"
                >
                  {saving && <Loader2 className="size-5 animate-spin" />}
                  {t("saveContinue")}
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <FileText className="size-6 text-primary" />
                <h2 className="mt-3 text-base font-extrabold text-foreground">
                  {t("onbDocsTitle")}
                </h2>
              </div>
              <div className="space-y-3">
                {(
                  [
                    ["aadhaar", t("docAadhaar"), false],
                    ["pan", t("docPan"), false],
                    ...(gstChoice ? [["gst_certificate", t("docGst"), false] as const] : []),
                    ["shop_license", t("docShopLicense"), false],
                    ["cancelled_cheque", t("docCheque"), false],
                    ["shop_photo", t("shopPhoto"), true],
                  ] as Array<[DocType, string, boolean]>
                ).map(([docType, label, optional]) => (
                  <DocumentUpload
                    key={docType}
                    merchantId={merchant.id}
                    docType={docType}
                    label={label}
                    optional={optional}
                    existingUrl={
                      docType === "shop_photo"
                        ? merchant.shop_photo_url
                        : ((documents.data ?? []).find((d) => d.doc_type === docType)?.file_url ??
                          null)
                    }
                    onUploaded={(path) => recordDocument(docType, path)}
                  />
                ))}
                {errors["docs"] && <p className="text-xs font-bold text-destructive">{errors["docs"]}</p>}
              </div>

              {field("pan", t("panNumber"), {
                maxLength: 10,
                transform: (v) => upperAlnum(v).slice(0, 10),
                placeholder: "ABCDE1234F",
              })}

              <div className="space-y-4 border-t border-border pt-4">
                <p className="text-sm font-extrabold text-foreground">{t("bankDetails")}</p>
                {field("bank_account_number", t("accountNumber"), {
                  inputMode: "numeric",
                  maxLength: 18,
                  transform: (v) => digitsOnly(v).slice(0, 18),
                })}
                {field("bank_ifsc", t("ifsc"), {
                  maxLength: 11,
                  transform: (v) => upperAlnum(v).slice(0, 11),
                  placeholder: "SBIN0001234",
                })}
                {field("bank_account_holder_name", t("accountHolder"))}
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setStep(2)}
                  className="rounded-2xl font-bold"
                >
                  <ArrowLeft className="size-5" />
                  {t("back")}
                </Button>
                <Button
                  size="lg"
                  disabled={saving}
                  onClick={() => void submitStep3()}
                  className="flex-1 rounded-2xl text-base font-bold shadow-brand"
                >
                  {saving && <Loader2 className="size-5 animate-spin" />}
                  {t("saveContinue")}
                </Button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <div>
                <Building2 className="size-6 text-primary" />
                <h2 className="mt-3 text-base font-extrabold text-foreground">
                  {form.store_name || merchant.store_name}
                </h2>
                <p className="num mt-1 text-sm text-muted-foreground">+91 {merchant.phone}</p>
              </div>
              <dl className="space-y-2 rounded-2xl bg-muted/50 p-4 text-sm">
                {[
                  [t("category"), (categories.data ?? []).find((c) => c.id === form.store_category_id)?.name],
                  [t("addressLine"), [form.address, form.city, form.pincode].filter(Boolean).join(", ")],
                  [gstChoice ? "GSTIN" : t("ownerName"), gstChoice ? gstin : form.owner_name],
                  [t("panNumber"), form.pan],
                  [t("ifsc"), form.bank_ifsc],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4">
                    <dt className="font-semibold text-muted-foreground">{label}</dt>
                    <dd className="num text-right font-bold text-foreground">{value || "—"}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setStep(3)}
                  className="rounded-2xl font-bold"
                >
                  <ArrowLeft className="size-5" />
                  {t("back")}
                </Button>
                <Button
                  size="lg"
                  disabled={saving}
                  onClick={() => void submitApplication()}
                  className="flex-1 rounded-2xl text-base font-bold shadow-brand"
                >
                  {saving && <Loader2 className="size-5 animate-spin" />}
                  {t("submitApplication")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function ReviewScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();

  return (
    <div className="safe-top safe-bottom flex h-full flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <div className="flex size-16 items-center justify-center rounded-3xl bg-primary-soft">
        <CheckCircle2 className="size-8 text-primary" />
      </div>
      <h1 className="text-xl font-extrabold text-foreground">{t("onbReviewTitle")}</h1>
      <p className="max-w-[36ch] text-sm text-muted-foreground">{t("onbReviewSub")}</p>
      <Button
        size="lg"
        onClick={() => void navigate({ to: "/home", replace: true })}
        className="mt-4 rounded-2xl text-base font-bold shadow-brand"
      >
        {t("home")}
      </Button>
    </div>
  );
}
