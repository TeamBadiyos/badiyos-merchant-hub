import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { DeliveryShell, deliveryHead } from "@/components/delivery/DeliveryShell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { bizRpc, getWallet, inr, listTopups } from "@/lib/delivery/api";
import { useDT } from "@/lib/delivery/i18n";
import { createTopupOrder, getTopupLimits } from "@/lib/delivery/topup.functions";
import { openRazorpayCheckout } from "@/lib/razorpayCheckout";

export const Route = createFileRoute("/delivery/wallet")({
  validateSearch: z.object({ topup: z.boolean().optional() }),
  head: () => deliveryHead("Delivery wallet", "Balance, history and top-ups for your delivery wallet."),
  component: WalletPage,
});


function WalletPage() {
  const dt = useDT();
  const search = Route.useSearch();
  const wallet = useQuery({ queryKey: ["biz", "wallet"], queryFn: getWallet });
  const topups = useQuery({ queryKey: ["biz", "topups"], queryFn: listTopups });
  const limitsFn = useServerFn(getTopupLimits);
  const createOrder = useServerFn(createTopupOrder);
  const limits = useQuery({ queryKey: ["biz", "topup-limits"], queryFn: () => limitsFn() });
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [stage, setStage] = useState<"idle" | "starting" | "waiting">("idle");

  useEffect(() => {
    if (search.topup) setOpen(true);
  }, [search.topup]);

  const bal = Number(wallet.data?.delivery_wallet_balance ?? 0);
  const limit = Number(wallet.data?.low_balance_threshold ?? 0);
  const low = bal < 0 || bal < limit;
  const min = limits.data?.min ?? 500;
  const max = limits.data?.max ?? 100000;

  const pollCredit = async (before: number) => {
    setStage("waiting");
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const w = await wallet.refetch();
      if (Number(w.data?.delivery_wallet_balance ?? 0) > before) {
        toast.success(dt("credited"));
        void topups.refetch();
        setStage("idle");
        return;
      }
    }
    toast(dt("notYet"));
    void topups.refetch();
    setStage("idle");
  };

  const pay = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < min || amt > max) {
      toast.error(dt("minMax").replace("{min}", String(min)).replace("{max}", String(max)));
      return;
    }
    setStage("starting");
    try {
      const res = await createOrder({ data: { amount: amt } });
      if ("error" in res) throw new Error(res.error);
      await bizRpc("business_create_topup_intent", { _amount: amt, _razorpay_order_id: res.orderId });
      const before = bal;
      await openRazorpayCheckout({
        keyId: res.keyId,
        orderId: res.orderId,
        amountPaise: res.amountPaise,
        description: dt("balance"),
        notes: { purpose: "merchant_wallet_topup", merchant_id: res.merchantId },
      });
      setOpen(false);
      void pollCredit(before);
    } catch (e) {
      toast.error((e as Error).message);
      setStage("idle");
    }
  };

  return (
    <DeliveryShell title={dt("wallet")}>
      <div className="space-y-5">
        <div className={`rounded-2xl border p-5 shadow-card ${low ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"}`}>
          <p className="text-xs font-semibold text-muted-foreground">{dt("balance")}</p>
          <p className={`num mt-1 text-3xl font-extrabold ${low ? "text-destructive" : "text-foreground"}`}>
            {wallet.isLoading ? "…" : inr(bal)}
          </p>
          <p className="num mt-1 text-xs text-muted-foreground">
            {dt("lowLimit")}: {inr(limit)}
          </p>
          <Button size="lg" className="mt-4 h-12 w-full" disabled={stage !== "idle"} onClick={() => setOpen(true)}>
            {stage === "waiting" ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {dt("waitingCredit")}
              </>
            ) : (
              dt("topUp")
            )}
          </Button>
        </div>

        <section>
          <h2 className="mb-2 text-sm font-bold text-foreground">{dt("history")}</h2>
          <div className="divide-y divide-border rounded-2xl border border-border bg-card">
            {(wallet.data?.entries ?? []).length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">{dt("noEntries")}</p>
            ) : (
              wallet.data!.entries.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{e.reason ?? e.type}</p>
                    <p className="num text-[11px] text-muted-foreground">
                      {new Date(e.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <p className={`num shrink-0 text-sm font-bold ${Number(e.amount) < 0 || e.type === "debit" ? "text-destructive" : "text-primary"}`}>
                    {e.type === "debit" && Number(e.amount) > 0 ? "-" : ""}
                    {inr(e.amount)}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-bold text-foreground">{dt("topups")}</h2>
          <div className="divide-y divide-border rounded-2xl border border-border bg-card">
            {(topups.data ?? []).length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">{dt("noEntries")}</p>
            ) : (
              topups.data!.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 p-3">
                  <div>
                    <p className="text-sm font-semibold capitalize text-foreground">{t.status}</p>
                    <p className="num text-[11px] text-muted-foreground">
                      {new Date(t.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      {t.created_by_label ? ` · ${t.created_by_label}` : ""}
                    </p>
                  </div>
                  <p className="num text-sm font-bold text-foreground">{inr(t.amount)}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dt("topUp")}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            inputMode="numeric"
            className="num h-12 text-lg"
            placeholder={dt("amount")}
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
          />
          <p className="num text-xs text-muted-foreground">
            {dt("minMax").replace("{min}", String(min)).replace("{max}", String(max))}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[1000, 2000, 5000].map((v) => (
              <Button key={v} variant="outline" onClick={() => setAmount(String(v))}>
                ₹{v}
              </Button>
            ))}
          </div>
          <Button size="lg" className="h-12" disabled={stage !== "idle" || !amount} onClick={() => void pay()}>
            {stage === "starting" && <Loader2 className="size-4 animate-spin" />}
            {dt("pay")}
          </Button>
        </DialogContent>
      </Dialog>
    </DeliveryShell>
  );
}
