import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Minus, Plus, Printer, Receipt, Search, ShoppingCart, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { hapticNotify } from "@/lib/haptics";
import { AccessDenied, PendingApproval } from "@/components/GateNotice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { inr } from "@/lib/order-status";
import {
  cartTotals,
  PAYMENT_STATUS_KEY,
  type CartLine,
  type OfflineSale,
  type OfflineSaleItem,
  type PaymentMode,
  type Product,
} from "@/lib/pos";
import { PHONE_RE } from "@/lib/validation";
import { useRequireAuth } from "@/lib/use-require-auth";

export const Route = createFileRoute("/pos")({
  head: () => ({
    meta: [
      { title: "Counter billing (POS) — badiyos Merchant Portal" },
      {
        name: "description",
        content:
          "Bill walk-in customers at your counter: pick products, apply a discount, split CGST/SGST and print a GST invoice.",
      },
      { property: "og:title", content: "Counter billing — badiyos Merchant Portal" },
      {
        property: "og:description",
        content: "Offline POS billing with GST invoices, due tracking and shared stock.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PosPage,
});

type Receipt = { sale: OfflineSale; items: OfflineSaleItem[]; modeName: string };

function PosPage() {
  const { t } = useI18n();
  const { can, merchant: authMerchant } = useAuth();
  const merchant = useRequireAuth();
  const queryClient = useQueryClient();
  const allowed = can("manage_orders");
  const gst = Boolean(authMerchant?.is_gst_registered);

  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [discountInput, setDiscountInput] = useState("");
  const [discountMode, setDiscountMode] = useState<"flat" | "percent">("flat");
  const [modeId, setModeId] = useState<string>("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paidInput, setPaidInput] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const products = useQuery({
    queryKey: ["pos-products", merchant?.id],
    enabled: Boolean(merchant?.id) && allowed && merchant?.status === "approved",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as Product[];
    },
  });

  const modes = useQuery({
    queryKey: ["payment-modes"],
    enabled: Boolean(merchant?.id) && allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_modes")
        .select("*")
        .eq("is_active", true)
        .order("is_credit_type")
        .order("name");
      if (error) throw error;
      return data as PaymentMode[];
    },
  });

  const selectedMode = modes.data?.find((m) => m.id === modeId) ?? null;
  const credit = Boolean(selectedMode?.is_credit_type);

  const totals = useMemo(
    () => cartTotals(lines, Number(discountInput) || 0, discountMode, gst),
    [lines, discountInput, discountMode, gst],
  );

  const paid = credit ? Math.min(Math.max(Number(paidInput) || 0, 0), totals.total) : totals.total;
  const due = Math.max(Math.round((totals.total - paid) * 100) / 100, 0);

  const filtered = (products.data ?? []).filter((p) =>
    p.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const addLine = (product: Product) =>
    setLines((prev) => {
      const found = prev.find((l) => l.product.id === product.id);
      if (found)
        return prev.map((l) =>
          l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      return [...prev, { product, quantity: 1, gstRate: Number(product.gst_rate ?? 0) }];
    });

  const setQty = (id: string, qty: number) =>
    setLines((prev) =>
      qty <= 0
        ? prev.filter((l) => l.product.id !== id)
        : prev.map((l) => (l.product.id === id ? { ...l, quantity: qty } : l)),
    );

  const setRate = (id: string, rate: number) =>
    setLines((prev) =>
      prev.map((l) => (l.product.id === id ? { ...l, gstRate: Math.max(rate, 0) } : l)),
    );

  const reset = () => {
    setLines([]);
    setDiscountInput("");
    setDiscountMode("flat");
    setCustomerName("");
    setCustomerPhone("");
    setPaidInput("");
    setModeId("");
  };

  const createSale = useMutation({
    mutationFn: async () => {
      const { data: saleId, error } = await supabase.rpc("merchant_create_offline_sale", {
        _payload: {
          items: lines.map((l) => ({
            product_id: l.product.id,
            quantity: l.quantity,
            gst_rate: gst ? l.gstRate : 0,
          })),
          discount_amount: totals.discount,
          payment_mode_id: modeId,
          customer_name: customerName || null,
          customer_phone: customerPhone || null,
          amount_paid: paid,
        },
      });
      if (error) throw error;

      const [sale, items] = await Promise.all([
        supabase.from("offline_sales").select("*").eq("id", saleId as string).single(),
        supabase.from("offline_sale_items").select("*").eq("sale_id", saleId as string),
      ]);
      if (sale.error) throw sale.error;
      if (items.error) throw items.error;
      return {
        sale: sale.data as OfflineSale,
        items: (items.data ?? []) as OfflineSaleItem[],
        modeName: selectedMode?.name ?? "",
      } satisfies Receipt;
    },
    onSuccess: (data) => {
      toast.success(t("saleDone"));
      setReceipt(data);
      reset();
      void queryClient.invalidateQueries({ queryKey: ["pos-products"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (error: { message?: string }) => {
      const msg = error.message ?? "";
      if (msg.includes("customer_required_for_credit")) toast.error(t("creditNeedsCustomer"));
      else toast.error("Could not create the bill.");
    },
  });

  if (!merchant) return null;

  if (merchant.status !== "approved" || !allowed) {
    return (
      <AppShell title={t("pos")} onRefresh={() => Promise.all([products.refetch(), modes.refetch()])}>
        {merchant.status !== "approved" ? <PendingApproval /> : <AccessDenied />}
      </AppShell>
    );
  }

  if (receipt) {
    return (
      <AppShell title={t("invoice")}>
        <InvoiceView
          receipt={receipt}
          storeName={merchant.store_name ?? "badiyos"}
          gstin={merchant.is_gst_registered ? merchant.gstin : null}
          address={[merchant.address, merchant.city, merchant.state].filter(Boolean).join(", ")}
          onNew={() => setReceipt(null)}
        />
      </AppShell>
    );
  }

  const phoneError = customerPhone.length > 0 && !PHONE_RE.test(customerPhone);
  const canConfirm =
    lines.length > 0 &&
    Boolean(modeId) &&
    !phoneError &&
    (!credit || due <= 0 || (customerName.trim().length > 0 && PHONE_RE.test(customerPhone)));

  return (
    <AppShell title={t("pos")}>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-extrabold text-foreground">{t("posTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("posSub")}</p>
        </div>

        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchProduct")}
            className="pl-9"
          />
        </div>

        {products.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            {t("noPosProducts")}
          </p>
        ) : (
          <div className="grid max-h-72 grid-cols-2 gap-3 overflow-y-auto pr-1">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => addLine(p)}
                className="rounded-2xl border border-border bg-card p-4 text-left shadow-card transition-colors hover:border-primary"
              >
                <p className="truncate text-sm font-bold text-foreground">{p.name}</p>
                <p className="num text-sm font-extrabold text-primary">{inr(p.price)}</p>
                <p className="num text-[11px] font-semibold text-muted-foreground">
                  {p.stock_quantity} {p.unit ?? ""}
                </p>
              </button>
            ))}
          </div>
        )}

        <section className="rounded-3xl border border-border bg-card p-5 shadow-card">
          <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
            <ShoppingCart className="size-5 text-primary" />
            {t("cart")}
          </h2>

          {lines.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{t("emptyCart")}</p>
          ) : (
            <ul className="mt-4 space-y-4">
              {totals.lines.map(({ line, taxable }) => (
                <li key={line.product.id} className="space-y-2 border-b border-border pb-4 last:border-0">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-foreground">{line.product.name}</p>
                      <p className="num text-xs text-muted-foreground">
                        {inr(line.product.price)} × {line.quantity} = {inr(taxable)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="icon"
                        variant="outline"
                        className="size-8"
                        onClick={() => setQty(line.product.id, line.quantity - 1)}
                        aria-label={t("qty")}
                      >
                        <Minus className="size-4" />
                      </Button>
                      <span className="num w-6 text-center text-sm font-bold">{line.quantity}</span>
                      <Button
                        size="icon"
                        variant="outline"
                        className="size-8"
                        onClick={() => setQty(line.product.id, line.quantity + 1)}
                        aria-label={t("qty")}
                      >
                        <Plus className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-destructive"
                        onClick={() => setQty(line.product.id, 0)}
                        aria-label={t("remove")}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                  {gst && (
                    <div className="flex items-center gap-2">
                      <Label className="text-[11px] font-semibold text-muted-foreground">
                        {t("gstRate")}
                      </Label>
                      <Input
                        inputMode="decimal"
                        value={String(line.gstRate)}
                        onChange={(e) => setRate(line.product.id, Number(e.target.value) || 0)}
                        className="num h-8 w-20"
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 space-y-3">
            <Label className="text-xs font-bold text-muted-foreground">{t("discount")}</Label>
            <div className="flex gap-2">
              <Input
                inputMode="decimal"
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
                placeholder="0"
                className="num"
              />
              <div className="flex overflow-hidden rounded-xl border border-border">
                {(["flat", "percent"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setDiscountMode(m)}
                    className={`px-3 text-xs font-bold ${
                      discountMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {m === "flat" ? t("discountFlat") : t("discountPercent")}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <dl className="num mt-5 space-y-2 text-sm">
            <Row label={t("subtotal")} value={inr(totals.subtotal)} />
            {totals.discount > 0 && <Row label={t("discount")} value={`− ${inr(totals.discount)}`} />}
            {gst && (
              <>
                <Row label={t("taxable")} value={inr(totals.taxable)} />
                <Row label={t("cgst")} value={inr(totals.cgst)} />
                <Row label={t("sgst")} value={inr(totals.sgst)} />
              </>
            )}
            <div className="flex items-center justify-between border-t border-border pt-2 text-base font-extrabold text-foreground">
              <span>{t("grandTotal")}</span>
              <span>{inr(totals.total)}</span>
            </div>
          </dl>
        </section>

        <section className="space-y-4 rounded-3xl border border-border bg-card p-5 shadow-card">
          <h2 className="text-base font-bold text-foreground">{t("payment")}</h2>
          <div>
            <Label className="text-xs font-bold text-muted-foreground">{t("paymentMode")}</Label>
            <Select value={modeId} onValueChange={setModeId}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder={t("paymentMode")} />
              </SelectTrigger>
              <SelectContent>
                {(modes.data ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {credit && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs font-bold text-muted-foreground">{t("customerName")}</Label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="mt-2"
                />
              </div>
              <div>
                <Label className="text-xs font-bold text-muted-foreground">{t("customerPhone")}</Label>
                <Input
                  inputMode="numeric"
                  maxLength={10}
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, ""))}
                  className="num mt-2"
                />
                {phoneError && (
                  <p className="mt-1 text-xs font-semibold text-destructive">
                    Enter a valid 10-digit number starting with 6-9
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs font-bold text-muted-foreground">{t("amountPaid")}</Label>
                <Input
                  inputMode="decimal"
                  value={paidInput}
                  onChange={(e) => setPaidInput(e.target.value)}
                  placeholder="0"
                  className="num mt-2"
                />
                <p className="num mt-2 text-sm font-bold text-destructive">
                  {t("amountDue")}: {inr(due)}
                </p>
              </div>
            </div>
          )}

          <Button
            size="lg"
            className="w-full"
            disabled={!canConfirm || createSale.isPending}
            onClick={() => {
              hapticNotify("success");
              createSale.mutate();
            }}
          >
            {createSale.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Receipt className="size-4" />
            )}
            {t("confirmSale")}
          </Button>
        </section>
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <dt>{label}</dt>
      <dd className="font-bold text-foreground">{value}</dd>
    </div>
  );
}

function InvoiceView({
  receipt,
  storeName,
  gstin,
  address,
  onNew,
}: {
  receipt: Receipt;
  storeName: string;
  gstin: string | null;
  address: string;
  onNew: () => void;
}) {
  const { t } = useI18n();
  const { sale, items, modeName } = receipt;

  return (
    <div className="space-y-4">
      <div id="receipt" className="rounded-3xl border border-border bg-card p-6 shadow-card">
        <div className="text-center">
          <p className="text-lg font-extrabold text-foreground">{storeName}</p>
          {address && <p className="text-xs text-muted-foreground">{address}</p>}
          {gstin && <p className="num text-xs font-semibold text-muted-foreground">GSTIN: {gstin}</p>}
        </div>

        <div className="num mt-4 flex justify-between border-y border-border py-2 text-xs font-semibold text-muted-foreground">
          <span>
            {t("invoiceNo")} {sale.invoice_number}
          </span>
          <span>{new Date(sale.created_at).toLocaleString("en-IN")}</span>
        </div>

        <table className="mt-4 w-full text-left text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="pb-2">{t("productName")}</th>
              <th className="pb-2">{t("hsn")}</th>
              <th className="pb-2 text-right">{t("qty")}</th>
              <th className="pb-2 text-right">{t("total")}</th>
            </tr>
          </thead>
          <tbody className="num">
            {items.map((it) => (
              <tr key={it.id} className="border-t border-border">
                <td className="py-2 font-semibold text-foreground">{it.product_name_snapshot}</td>
                <td className="py-2 text-muted-foreground">{it.hsn_sac_snapshot ?? "—"}</td>
                <td className="py-2 text-right">{it.quantity}</td>
                <td className="py-2 text-right font-bold">
                  {inr(Number(it.price_snapshot) * it.quantity)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="num mt-4 space-y-2 border-t border-border pt-4 text-sm">
          <Row label={t("subtotal")} value={inr(sale.subtotal)} />
          {Number(sale.discount_amount) > 0 && (
            <Row label={t("discount")} value={`− ${inr(sale.discount_amount)}`} />
          )}
          {Number(sale.cgst_amount) > 0 && (
            <>
              <Row label={t("cgst")} value={inr(sale.cgst_amount)} />
              <Row label={t("sgst")} value={inr(sale.sgst_amount)} />
            </>
          )}
          <div className="flex items-center justify-between border-t border-border pt-2 text-base font-extrabold text-foreground">
            <span>{t("grandTotal")}</span>
            <span>{inr(sale.total_amount)}</span>
          </div>
          <Row label={t("paymentMode")} value={modeName} />
          <Row
            label={t("payment")}
            value={t(PAYMENT_STATUS_KEY[sale.payment_status as keyof typeof PAYMENT_STATUS_KEY] ?? "payPaid")}
          />
          {Number(sale.amount_due) > 0 && (
            <Row label={t("amountDue")} value={inr(sale.amount_due)} />
          )}
          {sale.customer_name && <Row label={t("customerName")} value={sale.customer_name} />}
          {sale.customer_phone && <Row label={t("customerPhone")} value={sale.customer_phone} />}
        </dl>

        <p className="mt-4 text-center text-xs font-semibold text-muted-foreground">{t("thankYou")}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 print:hidden">
        <Button variant="outline" size="lg" onClick={() => window.print()}>
          <Printer className="size-4" />
          {t("printInvoice")}
        </Button>
        <Button size="lg" onClick={onNew}>
          <Plus className="size-4" />
          {t("newBill")}
        </Button>
      </div>
    </div>
  );
}
