import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Camera,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  EyeOff,
  FileUp,
  ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { CsvImportDialog } from "@/components/CsvImportDialog";
import { AccessDenied, PendingApproval } from "@/components/GateNotice";
import { ProductImage } from "@/components/ProductImage";
import { uploadCatalogImage } from "@/lib/catalog-images";
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
import { Checkbox } from "@/components/ui/checkbox";
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
import { hapticImpact, hapticNotify } from "@/lib/haptics";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { useI18n, type Key } from "@/lib/i18n";
import { inr } from "@/lib/order-status";
import { useRequireAuth } from "@/lib/use-require-auth";

type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type Variant = Database["public"]["Tables"]["product_variants"]["Row"];
type Addon = Database["public"]["Tables"]["product_addons"]["Row"];
type Product = ProductRow & { product_variants: Variant[]; product_addons: Addon[] };
type Category = { id: string; name: string; sort_order: number };

const UNITS: { value: string; key: Key }[] = [
  { value: "gm", key: "unitGm" },
  { value: "kg", key: "unitKg" },
  { value: "ml", key: "unitMl" },
  { value: "litre", key: "unitLitre" },
  { value: "piece", key: "unitPiece" },
  { value: "dozen", key: "unitDozen" },
  { value: "pack", key: "unitPack" },
  { value: "box", key: "unitBox" },
  { value: "bottle", key: "unitBottle" },
  { value: "packet", key: "unitPacket" },
  { value: "bundle", key: "unitBundle" },
  { value: "meter", key: "unitMeter" },
  { value: "pair", key: "unitPair" },
  { value: "plate", key: "unitPlate" },
  { value: "other", key: "unitOther" },
];

/** Add-on groups are stored as "Group: Item" names on product_addons. */
const GROUP_SEP = ": ";

