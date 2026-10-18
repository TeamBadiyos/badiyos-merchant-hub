import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Wordmark } from "@/components/Wordmark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { routeForMerchant, useAuth } from "@/lib/auth";
import { friendlyErrorMessage } from "@/lib/friendly-error";
import { hapticNotify } from "@/lib/haptics";
import { useI18n } from "@/lib/i18n";
import { digitsOnly } from "@/lib/validation";

export const Route = createFileRoute("/agreement")({
  head: () => ({
    meta: [
      { title: "Sign your partner agreement — badiyos Merchant" },
      { name: "description", content: "Review and sign your badiyos partner agreement with an OTP to go live." },
      { property: "og:title", content: "Sign your badiyos partner agreement" },
      { property: "og:description", content: "Review and sign your agreement with an OTP to start taking orders." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgreementPage,
});

type Agreement = { id: string; title: string; body: string; status: string };

function AgreementPage() {
  const { lang } = useI18n();
  const mr = lang === "mr";
  const { merchant, ready, userId, refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const [readToEnd, setReadToEnd] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ready && !userId) void navigate({ to: "/login", replace: true });
  }, [ready, userId, navigate]);

  const state = useQuery({
    queryKey: ["onboarding-state", merchant?.id],
    enabled: Boolean(merchant?.id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("app_merchant_onboarding_state");
      if (error) throw error;
      return (data ?? {}) as { stage?: string };
    },
  });
  const stage = state.data?.stage;
  useEffect(() => {
    if (stage && stage !== "sign_agreement") void navigate({ to: routeForMerchant(merchant), replace: true });
  }, [stage, merchant, navigate]);

  const agreements = useQuery({
    queryKey: ["my-agreements", merchant?.id],
    enabled: stage === "sign_agreement",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("app_my_agreements");
      if (error) throw error;
      return (data as Agreement[] | null) ?? [];
    },
  });
  const agreement = (agreements.data ?? []).find((a) => a.status === "sent" || a.status === "pending_reacceptance");

  useEffect(() => {
    const el = boxRef.current;
    if (el && el.scrollHeight <= el.clientHeight + 8) setReadToEnd(true);
  }, [agreement?.id]);

  const requestOtp = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("app_agreement_request_otp", { _agreement_id: agreement!.id });
    setBusy(false);
    if (error) { toast.error(friendlyErrorMessage(error, lang)); return; }
    setSentTo(String((data as { sent_to?: string } | null)?.sent_to ?? ""));
  };

  const accept = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("app_agreement_accept", {
      _agreement_id: agreement!.id,
      _otp: otp,
      _device: navigator.userAgent,
    });
    if (error) {
      setBusy(false);
      toast.error(friendlyErrorMessage(error, lang));
      return;
    }
    hapticNotify("success");
    toast.success(mr ? "करार स्वाक्षरी झाला. तुमचे दुकान लाइव्ह आहे!" : "Agreement signed. Your store is live!");
    await refresh();
    await state.refetch();
    void navigate({ to: "/home", replace: true });
  };

  const loading = !ready || !merchant || state.isLoading || agreements.isLoading;

  return (
    <div className="app-scroll safe-top safe-bottom h-full bg-background px-4 pb-12">
      <div className="mx-auto w-full max-w-[520px] space-y-4 pt-8">
        <Wordmark className="h-6" />
        <div>
          <p className="text-xs font-bold uppercase text-primary">
            {mr ? "अर्ज मंजूर झाला" : "Application approved"}
          </p>
          <h1 className="mt-1 text-2xl font-extrabold text-foreground">
            {agreement?.title ?? (mr ? "भागीदार करार" : "Partner agreement")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mr
              ? "तुमचे दुकान लाइव्ह करण्यासाठी करार वाचा आणि OTP ने स्वाक्षरी करा."
              : "Read your agreement and sign it with an OTP to make your store live."}
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : !agreement ? (
          <p className="rounded-2xl border border-border p-4 text-sm text-muted-foreground">
            {mr
              ? "तुमचा करार तयार होत आहे. थोड्या वेळाने पुन्हा उघडा."
              : "Your agreement is being prepared. Please check again in a little while."}
          </p>
        ) : (
          <>
            <div
              ref={boxRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setReadToEnd(true);
              }}
              className="selectable max-h-[55vh] overflow-y-auto whitespace-pre-wrap rounded-2xl border border-border p-4 text-sm leading-relaxed text-foreground"
            >
              {agreement.body.replace(/^#+\s*/gm, "").replace(/\*\*/g, "")}
            </div>
            {!readToEnd && (
              <p className="text-xs font-bold text-muted-foreground">
                {mr ? "पुढे जाण्यासाठी शेवटपर्यंत स्क्रोल करा" : "Scroll to the end to continue"}
              </p>
            )}
            {sentTo === null ? (
              <Button
                disabled={!readToEnd || busy}
                onClick={() => void requestOtp()}
                className="h-12 w-full rounded-2xl font-bold"
              >
                {busy && <Loader2 className="size-5 animate-spin" />}
                {mr ? "OTP ने स्वाक्षरी करा" : "Proceed to Sign via OTP"}
              </Button>
            ) : (
              <div className="space-y-2 rounded-2xl border border-border p-4">
                <p className="text-sm font-bold text-foreground">
                  {mr ? `OTP या नंबरवर पाठवला •••• ${sentTo}` : `OTP sent to number ending in •••• ${sentTo}`}
                </p>
                <div className="flex gap-2">
                  <Input
                    value={otp}
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="------"
                    onChange={(e) => setOtp(digitsOnly(e.target.value).slice(0, 6))}
                    className="num h-12 min-w-0 flex-1 rounded-2xl text-center text-lg font-bold tracking-widest"
                  />
                  <Button
                    disabled={otp.length < 4 || busy}
                    onClick={() => void accept()}
                    className="h-12 shrink-0 rounded-2xl px-5 font-bold"
                  >
                    {busy && <Loader2 className="size-5 animate-spin" />}
                    {mr ? "स्वाक्षरी करा" : "Sign"}
                  </Button>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void requestOtp()}
                  className="text-xs font-bold text-primary underline"
                >
                  {mr ? "OTP पुन्हा पाठवा" : "Resend OTP"}
                </button>
              </div>
            )}
          </>
        )}

        <button
          type="button"
          onClick={() => void signOut().then(() => navigate({ to: "/login", replace: true }))}
          className="w-full pt-4 text-center text-xs font-bold text-muted-foreground underline"
        >
          {mr ? "लॉगआउट" : "Log out"}
        </button>
      </div>
    </div>
  );
}
