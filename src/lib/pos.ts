import type { Database } from "@/integrations/supabase/types";

export type Product = Database["public"]["Tables"]["products"]["Row"];
export type PaymentMode = Database["public"]["Tables"]["payment_modes"]["Row"];
export type OfflineSale = Database["public"]["Tables"]["offline_sales"]["Row"];
export type OfflineSaleItem = Database["public"]["Tables"]["offline_sale_items"]["Row"];

export type CartLine = {
  product: Product;
  quantity: number;
  /** GST % applied to this line (0 when the merchant is not GST registered). */
  gstRate: number;
};

export type CartTotals = {
  subtotal: number;
  discount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  total: number;
  lines: { line: CartLine; taxable: number; tax: number }[];
};

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Mirrors the totals computed by the `merchant_create_offline_sale` RPC so the
 * cart preview and the stored invoice always agree.
 */
export function cartTotals(
  lines: CartLine[],
  discountInput: number,
  discountMode: "flat" | "percent",
  gstRegistered: boolean,
): CartTotals {
  const subtotal = r2(lines.reduce((s, l) => s + Number(l.product.price) * l.quantity, 0));
  const raw =
    discountMode === "percent" ? (subtotal * Math.max(discountInput, 0)) / 100 : Math.max(discountInput, 0);
  const discount = r2(Math.min(raw, subtotal));
  const ratio = subtotal > 0 ? (subtotal - discount) / subtotal : 0;

  let taxable = 0;
  let tax = 0;
  const detail = lines.map((line) => {
    const lineTaxable = r2(Number(line.product.price) * line.quantity * ratio);
    const rate = gstRegistered ? Math.max(line.gstRate, 0) : 0;
    const lineTax = r2((lineTaxable * rate) / 100);
    taxable += lineTaxable;
    tax += lineTax;
    return { line, taxable: lineTaxable, tax: lineTax };
  });

  taxable = r2(taxable);
  tax = r2(tax);
  const cgst = r2(tax / 2);
  return { subtotal, discount, taxable, cgst, sgst: r2(tax - cgst), total: r2(taxable + tax), lines: detail };
}

export const PAYMENT_STATUS_KEY = {
  paid: "payPaid",
  partial: "payPartial",
  due: "payDue",
} as const;