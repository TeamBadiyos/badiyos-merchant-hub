import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Copy, Gift, Loader2, MessageCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { AccessDenied, PendingApproval } from "@/components/GateNotice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { inr } from "@/lib/order-status";
import { useRequireAuth } from "@/lib/use-require-auth";
import { digitsOnly } from "@/lib/validation";

export const Route = createFileRoute("/rewards")({
  head: () => ({
    meta: [
      { title: "Refer a merchant — badiyos Merchant Portal" },
      { name: "description", content: "Invite other shops to badiyos on WhatsApp with your referral code and track their status." },
      { property: "og:title", content: "Refer a merchant — badiyos" },
      { property: "og:description", content: "Invite shops and earn referral rewards." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReferPage,
});

const TX = {
  en: { title: "Refer a merchant", code: "Your referral code", reward: "Reward per shop that goes live", soon: "Coming soon",
    invite: "Invite by WhatsApp", name: "Shop / owner name", phone: "Mobile number", list: "Referred shops", empty: "No referrals yet",
    invited: "Invited", signed_up: "Signed up", live: "Live", reward_s: "Reward earned", copied: "Copied",
    msg: "Join badiyos as a merchant and get orders online in Latur. Use my code {c}: {u}" },
  mr: { title: "व्यापारी रेफर करा", code: "तुमचा रेफरल कोड", reward: "लाईव्ह झालेल्या प्रत्येक दुकानासाठी बक्षीस", soon: "लवकरच",
    invite: "WhatsApp ने आमंत्रण द्या", name: "दुकान / मालकाचे नाव", phone: "मोबाईल नंबर", list: "रेफर केलेली दुकाने", empty: "अजून रेफरल नाहीत",
    invited: "आमंत्रित", signed_up: "साइन अप", live: "लाईव्ह", reward_s: "बक्षीस मिळाले", copied: "कॉपी झाले",
    msg: "badiyos वर व्यापारी म्हणून जॉइन करा आणि लातूरमध्ये ऑनलाइन ऑर्डर मिळवा. माझा कोड {c} वापरा: {u}" },
};

const STEPS = ["invited", "signed_up", "live", "reward"] as const;

function ReferPage() {
  const { lang } = useI18n();
  const L = TX[lang === "mr" ? "mr" : "en"];
  const { context } = useAuth();
  const merchant = useRequireAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const enabled = !!merchant?.id && merchant?.status === "approved" && context.isOwner;

  const code = useQuery({
    queryKey: ["merchant-referral-code", merchant?.id], enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("merchant_referral_code");
      if (error) throw error;
      return data as string;
    },
  });
  const config = useQuery({
    queryKey: ["merchant-referral-config"], enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("merchant_referral_config").select("reward_amount, rules").eq("id", 1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const list = useQuery({
    queryKey: ["merchant-referrals", merchant?.id], enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("merchant_my_referrals");
      if (error) throw error;
      return (data ?? []) as { phone: string; name: string | null; status: (typeof STEPS)[number]; at: string; reward_amount: number | null }[];
    },
  });

  const link = `https://merchant.badiyos.com/login?ref=${code.data ?? ""}`;
  const invite = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("merchant_add_referral_invite", { _phone: phone, _name: name });
      if (error) throw error;
    },
    onSuccess: () => {
      const text = L.msg.replace("{c}", code.data ?? "").replace("{u}", link);
      window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(text)}`, "_blank");
      setName(""); setPhone("");
      void qc.invalidateQueries({ queryKey: ["merchant-referrals"] });
    },
    onError: () => toast.error("Could not save this invite."),
  });

  if (!merchant) return null;
  if (merchant.status !== "approved") return <AppShell title={L.title}><PendingApproval /></AppShell>;
  if (!context.isOwner) return <AppShell title={L.title}><AccessDenied /></AppShell>;
  const amount = Number(config.data?.reward_amount ?? 0);
  const label = (s: string) => (s === "reward" ? L.reward_s : (L as Record<string, string>)[s] ?? s);

  return (
    <AppShell title={L.title} onRefresh={() => list.refetch()}>
      <div className="space-y-4">
        <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <p className="text-xs font-bold text-muted-foreground">{L.code}</p>
          <div className="mt-1 flex items-center justify-between">
            <p className="num text-2xl font-extrabold tracking-wider text-primary">{code.data ?? "…"}</p>
            <Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(link).then(() => toast.success(L.copied))}>
              <Copy className="size-4" />
            </Button>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-primary-soft p-3">
            <Gift className="size-5 text-primary" />
            <p className="flex-1 text-xs font-bold text-foreground">{L.reward}</p>
            <p className="num text-sm font-extrabold text-primary">{amount > 0 ? inr(amount) : L.soon}</p>
          </div>
          {amount > 0 && config.data?.rules && <p className="mt-2 text-xs text-muted-foreground">{config.data.rules}</p>}
        </section>

        <section className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-card">
          <Input placeholder={L.name} value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder={L.phone} inputMode="numeric" className="num" value={phone}
            onChange={(e) => setPhone(digitsOnly(e.target.value).slice(0, 10))} />
          <Button className="w-full" disabled={phone.length !== 10 || !code.data || invite.isPending} onClick={() => invite.mutate()}>
            {invite.isPending ? <Loader2 className="size-4 animate-spin" /> : <MessageCircle className="size-4" />}{L.invite}
          </Button>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-foreground">{L.list}</h2>
          {list.data?.length === 0 && <p className="text-sm text-muted-foreground">{L.empty}</p>}
          {list.data?.map((r) => {
            const idx = STEPS.indexOf(r.status);
            return (
              <div key={r.phone + r.at} className="rounded-2xl border border-border bg-card p-4 shadow-card">
                <div className="flex justify-between">
                  <p className="truncate text-sm font-bold">{r.name ?? `+91 ${r.phone}`}</p>
                  <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-bold text-accent-foreground">{label(r.status)}</span>
                </div>
                <div className="mt-3 flex gap-1">
                  {STEPS.map((s, i) => <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= idx ? "bg-primary" : "bg-muted"}`} />)}
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </AppShell>
  );
}
