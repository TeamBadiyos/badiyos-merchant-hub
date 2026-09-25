import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Banknote,
  Building2,
  Camera,
  FileText,
  Globe,
  Loader2,
  LogOut,
  Pencil,
  ShieldCheck,
  Store,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { hapticImpact } from "@/lib/haptics";
import { useI18n } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/use-require-auth";
import {
  digitsOnly,
  required,
  upperAlnum,
  validateIfsc,
  validatePincode,
} from "@/lib/validation";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile & settings — badiyos Merchant Portal" },
      {
        name: "description",
        content:
          "Review and edit your shop details, bank account, documents and language on the badiyos Merchant Portal.",
      },
      { property: "og:title", content: "Profile & settings — badiyos" },
      { property: "og:description", content: "Shop details, bank account, documents and language." },
    ],
  }),
  component: ProfilePage,
});

const DOC_LABEL_KEYS: Record<string, "docAadhaar" | "docPan" | "docGst" | "docShopLicense" | "docCheque"> = {
  aadhaar: "docAadhaar",
  pan: "docPan",
  gst_certificate: "docGst",
  shop_license: "docShopLicense",
  cancelled_cheque: "docCheque",
};

type Errors = Record<string, string | null>;

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="max-w-[60%] text-right text-sm font-bold text-foreground">{value || "—"}</p>
    </div>
  );
}

function ShopPhoto({ path }: { path: string | null }) {
  const { data } = useQuery({
    queryKey: ["shop-photo", path],
    enabled: Boolean(path),
    staleTime: 45 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.storage
        .from("merchant-documents")
        .createSignedUrl(path!, 60 * 60);
      return data?.signedUrl ?? null;
    },
  });
  if (path && data) {
    return <img src={data} alt="" className="size-16 rounded-2xl object-cover" />;
  }
  return (
    <div className="flex size-16 items-center justify-center rounded-2xl bg-primary-soft">
      <Building2 className="size-7 text-primary" />
    </div>
  );
}

