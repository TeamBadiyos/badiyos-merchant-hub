import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Banknote, Download, Loader2, Share2, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { BankChange } from "@/components/BankChange";
import { AccessDenied, PendingApproval } from "@/components/GateNotice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { friendlyErrorMessage } from "@/lib/friendly-error";
import { useI18n } from "@/lib/i18n";
import { inr } from "@/lib/order-status";
import { useRequireAuth } from "@/lib/use-require-auth";

export const Route = createFileRoute("/wallet")({
  head: () => ({
    meta: [
      { title: "Money — badiyos Merchant Portal" },
      { name: "description", content: "Next payout, instant settlement, ledger, settlement statements and commission invoices for your shop." },
      { property: "og:title", content: "Money — badiyos Merchant Portal" },
      { property: "og:description", content: "Payouts, ledger, statements and invoices for your shop." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MoneyPage,
});

const TX = {
  en: {
    title: "Money", nextPayout: "Next payout", carry: "will carry forward", sales: "Sales", deductions: "Deductions",
    receive: "You'll receive", thisWeek: "This week", month: "Month", custom: "Custom", all: "All",
    instantTitle: "Instant settlement", instantAvail: "Available now (orders up to yesterday)", getNow: "Get it now",
    confirmTitle: "Get money now?", confirmBody: "This amount will be sent to your bank today.",
    confirm: "Confirm", cancel: "Cancel", requested: "Instant request today", ledger: "Ledger", noLedger: "No transactions yet",
    settlements: "Settlements", noSettlements: "No settlements yet", invoices: "Commission invoices", noInvoices: "No invoices yet",
    bank: "Bank account", changeBank: "Change bank", changeBankNote: "Bank changes are approved by badiyos. Raise a request in Help.",
    balance: "Bal", paid: "Paid", utr: "UTR", statement: "Statement", orders: "Orders", adjustments: "Adjustments",
    roundOff: "Round-off carried", downloadPdf: "Download PDF", share: "Share", moneySplit: "Money split",
    itemTotal: "Item total", commission: "Commission", gst: "GST", tcs: "TCS", tds: "TDS", net: "Net",
    fee: "Instant fee", youGet: "You'll get", from: "From", to: "To", nothingToSettle: "Nothing to settle right now", instantDone: "Instant settlement requested",
  },
  mr: {
    title: "पैसे", nextPayout: "पुढील पेमेंट", carry: "पुढे जमा होईल", sales: "विक्री", deductions: "कपात",
    receive: "तुम्हाला मिळेल", thisWeek: "हा आठवडा", month: "महिना", custom: "निवडा", all: "सर्व",
    instantTitle: "त्वरित सेटलमेंट", instantAvail: "आता उपलब्ध (कालपर्यंतच्या ऑर्डर)", getNow: "आता घ्या",
    confirmTitle: "आता पैसे घ्यायचे?", confirmBody: "ही रक्कम आज तुमच्या बँकेत पाठवली जाईल.",
    confirm: "पुष्टी करा", cancel: "रद्द करा", requested: "आजची त्वरित विनंती", ledger: "खातेवही", noLedger: "अजून व्यवहार नाहीत",
    settlements: "सेटलमेंट", noSettlements: "अजून सेटलमेंट नाहीत", invoices: "कमिशन बिले", noInvoices: "अजून बिले नाहीत",
    bank: "बँक खाते", changeBank: "बँक बदला", changeBankNote: "बँक बदल badiyos मंजूर करते. मदत विभागात विनंती करा.",
    balance: "शिल्लक", paid: "दिले", utr: "UTR", statement: "स्टेटमेंट", orders: "ऑर्डर", adjustments: "समायोजन",
    roundOff: "राउंड-ऑफ पुढे", downloadPdf: "PDF डाउनलोड", share: "शेअर", moneySplit: "पैशांचे विभाजन",
    itemTotal: "वस्तू एकूण", commission: "कमिशन", gst: "GST", tcs: "TCS", tds: "TDS", net: "निव्वळ",
    fee: "त्वरित शुल्क", youGet: "तुम्हाला मिळेल", from: "पासून", to: "पर्यंत", nothingToSettle: "आत्ता सेटल करण्यासारखे काही नाही", instantDone: "त्वरित सेटलमेंट विनंती केली",
  },
} as const;

const TYPE_LABEL: Record<string, { en: string; mr: string }> = {
  sale: { en: "Sale", mr: "विक्री" },
  commission: { en: "Commission", mr: "कमिशन" },
  commission_gst: { en: "GST", mr: "GST" },
  tcs: { en: "TCS", mr: "TCS" },
  tds: { en: "TDS", mr: "TDS" },
  refund: { en: "Refund", mr: "परतावा" },
  instant_fee: { en: "Instant fee", mr: "त्वरित शुल्क" },
  instant_fee_gst: { en: "Instant fee GST", mr: "त्वरित शुल्क GST" },
  adjustment: { en: "Adjustment", mr: "समायोजन" },
  payout: { en: "Payout", mr: "पेमेंट" },
  round_off_carried: { en: "Round-off carried", mr: "राउंड-ऑफ पुढे" },
};
const CHIPS: { key: string; types: string[] }[] = [
  { key: "sale", types: ["sale"] },
  { key: "commission", types: ["commission"] },
  { key: "commission_gst", types: ["commission_gst"] },
  { key: "tcs", types: ["tcs"] },
  { key: "tds", types: ["tds"] },
  { key: "refund", types: ["refund"] },
  { key: "instant_fee", types: ["instant_fee", "instant_fee_gst"] },
  { key: "payout", types: ["payout"] },
  { key: "round_off_carried", types: ["round_off_carried"] },
];

type Summary = {
  week_sales: number; week_deductions: number; you_will_receive: number; next_payout_date: string;
  next_payout_estimate: number; carry_forward_estimate: number;
};
type LedgerRow = {
  id: string; entry_type: string; amount: number; info_amount: number | null; order_id: string | null;
  order_number: string | null; settlement_id: string | null; invoice_no: string | null; entry_at: string; running_balance: number;
};
type SettlementRow = {
  id: string; type: string; run_date: string | null; created_at: string; net_amount: number; status: string;
  reference: string | null; invoice_no: string | null; round_off_carried: number | null; order_count: number;
};
type Invoice = { settlement_id: string; invoice_no: string; invoice_fy: string; date: string; commission: number; commission_gst: number; instant_fee: number; instant_fee_gst: number };
type Preview = { available: number; order_count: number; fee_pct: number; fee: number; fee_gst_pct: number; fee_gst: number; you_get: number; already_today: boolean };

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtDate = (s: string, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" }) =>
  new Date(s).toLocaleDateString("en-IN", opts);

function MoneyPage() {
  const { lang } = useI18n();
  const L = TX[lang === "mr" ? "mr" : "en"];
  const tl = (k: string) => TYPE_LABEL[k]?.[lang === "mr" ? "mr" : "en"] ?? k;
  const { context } = useAuth();
  const merchant = useRequireAuth();
  const qc = useQueryClient();
  const sid = merchant?.id;
  const enabled = Boolean(sid) && context.isOwner && merchant?.status === "approved";

  const [range, setRange] = useState<"week" | "month" | "custom">("week");
  const [from, setFrom] = useState(ymd(new Date(Date.now() - 6 * 864e5)));
  const [to, setTo] = useState(ymd(new Date()));
  const [chip, setChip] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [settlementId, setSettlementId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const dates = useMemo(() => {
    const now = new Date();
    if (range === "week") {
      const d = new Date(now); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow);
      return { from: ymd(d), to: ymd(now) };
    }
    if (range === "month") return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(now) };
    return { from, to };
  }, [range, from, to]);
  const types = chip ? CHIPS.find((c) => c.key === chip)?.types ?? null : null;

  const summary = useQuery({
    queryKey: ["money", "summary", sid], enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("merchant_settlement_summary", { _store_id: sid! });
      if (error) throw error;
      return data as unknown as Summary;
    },
  });
  const ledger = useQuery({
    queryKey: ["money", "ledger", sid, dates.from, dates.to, chip], enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("merchant_ledger", {
        _store_id: sid!, _from: dates.from, _to: dates.to, ...(types ? { _types: types } : {}), _limit: 200, _offset: 0,
      });
      if (error) throw error;
      return (data as unknown as { rows: LedgerRow[] }).rows ?? [];
    },
  });
  const settlements = useQuery({
    queryKey: ["money", "settlements", sid], enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("merchant_settlements_list", { _store_id: sid!, _limit: 50, _offset: 0 });
      if (error) throw error;
      return (data as unknown as { rows: SettlementRow[] }).rows ?? [];
    },
  });
  const invoices = useQuery({
    queryKey: ["money", "invoices", sid], enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("merchant_commission_invoices", { _store_id: sid!, _limit: 50, _offset: 0 });
      if (error) throw error;
      return (data as unknown as Invoice[]) ?? [];
    },
  });

  const preview = useQuery({
    queryKey: ["money", "instant-preview", sid], enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("merchant_instant_settlement_preview" as never, { _store_id: sid! } as never);
      if (error) throw error;
      return data as unknown as Preview;
    },
  });
  const pv = preview.data;

  const refreshAll = () => qc.invalidateQueries({ queryKey: ["money"] });

  if (!merchant) return null;

  const today = ymd(new Date());
  const todayInstant = (settlements.data ?? []).find((s) => s.type === "instant" && (s.run_date ?? s.created_at.slice(0, 10)) === today);
  const s = summary.data;

  const requestInstant = async () => {
    setRequesting(true);
    try {
      const { data, error } = await supabase.rpc("request_instant_settlement", { _store_id: sid! });
      if (error) throw error;
      const r = data as { ok: boolean; error?: string; net_amount?: number };
      if (!r.ok) toast.info(L.nothingToSettle);
      else toast.success(`${L.instantDone} · ${inr(r.net_amount ?? 0)}`);
      setConfirmOpen(false);
      await refreshAll();
    } catch (e) {
      toast.error(friendlyErrorMessage(e));
    } finally {
      setRequesting(false);
    }
  };

  const grouped = (ledger.data ?? []).reduce<Record<string, LedgerRow[]>>((acc, r) => {
    const k = fmtDate(r.entry_at); (acc[k] ??= []).push(r); return acc;
  }, {});

  const acct = merchant.bank_account_number;

  return (
    <AppShell title={L.title} onRefresh={refreshAll}>
      {merchant.status !== "approved" ? <PendingApproval /> : !context.isOwner ? <AccessDenied /> : (
        <div className="space-y-6">
          {/* 1. Next payout */}
          <section className="rounded-3xl bg-primary p-5 text-primary-foreground shadow-card">
            <p className="text-xs font-bold uppercase opacity-80">
              {L.nextPayout}{s ? ` · ${fmtDate(s.next_payout_date, { weekday: "short", day: "numeric", month: "short" })}` : ""}
            </p>
            <p className="num mt-2 text-4xl font-extrabold">{s ? inr(s.next_payout_estimate) : "—"}</p>
            {s && Number(s.carry_forward_estimate) > 0 && (
              <p className="mt-1 text-xs font-semibold opacity-90">{inr(s.carry_forward_estimate)} {L.carry}</p>
            )}
            <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-primary-foreground/10 p-3 text-center">
              {[[L.sales, s?.week_sales], [L.deductions, s?.week_deductions], [L.receive, s?.you_will_receive]].map(([l, v]) => (
                <div key={l as string}>
                  <p className="num text-sm font-extrabold">{v == null ? "—" : inr(v as number)}</p>
                  <p className="text-[11px] font-semibold opacity-80">{l}</p>
                </div>
              ))}
            </div>
          </section>

          {/* 2. Instant */}
          {(todayInstant || (pv && Number(pv.available) > 0)) && (
            <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
              <div className="flex items-center gap-2">
                <Zap className="size-5 text-primary" />
                <h2 className="text-base font-bold text-foreground">{L.instantTitle}</h2>
              </div>
              {todayInstant ? (
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-muted-foreground">{L.requested}</p>
                  <p className="num text-lg font-extrabold text-foreground">{inr(todayInstant.net_amount)} · <span className="text-xs capitalize">{todayInstant.status}</span></p>
                </div>
              ) : pv && (
                <>
                  <InstantBreakdown pv={pv} L={L} />
                  <Button className="mt-3 h-12 w-full rounded-xl text-base font-bold" onClick={() => setConfirmOpen(true)}>{L.getNow}</Button>
                </>
              )}
            </section>
          )}

          {/* 3. Ledger */}
          <section className="space-y-3">
            <h2 className="text-base font-bold text-foreground">{L.ledger}</h2>
            <div className="flex gap-2">
              {(["week", "month", "custom"] as const).map((r) => (
                <button key={r} onClick={() => setRange(r)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${range === r ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {r === "week" ? L.thisWeek : r === "month" ? L.month : L.custom}
                </button>
              ))}
            </div>
            {range === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" aria-label={L.from} value={from} onChange={(e) => setFrom(e.target.value)} />
                <Input type="date" aria-label={L.to} value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            )}
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              <button onClick={() => setChip(null)} className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${!chip ? "border-primary bg-primary-soft text-primary" : "border-border text-muted-foreground"}`}>{L.all}</button>
              {CHIPS.map((c) => (
                <button key={c.key} onClick={() => setChip(c.key)} className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${chip === c.key ? "border-primary bg-primary-soft text-primary" : "border-border text-muted-foreground"}`}>{tl(c.key)}</button>
              ))}
            </div>
            {ledger.isLoading ? <Spinner /> : (ledger.data ?? []).length === 0 ? <Empty text={L.noLedger} /> : (
              Object.entries(grouped).map(([day, rows]) => (
                <div key={day}>
                  <p className="mb-1 text-xs font-bold text-muted-foreground">{day}</p>
                  <div className="divide-y divide-border rounded-2xl border border-border bg-card">
                    {rows.map((r) => {
                      const amt = Number(r.amount);
                      const tappable = r.entry_type === "sale" && r.order_id;
                      return (
                        <button key={r.id} disabled={!tappable} onClick={() => tappable && setOrderId(r.order_id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-foreground">{tl(r.entry_type)}</p>
                            <p className="num truncate text-xs text-muted-foreground">{r.order_number ? `#${r.order_number}` : r.invoice_no ?? ""}</p>
                          </div>
                          <div className="text-right">
                            <p className={`num text-sm font-extrabold ${r.entry_type === "round_off_carried" ? "text-muted-foreground" : amt >= 0 ? "text-success" : "text-destructive"}`}>
                              {r.entry_type === "round_off_carried" ? inr(r.info_amount ?? 0) : `${amt >= 0 ? "+" : "−"}${inr(Math.abs(amt))}`}
                            </p>
                            <p className="num text-[11px] text-muted-foreground">{L.balance} {inr(r.running_balance)}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </section>

          {/* 4. Settlements */}
          <section className="space-y-3">
            <h2 className="text-base font-bold text-foreground">{L.settlements}</h2>
            {settlements.isLoading ? <Spinner /> : (settlements.data ?? []).length === 0 ? <Empty text={L.noSettlements} /> : (
              <div className="divide-y divide-border rounded-2xl border border-border bg-card">
                {(settlements.data ?? []).map((st) => (
                  <button key={st.id} onClick={() => setSettlementId(st.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-foreground">
                        {fmtDate(st.run_date ?? st.created_at)} · {st.type === "instant" ? "Instant" : fmtDate(st.run_date ?? st.created_at, { weekday: "short" })}
                      </p>
                      <p className="num truncate text-xs text-muted-foreground">
                        <span className="capitalize">{st.status.replace("_", " ")}</span>
                        {st.reference ? ` · ${L.utr} ${st.reference}` : ""}
                        {Number(st.round_off_carried) > 0 ? ` · ${inr(st.round_off_carried!)} ${L.carry}` : ""}
                      </p>
                    </div>
                    <p className="num text-base font-extrabold text-foreground">{inr(st.net_amount)}</p>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* 5. Invoices */}
          <section className="space-y-3">
            <h2 className="text-base font-bold text-foreground">{L.invoices}</h2>
            {invoices.isLoading ? <Spinner /> : (invoices.data ?? []).length === 0 ? <Empty text={L.noInvoices} /> : (
              <div className="divide-y divide-border rounded-2xl border border-border bg-card">
                {(invoices.data ?? []).map((inv) => (
                  <div key={inv.settlement_id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="num text-sm font-bold text-foreground">{inv.invoice_no}</p>
                      <p className="text-xs text-muted-foreground">{fmtDate(inv.date)}</p>
                    </div>
                    <p className="num text-sm font-extrabold">{inr(Number(inv.commission) + Number(inv.commission_gst) + Number(inv.instant_fee) + Number(inv.instant_fee_gst))}</p>
                    <Button size="icon" variant="ghost" aria-label={L.downloadPdf} onClick={() => void invoicePdf(inv, merchant.store_name ?? "")}>
                      <Download className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 6. Bank */}
          <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <div className="flex items-center gap-2">
              <Banknote className="size-5 text-primary" />
              <h2 className="text-base font-bold text-foreground">{L.bank}</h2>
            </div>
            <p className="num mt-3 text-lg font-extrabold text-foreground">{acct ? `•••• ${acct.slice(-4)}` : "—"}</p>
            <p className="num text-xs font-semibold text-muted-foreground">{merchant.bank_ifsc ?? "—"} · {merchant.bank_account_holder_name ?? ""}</p>
            <BankChange storeId={merchant.id} />
          </section>
        </div>
      )}

      <Sheet open={confirmOpen} onOpenChange={setConfirmOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader><SheetTitle>{L.confirmTitle}</SheetTitle></SheetHeader>
          <div className="px-4">{pv && <InstantBreakdown pv={pv} L={L} />}<p className="mt-2 text-sm text-muted-foreground">{L.confirmBody}</p></div>
          <div className="flex gap-2 p-4">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmOpen(false)}>{L.cancel}</Button>
            <Button className="flex-1" disabled={requesting} onClick={() => void requestInstant()}>
              {requesting && <Loader2 className="size-4 animate-spin" />}{L.confirm}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <OrderSplitSheet orderId={orderId} onClose={() => setOrderId(null)} L={L} />
      <StatementSheet settlementId={settlementId} onClose={() => setSettlementId(null)} L={L} />
    </AppShell>
  );
}

type Dict = (typeof TX)["en"] | (typeof TX)["mr"];

function InstantBreakdown({ pv, L }: { pv: Preview; L: Dict }) {
  return (
    <div className="mt-2">
      <p className="text-xs font-semibold text-muted-foreground">{L.instantAvail}</p>
      <p className="num text-2xl font-extrabold text-foreground">{inr(pv.available)}</p>
      <Line label={`${L.fee} ${Number(pv.fee_pct)}% + ${Number(pv.fee_gst_pct)}% GST`} value={`−${inr(Number(pv.fee) + Number(pv.fee_gst))}`} />
      <Line label={L.youGet} value={inr(pv.you_get)} strong />
    </div>
  );
}

function Spinner() {
  return <div className="flex justify-center py-6"><Loader2 className="size-6 animate-spin text-primary" /></div>;
}
function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-border py-6 text-center text-sm text-muted-foreground">{text}</p>;
}
function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`num ${strong ? "font-extrabold text-foreground" : "font-semibold"}`}>{value}</span>
    </div>
  );
}

function OrderSplitSheet({ orderId, onClose, L }: { orderId: string | null; onClose: () => void; L: Dict }) {
  const q = useQuery({
    queryKey: ["money", "order", orderId], enabled: Boolean(orderId),
    queryFn: async () => {
      const { data, error } = await supabase.from("merchant_orders")
        .select("order_number, items_total, commission_amount, commission_gst_amount, tcs_amount, tds_amount, merchant_net")
        .eq("id", orderId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const o = q.data;
  return (
    <Sheet open={Boolean(orderId)} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader><SheetTitle>{L.moneySplit}{o?.order_number ? ` · #${o.order_number}` : ""}</SheetTitle></SheetHeader>
        <div className="px-4 pb-6">
          {!o ? <Spinner /> : (
            <>
              <Line label={L.itemTotal} value={inr(o.items_total ?? 0)} />
              <Line label={L.commission} value={`−${inr(o.commission_amount ?? 0)}`} />
              <Line label={L.gst} value={`−${inr(o.commission_gst_amount ?? 0)}`} />
              <Line label={L.tcs} value={`−${inr(o.tcs_amount ?? 0)}`} />
              <Line label={L.tds} value={`−${inr(o.tds_amount ?? 0)}`} />
              <div className="mt-1 border-t border-border pt-1"><Line label={L.net} value={inr(o.merchant_net ?? 0)} strong /></div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

type Statement = {
  settlement: SettlementRow & { gross_amount: number; commission_total: number; commission_gst_total: number; tcs_total: number; tds_total: number; instant_fee: number; instant_fee_gst: number; adjustment_total: number; period_from: string | null; period_to: string | null };
  merchant: { name: string; gstin: string | null; pan: string | null; address: string | null };
  orders: { order_number: string; delivered_at: string; items_total: number; commission: number; commission_gst: number; tcs: number; tds: number; net: number }[];
  adjustments: { amount: number; reason: string }[];
  round_off_carried: number | null;
};

function StatementSheet({ settlementId, onClose, L }: { settlementId: string | null; onClose: () => void; L: Dict }) {
  const q = useQuery({
    queryKey: ["money", "statement", settlementId], enabled: Boolean(settlementId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("merchant_settlement_statement", { _settlement_id: settlementId! });
      if (error) throw error;
      return data as unknown as Statement;
    },
  });
  const d = q.data;
  const st = d?.settlement;
  return (
    <Sheet open={Boolean(settlementId)} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-3xl">
        <SheetHeader><SheetTitle>{L.statement}{st?.invoice_no ? ` · ${st.invoice_no}` : ""}</SheetTitle></SheetHeader>
        <div className="px-4 pb-6">
          {!d || !st ? <Spinner /> : (
            <>
              <p className="num text-3xl font-extrabold text-primary">{inr(st.net_amount)}</p>
              <p className="text-xs text-muted-foreground">{st.reference ? `${L.utr} ${st.reference} · ` : ""}<span className="capitalize">{st.status}</span></p>
              <div className="mt-4">
                <Line label={L.sales} value={inr(st.gross_amount)} />
                <Line label={L.commission} value={`−${inr(st.commission_total)}`} />
                <Line label={L.gst} value={`−${inr(st.commission_gst_total)}`} />
                <Line label={L.tcs} value={`−${inr(st.tcs_total)}`} />
                <Line label={L.tds} value={`−${inr(st.tds_total)}`} />
                {Number(st.instant_fee) > 0 && <Line label={"Instant fee"} value={`−${inr(Number(st.instant_fee) + Number(st.instant_fee_gst))}`} />}
                {Number(st.adjustment_total) !== 0 && <Line label={L.adjustments} value={inr(st.adjustment_total)} />}
                {Number(d.round_off_carried) > 0 && <Line label={L.roundOff} value={inr(d.round_off_carried!)} />}
                <div className="border-t border-border pt-1"><Line label={L.paid} value={inr(st.net_amount)} strong /></div>
              </div>
              <p className="mt-4 text-xs font-bold text-muted-foreground">{L.orders} ({d.orders.length})</p>
              <div className="divide-y divide-border">
                {d.orders.map((o) => (
                  <div key={o.order_number} className="flex justify-between py-2 text-sm">
                    <span className="num">#{o.order_number}</span>
                    <span className="num font-semibold">{inr(o.net)}</span>
                  </div>
                ))}
              </div>
              {d.adjustments.length > 0 && (
                <>
                  <p className="mt-4 text-xs font-bold text-muted-foreground">{L.adjustments}</p>
                  {d.adjustments.map((a, i) => <Line key={i} label={a.reason} value={inr(a.amount)} />)}
                </>
              )}
              <div className="mt-5 flex gap-2">
                <Button className="flex-1 rounded-xl" onClick={() => void statementPdf(d, "save")}><Download className="size-4" />{L.downloadPdf}</Button>
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => void statementPdf(d, "share")}><Share2 className="size-4" />{L.share}</Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

const rs = (n: number | null | undefined) => `Rs ${Number(n ?? 0).toFixed(2)}`;

async function outputPdf(pdf: import("jspdf").jsPDF, name: string, mode: "save" | "share") {
  if (mode === "share") {
    const file = new File([pdf.output("blob")], name, { type: "application/pdf" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name }).catch(() => {});
      return;
    }
  }
  pdf.save(name);
}

/** Lays out the backend statement exactly as returned — no amounts are computed here. */
async function statementPdf(d: Statement, mode: "save" | "share") {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF();
  const st = d.settlement;
  let y = 18;
  const line = (l: string, v = "", bold = false) => {
    if (y > 280) { pdf.addPage(); y = 18; }
    pdf.setFont("helvetica", bold ? "bold" : "normal"); pdf.text(l, 14, y); if (v) pdf.text(v, 196, y, { align: "right" }); y += 7;
  };
  pdf.setFontSize(16); line("badiyos — Settlement statement", "", true); pdf.setFontSize(10);
  line(d.merchant.name ?? ""); if (d.merchant.gstin) line(`GSTIN ${d.merchant.gstin}`);
  line(`Statement ${st.invoice_no ?? st.id}`, st.run_date ?? st.created_at.slice(0, 10));
  if (st.reference) line(`UTR ${st.reference}`); y += 3;
  line("Sales", rs(st.gross_amount)); line("Commission", `-${rs(st.commission_total)}`); line("Commission GST", `-${rs(st.commission_gst_total)}`);
  line("TCS", `-${rs(st.tcs_total)}`); line("TDS", `-${rs(st.tds_total)}`);
  if (Number(st.instant_fee) > 0) { line("Instant fee", `-${rs(st.instant_fee)}`); line("Instant fee GST", `-${rs(st.instant_fee_gst)}`); }
  if (Number(st.adjustment_total) !== 0) line("Adjustments", rs(st.adjustment_total));
  if (Number(d.round_off_carried) > 0) line("Round-off carried forward", rs(d.round_off_carried));
  line("Paid", rs(st.net_amount), true); y += 4;
  line("Orders", "", true);
  d.orders.forEach((o) => line(`#${o.order_number}  items ${rs(o.items_total)}  comm ${rs(o.commission)}  gst ${rs(o.commission_gst)}`, rs(o.net)));
  if (d.adjustments.length) { y += 3; line("Adjustments", "", true); d.adjustments.forEach((a) => line(a.reason, rs(a.amount))); }
  await outputPdf(pdf, `statement-${st.invoice_no ?? st.id}.pdf`, mode);
}

async function invoicePdf(inv: Invoice, storeName: string) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF();
  let y = 18;
  const line = (l: string, v = "", bold = false) => { pdf.setFont("helvetica", bold ? "bold" : "normal"); pdf.text(l, 14, y); if (v) pdf.text(v, 196, y, { align: "right" }); y += 7; };
  pdf.setFontSize(16); line("badiyos — Commission invoice", "", true); pdf.setFontSize(10);
  line(`Invoice ${inv.invoice_no}`, inv.date); line(`FY ${inv.invoice_fy}`); line(`Billed to ${storeName}`); y += 3;
  line("Commission", rs(inv.commission)); line("GST on commission", rs(inv.commission_gst));
  if (Number(inv.instant_fee) > 0) { line("Instant settlement fee", rs(inv.instant_fee)); line("GST on instant fee", rs(inv.instant_fee_gst)); }
  await outputPdf(pdf, `invoice-${inv.invoice_no}.pdf`, "save");
}
