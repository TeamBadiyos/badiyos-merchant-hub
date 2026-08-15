import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FileUp, Loader2, Package, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell, PlaceholderPanel } from "@/components/AppShell";
import { CsvImportDialog } from "@/components/CsvImportDialog";
import { AccessDenied, PendingApproval } from "@/components/GateNotice";
import { ProductImage } from "@/components/ProductImage";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { useI18n, type Key } from "@/lib/i18n";
import { inr } from "@/lib/order-status";
import { useRequireAuth } from "@/lib/use-require-auth";

type Product = Database["public"]["Tables"]["products"]["Row"];

const UNITS: { value: string; key: Key }[] = [
  { value: "kg", key: "unitKg" },
  { value: "piece", key: "unitPiece" },
  { value: "pack", key: "unitPack" },
  { value: "litre", key: "unitLitre" },
  { value: "other", key: "unitOther" },
];

export const Route = createFileRoute("/products")({
  validateSearch: (search: Record<string, unknown>) => ({
    low: search["low"] === "1" || search["low"] === true,
  }),
  head: () => ({
    meta: [
      { title: "Products — badiyos Merchant Portal" },
      {
        name: "description",
        content:
          "Add, edit and delete the products your shop sells on badiyos, with price, stock and photos.",
      },
      { property: "og:title", content: "Products — badiyos Merchant Portal" },
      { property: "og:description", content: "Manage your badiyos product catalogue." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProductsPage,
});

function ProductsPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  const merchant = useRequireAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [importing, setImporting] = useState(false);
  const { low } = Route.useSearch();
  const navigate = Route.useNavigate();

  const products = useQuery({
    queryKey: ["products", merchant?.id],
    enabled: Boolean(merchant?.id) && can("manage_products"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const toggleActive = useMutation({
    mutationFn: async (product: Product) => {
      const { error } = await supabase
        .from("products")
        .update({ is_active: !product.is_active })
        .eq("id", product.id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["products"] }),
    onError: () => toast.error("Could not update the product."),
  });

  const remove = useMutation({
    mutationFn: async (product: Product) => {
      const { error } = await supabase.from("products").delete().eq("id", product.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("deleted"));
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: () => toast.error("Could not delete the product."),
  });

  if (!merchant) return null;

  const visible = low
    ? (products.data ?? []).filter((p) => p.is_active && p.stock_quantity <= p.low_stock_threshold)
    : products.data;

  return (
    <AppShell title={t("products")} onRefresh={() => products.refetch()}>
      {merchant.status !== "approved" ? (
        <PendingApproval />
      ) : !can("manage_products") ? (
        <AccessDenied />
      ) : (
        <div className="space-y-4">
          <Button
            size="lg"
            onClick={() => setCreating(true)}
            className="w-full rounded-2xl text-base font-bold shadow-brand"
          >
            <Plus className="size-5" />
            {t("addProduct")}
          </Button>

          <Button
            variant="outline"
            size="lg"
            onClick={() => setImporting(true)}
            className="w-full rounded-2xl text-sm font-bold"
          >
            <FileUp className="size-5" />
            {t("importCsv")}
          </Button>

          {low && (
            <div className="flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
              <AlertTriangle className="size-5 shrink-0 text-destructive" />
              <p className="flex-1 text-xs font-bold text-destructive">{t("lowStockOnly")}</p>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs font-bold"
                onClick={() => void navigate({ search: { low: false } })}
              >
                {t("clearFilter")}
              </Button>
            </div>
          )}

          {products.isLoading && (
            <div className="flex justify-center py-10">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          )}

          {visible?.length === 0 && (
            <PlaceholderPanel
              title={t("noProducts")}
              description={t("noProductsSub")}
              icon={Package}
            />
          )}

          {visible?.map((product) => (
            <div
              key={product.id}
              className="flex gap-4 rounded-2xl border border-border bg-card p-4 shadow-card"
            >
              <ProductImage path={product.image_url} className="size-16 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-foreground">{product.name}</p>
                <p className="num text-sm font-extrabold text-primary">
                  {inr(product.price)}
                  <span className="text-xs font-semibold text-muted-foreground">
                    {product.unit ? ` / ${product.unit}` : ""}
                  </span>
                </p>
                <p className="num text-xs font-semibold text-muted-foreground">
                  {t("stock")}: {product.stock_quantity}
                  {product.category_label ? ` · ${product.category_label}` : ""}
                </p>
                {product.stock_quantity <= product.low_stock_threshold && (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-1 text-[10px] font-bold text-destructive">
                    <AlertTriangle className="size-3" />
                    {t("lowStock")}
                  </span>
                )}
                <div className="mt-2 flex items-center gap-3">
                  <Switch
                    checked={product.is_active}
                    onCheckedChange={() => toggleActive.mutate(product)}
                    aria-label={t("active")}
                  />
                  <span className="text-xs font-bold text-muted-foreground">
                    {product.is_active ? t("active") : t("inactive")}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  aria-label={t("editProduct")}
                  onClick={() => setEditing(product)}
                  className="rounded-xl bg-primary-soft p-2 text-primary"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  aria-label={t("delete")}
                  onClick={() => setDeleting(product)}
                  className="rounded-xl bg-destructive/10 p-2 text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && merchant.id && (
        <ProductForm
          merchantId={merchant.id}
          product={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      {importing && merchant.id && (
        <CsvImportDialog merchantId={merchant.id} onClose={() => setImporting(false)} />
      )}

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteProductTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteProductSub")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (deleting) remove.mutate(deleting);
              }}
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function ProductForm({
  merchantId,
  product,
  onClose,
}: {
  merchantId: string;
  product: Product | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [categoryLabel, setCategoryLabel] = useState(product?.category_label ?? "");
  const [price, setPrice] = useState(product ? String(product.price) : "");
  const [stock, setStock] = useState(product ? String(product.stock_quantity) : "0");
  const [unit, setUnit] = useState(product?.unit ?? "piece");
  const [threshold, setThreshold] = useState(String(product?.low_stock_threshold ?? 5));
  const [gstRate, setGstRate] = useState(String(product?.gst_rate ?? 0));
  const [hsn, setHsn] = useState(product?.hsn_sac_code ?? "");
  const [imagePath, setImagePath] = useState<string | null>(product?.image_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const next: Record<string, string> = {};
    if (!name.trim()) next["name"] = t("required");
    if (!price || Number(price) <= 0) next["price"] = "Enter a price above 0";
    if (stock === "" || Number(stock) < 0 || !Number.isInteger(Number(stock)))
      next["stock"] = "Stock must be 0 or more";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        merchant_id: merchantId,
        name: name.trim(),
        description: description.trim() || null,
        category_label: categoryLabel.trim() || null,
        price: Number(price),
        stock_quantity: Number(stock),
        unit,
        low_stock_threshold: Number(threshold || 0),
        gst_rate: Number(gstRate || 0),
        hsn_sac_code: hsn.trim() || null,
        image_url: imagePath,
      };
      if (product) {
        const { error } = await supabase.from("products").update(payload).eq("id", product.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(t("saved"));
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      onClose();
    },
    onError: (error: Error) => {
      console.error(error);
      toast.error("Could not save the product.");
    },
  });

  const handleFile = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Please upload an image smaller than 5 MB.");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${merchantId}/product-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("product-images")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      setImagePath(path);
    } catch (error) {
      console.error(error);
      toast.error("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle>{product ? t("editProduct") : t("addProduct")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <ProductImage path={imagePath} className="size-20 shrink-0" />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {t("productImage")}
            </Button>
          </div>

          <Field label={t("productName")} error={errors["name"] ?? ""}>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl" />
          </Field>

          <Field label={t("description")}>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-xl"
              rows={3}
            />
          </Field>

          <Field label={t("categoryLabel")}>
            <Input
              value={categoryLabel}
              onChange={(e) => setCategoryLabel(e.target.value)}
              className="rounded-xl"
              placeholder="Snacks, Dairy…"
            />
          </Field>

          <Field label={t("lowStockThreshold")}>
            <Input
              inputMode="numeric"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value.replace(/\D/g, ""))}
              className="num rounded-xl"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label={t("gstRate")}>
              <Input
                inputMode="decimal"
                value={gstRate}
                onChange={(e) => setGstRate(e.target.value.replace(/[^0-9.]/g, ""))}
                className="num rounded-xl"
              />
            </Field>
            <Field label={t("hsn")}>
              <Input
                value={hsn}
                onChange={(e) => setHsn(e.target.value.toUpperCase())}
                className="num rounded-xl"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label={t("price")} error={errors["price"] ?? ""}>
              <Input
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
                className="num rounded-xl"
              />
            </Field>
            <Field label={t("stock")} error={errors["stock"] ?? ""}>
              <Input
                inputMode="numeric"
                value={stock}
                onChange={(e) => setStock(e.target.value.replace(/\D/g, ""))}
                className="num rounded-xl"
              />
            </Field>
          </div>

          <Field label={t("unit")}>
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNITS.map((u) => (
                  <SelectItem key={u.value} value={u.value}>
                    {t(u.key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button
              className="flex-1 rounded-xl font-bold"
              disabled={save.isPending}
              onClick={() => {
                if (validate()) save.mutate();
              }}
            >
              {save.isPending && <Loader2 className="size-4 animate-spin" />}
              {t("save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-bold">{label}</Label>
      {children}
      {error && <p className="text-xs font-bold text-destructive">{error}</p>}
    </div>
  );
}