function ProfilePage() {
  const { t, lang, setLang } = useI18n();
  const { signOut, refresh } = useAuth();
  const navigate = useNavigate();
  const merchant = useRequireAuth();

  const [editShop, setEditShop] = useState(false);
  const [editBank, setEditBank] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const photoInput = useRef<HTMLInputElement>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [shop, setShop] = useState({
    store_name: "",
    owner_name: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    store_category_id: "",
  });
  const [bank, setBank] = useState({
    bank_account_holder_name: "",
    bank_account_number: "",
    bank_ifsc: "",
  });

  useEffect(() => {
    if (!merchant) return;
    setShop({
      store_name: merchant.store_name ?? "",
      owner_name: merchant.owner_name ?? "",
      address: merchant.address ?? "",
      city: merchant.city ?? "",
      state: merchant.state ?? "",
      pincode: merchant.pincode ?? "",
      store_category_id: merchant.store_category_id ?? "",
    });
    setBank({
      bank_account_holder_name: merchant.bank_account_holder_name ?? "",
      bank_account_number: merchant.bank_account_number ?? "",
      bank_ifsc: merchant.bank_ifsc ?? "",
    });
  }, [merchant]);

  const categories = useQuery({
    queryKey: ["store-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_categories")
        .select("id, name")
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
        .select("id, doc_type, uploaded_at")
        .eq("merchant_id", merchant!.id)
        .order("uploaded_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  if (!merchant) return null;

  const approved = merchant.status === "approved";
  const categoryName =
    (categories.data ?? []).find((c) => c.id === merchant.store_category_id)?.name ?? null;

  const statusLabel =
    merchant.status === "approved"
      ? t("statusApproved")
      : merchant.status === "rejected"
        ? t("statusRejectedLabel")
        : merchant.status === "draft"
          ? t("statusDraftLabel")
          : t("statusUnderReview");

  const save = async (patch: Record<string, unknown>, done: () => void) => {
    setSaving(true);
    try {
      const { error } = await supabase.from("merchants").update(patch).eq("id", merchant.id);
      if (error) {
        console.error(error);
        toast.error(error.message);
        return;
      }
      hapticImpact("light");
      await refresh();
      toast.success(t("saved"));
      done();
    } finally {
      setSaving(false);
    }
  };

  const saveShop = async () => {
    const next: Errors = {
      store_name: required(shop.store_name, t("businessName")),
      owner_name: required(shop.owner_name, t("ownerName")),
      address: required(shop.address, t("addressLine")),
      city: required(shop.city, t("city")),
      state: required(shop.state, t("state")),
      pincode: validatePincode(shop.pincode),
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    const patch: Record<string, unknown> = {
      store_name: shop.store_name.trim(),
      owner_name: shop.owner_name.trim(),
      address: shop.address.trim(),
      city: shop.city.trim(),
      state: shop.state.trim(),
      pincode: shop.pincode,
    };
    if (!approved && shop.store_category_id) patch["store_category_id"] = shop.store_category_id;
    await save(patch, () => setEditShop(false));
  };

  const saveBank = async () => {
    const next: Errors = {
      bank_account_holder_name: required(bank.bank_account_holder_name, t("accountHolder")),
      bank_account_number: /^\d{9,18}$/.test(bank.bank_account_number)
        ? null
        : t("accountNumberInvalid"),
      bank_ifsc: validateIfsc(bank.bank_ifsc),
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    await save(
      {
        bank_account_holder_name: bank.bank_account_holder_name.trim(),
        bank_account_number: bank.bank_account_number,
        bank_ifsc: bank.bank_ifsc,
      },
      () => setEditBank(false),
    );
  };

  const uploadPhoto = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Please upload a file smaller than 5 MB.");
      return;
    }
    setUploadingPhoto(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${merchant.id}/shop_photo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("merchant-documents")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) {
        console.error(error);
        toast.error("Upload failed. Please try again.");
        return;
      }
      await save({ shop_photo_url: path }, () => {});
    } finally {
      setUploadingPhoto(false);
    }
  };

  const maskedAccount = bank.bank_account_number
    ? showAccount
      ? bank.bank_account_number
      : `•••• ${bank.bank_account_number.slice(-4)}`
    : null;

  const field = (
    id: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    opts: { inputMode?: "numeric" | "text"; maxLength?: number; transform?: (v: string) => string } = {},
  ) => (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-[11px] font-semibold text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        inputMode={opts.inputMode ?? "text"}
        maxLength={opts.maxLength}
        onChange={(e) => {
          onChange(opts.transform ? opts.transform(e.target.value) : e.target.value);
          setErrors((prev) => ({ ...prev, [id]: null }));
        }}
        className="h-12 rounded-xl"
      />
      {errors[id] && <p className="text-xs font-bold text-destructive">{errors[id]}</p>}
    </div>
  );

  return (
    <AppShell title={t("profile")}>
      <div className="space-y-4 pb-4">
        {/* Shop header */}
        <section className="rounded-3xl border border-border bg-card p-5 shadow-card">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => photoInput.current?.click()}
              className="relative shrink-0"
              aria-label={merchant.shop_photo_url ? t("changePhoto") : t("addPhoto")}
            >
              <ShopPhoto path={merchant.shop_photo_url} />
              <span className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                {uploadingPhoto ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Camera className="size-3" />
                )}
              </span>
            </button>
            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadPhoto(file);
                e.target.value = "";
              }}
            />
            <div className="min-w-0">
              <p className="truncate text-base font-extrabold text-foreground">
                {merchant.store_name ?? "Your shop"}
              </p>
              <p className="num text-sm text-muted-foreground">+91 {merchant.phone}</p>
              <p className="text-sm text-muted-foreground">
                {[merchant.city, merchant.state].filter(Boolean).join(", ") || "Latur, Maharashtra"}
              </p>
            </div>
          </div>
          <p
            className={`mt-4 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${
              approved
                ? "bg-primary-soft text-accent-foreground"
                : merchant.status === "rejected"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            <ShieldCheck className="size-4" />
            {statusLabel}
          </p>
        </section>

        {/* Shop details */}
        <section className="rounded-3xl border border-border bg-card p-5 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
              <Store className="size-5 text-primary" />
              {t("shopDetails")}
            </h2>
            {!editShop && (
              <button
                type="button"
                onClick={() => setEditShop(true)}
                className="flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-bold text-accent-foreground"
              >
                <Pencil className="size-3.5" />
                {t("editDetails")}
              </button>
            )}
          </div>

          {editShop ? (
            <div className="mt-4 space-y-3">
              {field("store_name", t("businessName"), shop.store_name, (v) =>
                setShop((p) => ({ ...p, store_name: v })),
              )}
              {field("owner_name", t("ownerName"), shop.owner_name, (v) =>
                setShop((p) => ({ ...p, owner_name: v })),
              )}
              {field("address", t("addressLine"), shop.address, (v) =>
                setShop((p) => ({ ...p, address: v })),
              )}
              <div className="grid grid-cols-2 gap-3">
                {field("city", t("city"), shop.city, (v) => setShop((p) => ({ ...p, city: v })))}
                {field("state", t("state"), shop.state, (v) => setShop((p) => ({ ...p, state: v })))}
              </div>
              {field("pincode", t("pincode"), shop.pincode, (v) => setShop((p) => ({ ...p, pincode: v })), {
                inputMode: "numeric",
                maxLength: 6,
                transform: digitsOnly,
              })}

              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground">
                  {t("category")}
                </Label>
                {approved ? (
                  <>
                    <p className="text-sm font-bold text-foreground">{categoryName || "—"}</p>
                    <p className="text-xs text-muted-foreground">{t("categoryLocked")}</p>
                  </>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {(categories.data ?? []).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setShop((p) => ({ ...p, store_category_id: c.id }))}
                        className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                          shop.store_category_id === c.id
                            ? "border-primary bg-primary-soft text-accent-foreground"
                            : "border-border bg-background text-muted-foreground"
                        }`}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-1">
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl"
                  onClick={() => {
                    setEditShop(false);
                    setErrors({});
                    setShop({
                      store_name: merchant.store_name ?? "",
                      owner_name: merchant.owner_name ?? "",
                      address: merchant.address ?? "",
                      city: merchant.city ?? "",
                      state: merchant.state ?? "",
                      pincode: merchant.pincode ?? "",
                      store_category_id: merchant.store_category_id ?? "",
                    });
                  }}
                >
                  {t("cancel")}
                </Button>
                <Button className="flex-1 rounded-xl" disabled={saving} onClick={() => void saveShop()}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : t("save")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-2 divide-y divide-border">
              <Row label={t("businessName")} value={merchant.store_name} />
              <Row label={t("ownerName")} value={merchant.owner_name} />
              <Row label={t("addressLine")} value={merchant.address} />
              <Row label={t("city")} value={merchant.city} />
              <Row label={t("state")} value={merchant.state} />
              <Row label={t("pincode")} value={merchant.pincode} />
              <Row label={t("category")} value={categoryName} />
            </div>
          )}
        </section>

        {/* Bank details */}
        <section className="rounded-3xl border border-border bg-card p-5 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
              <Banknote className="size-5 text-primary" />
              {t("bankDetails")}
            </h2>
            {!editBank && (
              <button
                type="button"
                onClick={() => setEditBank(true)}
                className="flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-bold text-accent-foreground"
              >
                <Pencil className="size-3.5" />
                {t("editDetails")}
              </button>
            )}
          </div>

          {editBank ? (
            <div className="mt-4 space-y-3">
              {field("bank_account_holder_name", t("accountHolder"), bank.bank_account_holder_name, (v) =>
                setBank((p) => ({ ...p, bank_account_holder_name: v })),
              )}
              {field(
                "bank_account_number",
                t("accountNumber"),
                bank.bank_account_number,
                (v) => setBank((p) => ({ ...p, bank_account_number: v })),
                { inputMode: "numeric", maxLength: 18, transform: digitsOnly },
              )}
              {field(
                "bank_ifsc",
                t("ifsc"),
                bank.bank_ifsc,
                (v) => setBank((p) => ({ ...p, bank_ifsc: v })),
                { maxLength: 11, transform: upperAlnum },
              )}
              <div className="flex gap-3 pt-1">
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl"
                  onClick={() => {
                    setEditBank(false);
                    setErrors({});
                    setBank({
                      bank_account_holder_name: merchant.bank_account_holder_name ?? "",
                      bank_account_number: merchant.bank_account_number ?? "",
                      bank_ifsc: merchant.bank_ifsc ?? "",
                    });
                  }}
                >
                  {t("cancel")}
                </Button>
                <Button className="flex-1 rounded-xl" disabled={saving} onClick={() => void saveBank()}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : t("save")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-2 divide-y divide-border">
              <Row label={t("accountHolder")} value={merchant.bank_account_holder_name} />
              <div className="flex items-center justify-between gap-4 py-2">
                <p className="text-xs font-semibold text-muted-foreground">{t("accountNumber")}</p>
                <div className="flex items-center gap-2">
                  <p className="num text-sm font-bold text-foreground">{maskedAccount ?? "—"}</p>
                  {maskedAccount && (
                    <button
                      type="button"
                      onClick={() => setShowAccount((v) => !v)}
                      className="text-xs font-bold text-primary"
                    >
                      {showAccount ? t("hide") : t("showFull")}
                    </button>
                  )}
                </div>
              </div>
              <Row label={t("ifsc")} value={merchant.bank_ifsc} />
            </div>
          )}
        </section>

        {/* GST & PAN — read only */}
        <section className="rounded-3xl border border-border bg-card p-5 shadow-card">
          <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
            <FileText className="size-5 text-primary" />
            {t("gstPanTitle")}
          </h2>
          <div className="mt-2 divide-y divide-border">
            <Row
              label="GSTIN"
              value={merchant.is_gst_registered ? merchant.gstin : t("gstNotRegistered")}
            />
            {merchant.is_gst_registered && (
              <>
                <Row label={t("legalName")} value={merchant.gst_legal_name} />
                <Row label={t("gstStatusLabel")} value={merchant.gst_status} />
              </>
            )}
            <Row label={t("panNumber")} value={merchant.pan} />
          </div>
          <Link
            to="/support"
            className="mt-3 block text-xs font-bold text-primary underline-offset-2 hover:underline"
          >
            {t("contactSupportToChange")}
          </Link>
        </section>

        {/* Documents — list only */}
        <section className="rounded-3xl border border-border bg-card p-5 shadow-card">
          <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
            <FileText className="size-5 text-primary" />
            {t("documentsTitle")}
          </h2>
          {documents.isLoading ? (
            <Loader2 className="mt-4 size-5 animate-spin text-primary" />
          ) : (documents.data ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{t("noDocumentsYet")}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {(documents.data ?? []).map((doc) => {
                const key = DOC_LABEL_KEYS[doc.doc_type];
                return (
                  <li
                    key={doc.id}
                    className="flex items-center justify-between rounded-xl bg-muted/60 px-4 py-3"
                  >
                    <p className="text-sm font-bold text-foreground">
                      {key ? t(key) : doc.doc_type}
                    </p>
                    <p className="num text-xs text-muted-foreground">
                      {new Date(doc.uploaded_at).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Language */}
        <section className="rounded-3xl border border-border bg-card p-5 shadow-card">
          <p className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Globe className="size-5 text-primary" />
            {t("language")}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {(["en", "mr"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`rounded-2xl border px-4 py-4 text-sm font-bold transition-colors ${
                  lang === l
                    ? "border-primary bg-primary-soft text-accent-foreground"
                    : "border-border bg-background text-muted-foreground"
                }`}
              >
                {l === "en" ? "English" : "मराठी"}
              </button>
            ))}
          </div>
        </section>

        <Button
          variant="outline"
          size="lg"
          onClick={() => {
            void signOut().then(() => navigate({ to: "/login", replace: true }));
          }}
          className="w-full rounded-2xl border-destructive/30 text-base font-bold text-destructive hover:bg-destructive/10"
        >
          <LogOut className="size-5" />
          {t("logout")}
        </Button>
      </div>
    </AppShell>
  );
}