export const Route = createFileRoute("/products")({
  validateSearch: (search: Record<string, unknown>) => ({
    low: search["low"] === "1" || search["low"] === true,
  }),
  head: () => ({
    meta: [
      { title: "Menu & Products — badiyos Merchant Portal" },
      {
        name: "description",
        content: "Manage your badiyos menu or product catalogue: categories, prices, availability and photos.",
      },
      { property: "og:title", content: "Menu & Products — badiyos Merchant Portal" },
      { property: "og:description", content: "Manage your badiyos menu or product catalogue." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProductsPage,
});

const imageOf = (p: ProductRow) => p.image_path ?? p.image_url;

function ProductsPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  const merchant = useRequireAuth();
  const queryClient = useQueryClient();
  const isFood = merchant?.service_type === "food";
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [importing, setImporting] = useState(false);
  const [query, setQuery] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { low } = Route.useSearch();
  const navigate = Route.useNavigate();
  const enabled = Boolean(merchant?.id) && can("manage_products");

  const products = useQuery({
    queryKey: ["products", merchant?.id],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, product_variants(*), product_addons(*)")
        .eq("merchant_id", merchant!.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Product[];
    },
  });

  const categories = useQuery({
    queryKey: ["catalog-categories", merchant?.service_type ?? "store", merchant?.id],
    enabled,
    queryFn: async () => {
      const svc = merchant?.service_type ?? "store";
      const [cats, order] = await Promise.all([
        supabase
          .from("catalog_categories")
          .select("id, name, sort_order")
          .eq("service_type", svc)
          .eq("is_active", true)
          .order("sort_order"),
        supabase.from("store_category_order").select("category_id, sort_order").eq("store_id", merchant!.id),
      ]);
      if (cats.error) throw cats.error;
      const rank = new Map((order.data ?? []).map((o) => [o.category_id, o.sort_order]));
      return (cats.data as Category[]).sort(
        (a, b) => (rank.get(a.id) ?? 1000 + a.sort_order) - (rank.get(b.id) ?? 1000 + b.sort_order),
      );
    },
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["products"] });
  const fail = (e: unknown) => {
    console.error(e);
    toast.error(t("pmFailed"));
  };

  const setAvailability = useMutation({
    mutationFn: async ({ ids, value }: { ids: string[]; value: boolean }) => {
      for (const id of ids) {
        const { error } = await supabase.rpc("set_product_availability", {
          _product_id: id,
          _is_available: value,
        });
        if (error) throw error;
      }
    },
    onMutate: ({ ids, value }) => {
      queryClient.setQueryData<Product[]>(["products", merchant?.id], (old) =>
        old?.map((p) => (ids.includes(p.id) ? { ...p, is_available: value } : p)),
      );
    },
    onSettled: invalidate,
    onError: fail,
  });

  const recommended = (products.data ?? [])
    .filter((p) => p.is_recommended)
    .sort((a, b) => (a.recommended_order ?? 99) - (b.recommended_order ?? 99));

  const toggleRecommended = useMutation({
    mutationFn: async (product: Product) => {
      const ids = product.is_recommended
        ? recommended.filter((p) => p.id !== product.id).map((p) => p.id)
        : [...recommended.map((p) => p.id), product.id];
      const { error } = await supabase.rpc("set_recommended_products", {
        _store_id: merchant!.id,
        _product_ids: ids,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: fail,
  });

  const reorderItems = useMutation({
    mutationFn: async ({ categoryId, ids }: { categoryId: string | null; ids: string[] }) => {
      const { error } = await supabase.rpc("reorder_products", {
        _store_id: merchant!.id,
        _category_id: categoryId as string,
        _product_ids: ids,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: fail,
  });

  const reorderCategories = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.rpc("reorder_store_categories", {
        _store_id: merchant!.id,
        _category_ids: ids,
      });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["catalog-categories"] }),
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: async (product: Product) => {
      const { error } = await supabase.from("products").delete().eq("id", product.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("deleted"));
      setDeleting(null);
      invalidate();
    },
    onError: fail,
  });

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = products.data ?? [];
    if (low && !isFood) list = list.filter((p) => p.stock_quantity <= p.low_stock_threshold);
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q) || (p.category_label ?? "").toLowerCase().includes(q));
    const cats = categories.data ?? [];
    const known = new Set(cats.map((c) => c.id));
    const out: { id: string | null; name: string; items: Product[] }[] = cats.map((c) => ({
      id: c.id,
      name: c.name,
      items: list.filter((p) => p.category_id === c.id),
    }));
    // Legacy items without a Command Center category: group by their old label.
    const rest = list.filter((p) => !p.category_id || !known.has(p.category_id));
    out.push({ id: null, name: t("pmUncategorised"), items: rest });
    return out.filter((s) => s.items.length > 0);
  }, [products.data, categories.data, query, low, isFood, t]);

  if (!merchant) return null;

  const moveCategory = (id: string, dir: -1 | 1) => {
    const ids = (categories.data ?? []).map((c) => c.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    hapticImpact("light");
    reorderCategories.mutate(ids);
  };

  const moveItem = (section: { id: string | null; items: Product[] }, index: number, dir: -1 | 1) => {
    const ids = section.items.map((p) => p.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j]!, ids[index]!];
    hapticImpact("light");
    reorderItems.mutate({ categoryId: section.id, ids });
  };

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const total = products.data?.length ?? 0;
  const catIds = (categories.data ?? []).map((c) => c.id);

  return (
    <AppShell title={isFood ? t("navMenu") : t("products")} onRefresh={() => products.refetch()}>
      {merchant.status !== "approved" ? (
        <PendingApproval />
      ) : !can("manage_products") ? (
        <AccessDenied />
      ) : (
        <div className="space-y-4 pb-24">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("pmSearch")}
              className="h-11 rounded-xl pl-9"
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={() => setCreating(true)} className="h-11 flex-1 rounded-xl font-bold">
              <Plus className="size-4" />
              {t("pmAddItem")}
            </Button>
            {!isFood && (
              <Button variant="outline" onClick={() => setImporting(true)} className="h-11 rounded-xl font-bold">
                <FileUp className="size-4" />
                {t("importCsv")}
              </Button>
            )}
            {total > 0 && (
              <Button
                variant={selecting ? "secondary" : "outline"}
                onClick={() => {
                  setSelecting((s) => !s);
                  setSelected(new Set());
                }}
                className="h-11 rounded-xl"
                aria-label={t("pmSelect")}
              >
                <CheckSquare className="size-4" />
              </Button>
            )}
          </div>

          {total > 0 && (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Star className="size-3.5 fill-primary text-primary" />
              {t("pmRecCount").replace("{n}", String(recommended.length))}
            </p>
          )}

          {low && !isFood && (
            <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
              <AlertTriangle className="size-4 shrink-0 text-destructive" />
              <p className="flex-1 text-xs font-bold text-destructive">{t("lowStockOnly")}</p>
              <Button size="sm" variant="ghost" className="text-xs font-bold" onClick={() => void navigate({ search: { low: false } })}>
                {t("clearFilter")}
              </Button>
            </div>
          )}

          {products.isLoading && (
            <div className="flex justify-center py-10">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          )}

          {!products.isLoading && total === 0 && (
            <p className="py-12 text-center text-sm font-semibold text-muted-foreground">{t("pmEmpty")}</p>
          )}
          {!products.isLoading && total > 0 && sections.length === 0 && (
            <p className="py-12 text-center text-sm font-semibold text-muted-foreground">{t("pmNoMatch")}</p>
          )}

          {sections.map((section) => {
            const ci = section.id ? catIds.indexOf(section.id) : -1;
            return (
              <section key={section.id ?? "none"} className="space-y-2">
                <div className="flex items-center gap-2 pt-2">
                  <h2 className="flex-1 text-sm font-extrabold text-foreground">
                    {section.name}
                    <span className="ml-1.5 font-semibold text-muted-foreground">· {section.items.length}</span>
                  </h2>
                  {section.id && !query && (
                    <>
                      <IconBtn label={t("pmMoveUp")} disabled={ci <= 0} onClick={() => moveCategory(section.id!, -1)}>
                        <ChevronUp className="size-4" />
                      </IconBtn>
                      <IconBtn label={t("pmMoveDown")} disabled={ci >= catIds.length - 1} onClick={() => moveCategory(section.id!, 1)}>
                        <ChevronDown className="size-4" />
                      </IconBtn>
                    </>
                  )}
                </div>
                <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                  {section.items.map((product, index) => (
                    <ItemRow
                      key={product.id}
                      product={product}
                      isFood={isFood}
                      selecting={selecting}
                      selected={selected.has(product.id)}
                      onSelect={() => toggleSelect(product.id)}
                      canMoveUp={!query && index > 0}
                      canMoveDown={!query && index < section.items.length - 1}
                      onMove={(dir) => moveItem(section, index, dir)}
                      onToggleAvailable={(v) => {
                        hapticImpact("light");
                        setAvailability.mutate({ ids: [product.id], value: v });
                      }}
                      onToggleRecommended={() => {
                        if (!product.is_recommended && recommended.length >= 6) {
                          toast.error(t("pmRecMax"));
                          return;
                        }
                        toggleRecommended.mutate(product);
                      }}
                      onEdit={() => setEditing(product)}
                      onDelete={() => setDeleting(product)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {selecting && (
        <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 px-4">
          <div className="mx-auto flex max-w-md items-center gap-2 rounded-2xl border border-border bg-card p-2 shadow-card">
            <span className="flex-1 pl-2 text-xs font-bold text-foreground">
              {t("pmSelected").replace("{n}", String(selected.size))}
            </span>
            <Button
              size="sm"
              className="rounded-xl"
              disabled={!selected.size || setAvailability.isPending}
              onClick={() => setAvailability.mutate({ ids: [...selected], value: true }, { onSuccess: () => setSelected(new Set()) })}
            >
              {t("pmMarkAvailable")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl"
              disabled={!selected.size || setAvailability.isPending}
              onClick={() => setAvailability.mutate({ ids: [...selected], value: false }, { onSuccess: () => setSelected(new Set()) })}
            >
              {t("pmMarkUnavailable")}
            </Button>
            <IconBtn label={t("pmDone")} onClick={() => { setSelecting(false); setSelected(new Set()); }}>
              <X className="size-4" />
            </IconBtn>
          </div>
        </div>
      )}

      {(creating || editing) && merchant.id && (
        <ProductForm
          merchantId={merchant.id}
          isFood={isFood}
          categories={categories.data ?? []}
          product={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      {importing && merchant.id && <CsvImportDialog merchantId={merchant.id} onClose={() => setImporting(false)} />}

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
                if (deleting) {
                  hapticNotify("warning");
                  remove.mutate(deleting);
                }
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

function IconBtn({
  label,
  disabled,
  onClick,
  children,
  active,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid size-8 place-items-center rounded-lg border border-border transition-colors disabled:opacity-30 ${
        active ? "bg-primary-soft text-primary" : "bg-card text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function priceText(p: Product) {
  const variants = [...(p.product_variants ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  if (variants.length) return variants.map((v) => `${v.name} ${inr(v.price)}`).join(" · ");
  return `${inr(p.price)}${p.unit ? ` / ${p.unit}` : ""}`;
}

function StatusBadge({ product, onEdit }: { product: Product; onEdit: () => void }) {
  const { t } = useI18n();
  if (product.approval_status === "rejected") {
    return (
      <div className="mt-1 space-y-1">
        <span className="inline-flex rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">
          {t("pmRejected")}
        </span>
        {product.approval_reason && <p className="text-xs text-muted-foreground">{product.approval_reason}</p>}
        <button type="button" onClick={onEdit} className="text-xs font-bold text-primary">
          {t("editProduct")}
        </button>
      </div>
    );
  }
  if (product.approval_status === "pending" || product.pending_changes) {
    return (
      <span className="mt-1 inline-flex rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold text-warning-foreground">
        {product.approval_status === "pending" ? t("pmPending") : t("pmChangesPending")}
      </span>
    );
  }
  return (
    <span className="mt-1 inline-flex rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold text-success">
      {t("pmLive")}
    </span>
  );
}

function ItemRow(props: {
  product: Product;
  isFood: boolean;
  selecting: boolean;
  selected: boolean;
  onSelect: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (dir: -1 | 1) => void;
  onToggleAvailable: (v: boolean) => void;
  onToggleRecommended: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const { product: p, isFood } = props;
  const lowStock = !isFood && p.stock_quantity <= p.low_stock_threshold;
  return (
    <div className="flex gap-3 p-3">
      {props.selecting && (
        <Checkbox checked={props.selected} onCheckedChange={props.onSelect} className="mt-6" aria-label={p.name} />
      )}
      <ProductImage path={imageOf(p)} className="size-16 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1.5">
          <p className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">{p.name}</p>
          <button
            type="button"
            aria-label={t("pmRecommended")}
            aria-pressed={p.is_recommended}
            onClick={props.onToggleRecommended}
            className="-m-1 p-1"
          >
            <Star className={`size-4 ${p.is_recommended ? "fill-primary text-primary" : "text-muted-foreground"}`} />
          </button>
        </div>
        <p className="num text-sm font-extrabold text-primary">{priceText(p)}</p>
        {!isFood && (
          <p className="num flex flex-wrap items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            {p.is_mrp && <span className="rounded bg-primary-soft px-1.5 py-0.5 text-[10px] font-bold text-accent-foreground">MRP</span>}
            {t("stock")}: {p.stock_quantity}
            {lowStock && (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">
                <AlertTriangle className="size-3" />
                {t("lowStock")}
              </span>
            )}
          </p>
        )}
        {p.admin_hidden ? (
          <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
            <EyeOff className="size-3" />
            {p.admin_hidden_reason || t("adminHiddenContact")}
          </p>
        ) : (
          <StatusBadge product={p} onEdit={props.onEdit} />
        )}
        <div className="mt-2 flex items-center gap-2">
          <Switch checked={p.is_available} onCheckedChange={props.onToggleAvailable} aria-label={t("pmAvailable")} />
          <span className="flex-1 text-xs font-bold text-muted-foreground">
            {p.is_available ? t("pmAvailable") : t("pmUnavailable")}
          </span>
          <IconBtn label={t("pmMoveUp")} disabled={!props.canMoveUp} onClick={() => props.onMove(-1)}>
            <ChevronUp className="size-4" />
          </IconBtn>
          <IconBtn label={t("pmMoveDown")} disabled={!props.canMoveDown} onClick={() => props.onMove(1)}>
            <ChevronDown className="size-4" />
          </IconBtn>
          <IconBtn label={t("editProduct")} onClick={props.onEdit}>
            <Pencil className="size-4" />
          </IconBtn>
          <IconBtn label={t("delete")} onClick={props.onDelete}>
            <Trash2 className="size-4" />
          </IconBtn>
        </div>
      </div>
    </div>
  );
}

/** Centre-crop to a square JPEG (skipped for HEIC, which the browser can't draw). */
async function cropSquare(file: File): Promise<File> {
  if (/heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height);
    const out = Math.min(side, 1200);
    const canvas = document.createElement("canvas");
    canvas.width = out;
    canvas.height = out;
    canvas
      .getContext("2d")!
      .drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, out, out);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.88));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

type VariantDraft = { name: string; price: string };
type GroupDraft = { name: string; items: VariantDraft[] };

function parseGroups(addons: Addon[]): GroupDraft[] {
  const groups: GroupDraft[] = [];
  for (const a of [...addons].sort((x, y) => x.sort_order - y.sort_order)) {
    const i = a.name.indexOf(GROUP_SEP);
    const group = i > 0 ? a.name.slice(0, i) : "";
    const name = i > 0 ? a.name.slice(i + GROUP_SEP.length) : a.name;
    let g = groups.find((x) => x.name === group);
    if (!g) groups.push((g = { name: group, items: [] }));
    g.items.push({ name, price: String(a.price) });
  }
  return groups;
}

function ProductForm({
  merchantId,
  isFood,
  categories,
  product,
  onClose,
}: {
  merchantId: string;
  isFood: boolean;
  categories: Category[];
  product: Product | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [categoryId, setCategoryId] = useState<string>(product?.category_id ?? "");
  const [price, setPrice] = useState(product ? String(product.price) : "");
  const [stock, setStock] = useState(product ? String(product.stock_quantity) : "0");
  const [unit, setUnit] = useState(product?.unit ?? (isFood ? "plate" : "piece"));
  const [threshold, setThreshold] = useState(String(product?.low_stock_threshold ?? 5));
  const [gstRate, setGstRate] = useState(String(product?.gst_rate ?? 0));
  const [hsn, setHsn] = useState(product?.hsn_sac_code ?? "");
  const [imagePath, setImagePath] = useState<string | null>(product ? imageOf(product) : null);
  const [isMrp, setIsMrp] = useState<boolean>(product?.is_mrp ?? false);
  const [variants, setVariants] = useState<VariantDraft[]>(
    (product?.product_variants ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((v) => ({ name: v.name, price: String(v.price) })),
  );
  const [groups, setGroups] = useState<GroupDraft[]>(parseGroups(product?.product_addons ?? []));
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const cleanVariants = variants.filter((v) => v.name.trim() && v.price !== "");
  const cleanAddons = groups.flatMap((g) =>
    g.items
      .filter((i) => i.name.trim() && i.price !== "")
      .map((i) => ({
        name: g.name.trim() ? `${g.name.trim()}${GROUP_SEP}${i.name.trim()}` : i.name.trim(),
        price: Number(i.price),
      })),
  );

  const validate = () => {
    const next: Record<string, string> = {};
    if (!name.trim()) next["name"] = t("required");
    if (!(isFood && cleanVariants.length) && (!price || Number(price) <= 0)) next["price"] = t("required");
    if (!isFood && (stock === "" || Number(stock) < 0)) next["stock"] = t("required");
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = useMutation({
    mutationFn: async () => {
      const basePrice = isFood && cleanVariants.length
        ? Math.min(...cleanVariants.map((v) => Number(v.price)))
        : Number(price);
      const payload: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || null,
        category_id: categoryId || null,
        price: basePrice,
        image_path: imagePath,
      };
      if (isFood) {
        payload["variants"] = cleanVariants.map((v, i) => ({ name: v.name.trim(), price: Number(v.price), is_default: i === 0 }));
        payload["addons"] = cleanAddons;
      }
      // Existing approval flow: new items go pending; edits to live items are parked for review.
      const { data, error } = await supabase.rpc("upsert_product", {
        _store_id: merchantId,
        _payload: payload as never,
        _product_id: (product?.id ?? null) as string,
      });
      if (error) throw error;
      const id = (data as { product_id?: string } | null)?.product_id ?? product?.id;
      // Non-reviewed details (stock, unit, tax, MRP) save directly.
      if (id) {
        const extra: Database["public"]["Tables"]["products"]["Update"] = { unit };
        if (!isFood) {
          Object.assign(extra, {
            stock_quantity: Number(stock),
            low_stock_threshold: Number(threshold || 0),
            gst_rate: Number(gstRate || 0),
            hsn_sac_code: hsn.trim() || null,
            is_mrp: isMrp,
          });
        }
        if (!product) extra.image_url = imagePath;
        const { error: e2 } = await supabase.from("products").update(extra).eq("id", id);
        if (e2) throw e2;
      }
    },
    onSuccess: () => {
      toast.success(t("pmWillBeLive"));
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      onClose();
    },
    onError: (error: Error) => {
      console.error(error);
      toast.error(t("pmFailed"));
    },
  });

  const handleFile = async (raw: File) => {
    if (raw.size > 10 * 1024 * 1024) {
      toast.error("Please upload an image smaller than 10 MB.");
      return;
    }
    setUploading(true);
    try {
      const file = await cropSquare(raw);
      const path = await uploadCatalogImage({ merchantId, type: "product", file });
      setImagePath(path);
    } catch (error) {
      console.error(error);
      toast.error("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = "";
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle>{product ? t("editProduct") : t("pmAddItem")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <ProductImage path={imagePath} className="size-20 shrink-0 rounded-xl" />
            <input ref={galleryRef} type="file" accept="image/*,.heic,.heif" className="hidden" onChange={onPick} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPick} />
            <div className="flex flex-1 flex-col gap-2">
              <Button type="button" variant="outline" size="sm" className="rounded-xl" disabled={uploading} onClick={() => cameraRef.current?.click()}>
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
                {t("pmCamera")}
              </Button>
              <Button type="button" variant="outline" size="sm" className="rounded-xl" disabled={uploading} onClick={() => galleryRef.current?.click()}>
                <ImageIcon className="size-4" />
                {t("pmGallery")}
              </Button>
            </div>
          </div>

          <Field label={t("productName")} error={errors["name"]}>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl" />
          </Field>

          <Field label={t("pmCategory")}>
            {categories.length ? (
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder={t("pmChooseCategory")} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-xs text-muted-foreground">{t("pmNoCategories")}</p>
            )}
          </Field>

          <Field label={t("description")}>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="rounded-xl" rows={3} />
          </Field>

          {isFood && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-success/40 px-2.5 py-1 text-xs font-bold text-success">
              <span className="size-2 rounded-full bg-success" />
              {t("pmVegOnly")}
            </span>
          )}

          {!(isFood && cleanVariants.length) && (
            <Field label={t("price")} error={errors["price"]}>
              <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))} className="num rounded-xl" />
            </Field>
          )}

          {isFood && (
            <div className="space-y-2">
              <Label className="text-sm font-bold">{t("pmVariants")}</Label>
              {variants.map((v, i) => (
                <PairRow
                  key={i}
                  value={v}
                  onChange={(nv) => setVariants((arr) => arr.map((x, j) => (j === i ? nv : x)))}
                  onRemove={() => setVariants((arr) => arr.filter((_, j) => j !== i))}
                />
              ))}
              <Button type="button" variant="ghost" size="sm" className="text-primary" onClick={() => setVariants((a) => [...a, { name: "", price: "" }])}>
                <Plus className="size-4" />
                {t("pmAddVariant")}
              </Button>
            </div>
          )}

          {isFood && (
            <div className="space-y-3">
              <Label className="text-sm font-bold">{t("pmAddonGroups")}</Label>
              {groups.map((g, gi) => (
                <div key={gi} className="space-y-2 rounded-xl border border-border p-3">
                  <div className="flex gap-2">
                    <Input
                      value={g.name}
                      placeholder={t("pmGroupName")}
                      onChange={(e) => setGroups((arr) => arr.map((x, j) => (j === gi ? { ...x, name: e.target.value.replace(/:/g, "") } : x)))}
                      className="rounded-xl"
                    />
                    <IconBtn label={t("delete")} onClick={() => setGroups((arr) => arr.filter((_, j) => j !== gi))}>
                      <X className="size-4" />
                    </IconBtn>
                  </div>
                  {g.items.map((it, ii) => (
                    <PairRow
                      key={ii}
                      value={it}
                      onChange={(nv) =>
                        setGroups((arr) => arr.map((x, j) => (j === gi ? { ...x, items: x.items.map((y, k) => (k === ii ? nv : y)) } : x)))
                      }
                      onRemove={() =>
                        setGroups((arr) => arr.map((x, j) => (j === gi ? { ...x, items: x.items.filter((_, k) => k !== ii) } : x)))
                      }
                    />
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-primary"
                    onClick={() => setGroups((arr) => arr.map((x, j) => (j === gi ? { ...x, items: [...x.items, { name: "", price: "" }] } : x)))}
                  >
                    <Plus className="size-4" />
                    {t("pmAddAddon")}
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => setGroups((a) => [...a, { name: "", items: [{ name: "", price: "" }] }])}>
                <Plus className="size-4" />
                {t("pmAddGroup")}
              </Button>
            </div>
          )}

          {!isFood && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("stock")} error={errors["stock"]}>
                  <Input inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value.replace(/\D/g, ""))} className="num rounded-xl" />
                </Field>
                <Field label={t("lowStockThreshold")}>
                  <Input inputMode="numeric" value={threshold} onChange={(e) => setThreshold(e.target.value.replace(/\D/g, ""))} className="num rounded-xl" />
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
              <label className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
                <span>
                  <span className="block text-sm font-bold text-foreground">{t("mrpItem")}</span>
                  <span className="block text-xs text-muted-foreground">{t("mrpItemHelp")}</span>
                </span>
                <Switch checked={isMrp} onCheckedChange={setIsMrp} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("gstRate")}>
                  <Input inputMode="decimal" value={gstRate} onChange={(e) => setGstRate(e.target.value.replace(/[^0-9.]/g, ""))} className="num rounded-xl" />
                </Field>
                <Field label={t("hsn")}>
                  <Input value={hsn} onChange={(e) => setHsn(e.target.value.toUpperCase())} className="num rounded-xl" />
                </Field>
              </div>
            </>
          )}

          <p className="rounded-xl bg-primary-soft px-3 py-2 text-xs font-semibold text-accent-foreground">{t("pmWillBeLive")}</p>

          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button
              className="flex-1 rounded-xl font-bold"
              disabled={save.isPending || uploading}
              onClick={() => {
                if (validate()) {
                  hapticImpact("medium");
                  save.mutate();
                }
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

function PairRow({ value, onChange, onRemove }: { value: VariantDraft; onChange: (v: VariantDraft) => void; onRemove: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex gap-2">
      <Input value={value.name} placeholder={t("pmVariantName")} onChange={(e) => onChange({ ...value, name: e.target.value })} className="flex-1 rounded-xl" />
      <Input
        inputMode="decimal"
        value={value.price}
        placeholder="₹"
        onChange={(e) => onChange({ ...value, price: e.target.value.replace(/[^0-9.]/g, "") })}
        className="num w-24 rounded-xl"
      />
      <IconBtn label={t("delete")} onClick={onRemove}>
        <X className="size-4" />
      </IconBtn>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string | undefined; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-bold">{label}</Label>
      {children}
      {error && <p className="text-xs font-bold text-destructive">{error}</p>}
    </div>
  );
}
