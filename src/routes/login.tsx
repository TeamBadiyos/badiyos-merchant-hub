import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, KeyRound, Loader2, MessageCircle, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { Wordmark } from "@/components/Wordmark";
import { supabase } from "@/integrations/supabase/client";
import { routeForMerchant, useAuth } from "@/lib/auth";
import { hapticImpact, hapticNotify } from "@/lib/haptics";
import { useI18n } from "@/lib/i18n";
import {
  merchantHasPin,
  sendMerchantOtp,
  verifyMerchantOtp,
  verifyMerchantPin,
} from "@/lib/merchant-auth.functions";
import { digitsOnly, validatePhone } from "@/lib/validation";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Merchant login — badiyos Merchant Portal" },
      {
        name: "description",
        content:
          "Sign in with your mobile number and WhatsApp OTP, then set a 4-digit PIN for faster logins.",
      },
      { property: "og:title", content: "Merchant login — badiyos" },
      { property: "og:description", content: "WhatsApp OTP login for badiyos merchants." },
    ],
  }),
  component: LoginPage,
});

type Step = "mobile" | "otp" | "pinLogin" | "pinSetup";

function LoginPage() {
  const { t, lang, setLang } = useI18n();
  const { ensureDraft, refresh } = useAuth();
  const navigate = useNavigate();

  const sendOtpFn = useServerFn(sendMerchantOtp);
  const verifyOtpFn = useServerFn(verifyMerchantOtp);
  const verifyPinFn = useServerFn(verifyMerchantPin);
  const hasPinFn = useServerFn(merchantHasPin);

  const [step, setStep] = useState<Step>("mobile");
  const [mobile, setMobile] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [pin, setPin] = useState("");
  const [pin1, setPin1] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (step !== "otp" || seconds <= 0) return;
    const id = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [step, seconds]);

  const mismatch = pin2.length === 4 && pin1 !== pin2;

  const goAfterLogin = async () => {
    const merchant = await ensureDraft(mobile);
    await navigate({ to: routeForMerchant(merchant), replace: true });
  };

  const requestOtp = async () => {
    const result = await sendOtpFn({ data: { phone: mobile } });
    if (!result.ok) {
      toast.error(result.message);
      return false;
    }
    toast.success(result.message);
    setSeconds(60);
    setStep("otp");
    return true;
  };

  const handleContinue = async () => {
    const error = validatePhone(mobile);
    setPhoneError(error);
    if (error) return;

    setBusy(true);
    try {
      const { hasPin } = await hasPinFn({ data: { phone: mobile } });
      if (hasPin) {
        setStep("pinLogin");
        return;
      }
      await requestOtp();
    } catch (error) {
      console.error(error);
      toast.error("Could not start login. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyOtp = async () => {
    setBusy(true);
    try {
      const result = await verifyOtpFn({ data: { phone: mobile, code: otp } });
      if (!result.ok) {
        toast.error(result.message);
        setOtp("");
        return;
      }
      await supabase.auth.setSession({
        access_token: result.access_token,
        refresh_token: result.refresh_token,
      });
      const merchant = await ensureDraft(mobile);
      if (!merchant?.pin_hash) {
        setStep("pinSetup");
        return;
      }
      await navigate({ to: routeForMerchant(merchant), replace: true });
    } catch (error) {
      console.error(error);
      toast.error("Could not verify the code. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handlePinLogin = async () => {
    setBusy(true);
    try {
      const result = await verifyPinFn({ data: { phone: mobile, pin } });
      if (!result.ok) {
        toast.error(result.message);
        setPin("");
        if (result.code === "NO_PIN" || result.code === "NOT_REGISTERED") await requestOtp();
        return;
      }
      await supabase.auth.setSession({
        access_token: result.access_token,
        refresh_token: result.refresh_token,
      });
      await goAfterLogin();
    } catch (error) {
      console.error(error);
      toast.error("Could not log in. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleSetPin = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("merchant_set_login_pin", { p_pin: pin1 });
      if (error) {
        toast.error("Could not save your PIN. Please try again.");
        return;
      }
      await refresh();
      await goAfterLogin();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-scroll safe-top safe-bottom flex h-full min-h-full flex-col bg-background">
      <div className="bg-brand-gradient px-6 pt-12 pb-16 text-primary-foreground">
        <div className="mx-auto flex w-full max-w-[520px] items-center justify-between">
          <Wordmark on="dark" className="h-6" />
          <div className="flex overflow-hidden rounded-full bg-primary-foreground/15 p-1 text-xs font-bold">
            {(["en", "mr"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`rounded-full px-3 py-1 transition-colors ${
                  lang === l ? "bg-primary-foreground text-primary" : "text-primary-foreground"
                }`}
              >
                {l === "en" ? "English" : "मराठी"}
              </button>
            ))}
          </div>
        </div>
        <p className="mx-auto mt-6 w-full max-w-[520px] text-sm font-semibold opacity-90">
          {t("subTagline")}
        </p>
      </div>

      <div className="mx-auto -mt-8 w-full max-w-[520px] flex-1 px-6">
        <div className="rounded-3xl border border-border bg-card p-6 shadow-card">
          {step === "mobile" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl font-extrabold text-foreground">{t("loginTitle")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t("loginSub")}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mobile" className="text-sm font-bold">
                  {t("mobile")}
                </Label>
                <div className="flex items-center gap-3 rounded-2xl border border-input bg-background px-4 focus-within:ring-2 focus-within:ring-ring/40">
                  <span className="num text-sm font-bold text-muted-foreground">+91</span>
                  <Input
                    id="mobile"
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="98765 43210"
                    value={mobile}
                    onChange={(e) => {
                      const next = digitsOnly(e.target.value).slice(0, 10);
                      setMobile(next);
                      setPhoneError(next.length === 10 ? validatePhone(next) : null);
                    }}
                    className="num border-0 bg-transparent px-0 text-base font-bold tracking-wide shadow-none focus-visible:ring-0"
                  />
                </div>
                {phoneError && (
                  <p className="text-xs font-bold text-destructive">{phoneError}</p>
                )}
              </div>
              <Button
                size="lg"
                disabled={mobile.length !== 10 || busy}
                onClick={() => {
                  hapticImpact("light");
                  void handleContinue();
                }}
                className="w-full rounded-2xl text-base font-bold shadow-brand"
              >
                {busy ? <Loader2 className="size-5 animate-spin" /> : <MessageCircle className="size-5" />}
                {t("sendOtp")}
              </Button>
              <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="size-4 text-primary" />
                {t("verified")}
              </p>
            </div>
          )}

          {step === "otp" && (
            <div className="space-y-6">
              <button
                onClick={() => setStep("mobile")}
                className="flex items-center gap-2 text-sm font-bold text-muted-foreground"
              >
                <ArrowLeft className="size-4" />
                {t("changeNumber")}
              </button>
              <div>
                <h1 className="text-xl font-extrabold text-foreground">{t("otpTitle")}</h1>
                <p className="num mt-1 text-sm text-muted-foreground">
                  {t("otpSub")} +91 {mobile}
                </p>
              </div>
              <InputOTP maxLength={6} value={otp} onChange={setOtp} containerClassName="justify-center">
                <InputOTPGroup className="gap-2">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot
                      key={i}
                      index={i}
                      className="num size-10 rounded-xl border border-input text-base font-bold"
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              <Button
                size="lg"
                disabled={otp.length !== 6 || busy}
                onClick={() => {
                  hapticNotify("success");
                  void handleVerifyOtp();
                }}
                className="w-full rounded-2xl text-base font-bold shadow-brand"
              >
                {busy && <Loader2 className="size-5 animate-spin" />}
                {t("verify")}
              </Button>
              <button
                disabled={seconds > 0 || busy}
                onClick={() => void requestOtp()}
                className="num w-full text-center text-xs font-bold text-muted-foreground disabled:opacity-60"
              >
                {seconds > 0
                  ? `${t("resend")} · 00:${String(seconds).padStart(2, "0")}`
                  : t("resend")}
              </button>
            </div>
          )}

          {step === "pinLogin" && (
            <div className="space-y-6">
              <button
                onClick={() => setStep("mobile")}
                className="flex items-center gap-2 text-sm font-bold text-muted-foreground"
              >
                <ArrowLeft className="size-4" />
                {t("changeNumber")}
              </button>
              <div>
                <div className="flex size-10 items-center justify-center rounded-2xl bg-primary-soft">
                  <KeyRound className="size-5 text-primary" />
                </div>
                <h1 className="mt-4 text-xl font-extrabold text-foreground">{t("pinLoginTitle")}</h1>
                <p className="num mt-1 text-sm text-muted-foreground">+91 {mobile}</p>
              </div>
              <InputOTP maxLength={4} value={pin} onChange={setPin} containerClassName="justify-center">
                <InputOTPGroup className="gap-2">
                  {[0, 1, 2, 3].map((i) => (
                    <InputOTPSlot
                      key={i}
                      index={i}
                      className="num size-10 rounded-xl border border-input text-base font-bold"
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              <Button
                size="lg"
                disabled={pin.length !== 4 || busy}
                onClick={() => {
                  hapticNotify("success");
                  void handlePinLogin();
                }}
                className="w-full rounded-2xl text-base font-bold shadow-brand"
              >
                {busy && <Loader2 className="size-5 animate-spin" />}
                {t("login")}
              </Button>
              <button
                disabled={busy}
                onClick={() => void requestOtp()}
                className="w-full text-center text-xs font-bold text-primary"
              >
                {t("useOtpInstead")}
              </button>
            </div>
          )}

          {step === "pinSetup" && (
            <div className="space-y-6">
              <div>
                <div className="flex size-10 items-center justify-center rounded-2xl bg-primary-soft">
                  <KeyRound className="size-5 text-primary" />
                </div>
                <h1 className="mt-4 text-xl font-extrabold text-foreground">{t("pinTitle")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t("pinSub")}</p>
              </div>
              <div className="space-y-4">
                <InputOTP maxLength={4} value={pin1} onChange={setPin1} containerClassName="justify-center">
                  <InputOTPGroup className="gap-2">
                    {[0, 1, 2, 3].map((i) => (
                      <InputOTPSlot
                        key={i}
                        index={i}
                        className="num size-10 rounded-xl border border-input text-base font-bold"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
                <p className="text-center text-xs font-bold text-muted-foreground">
                  {t("pinConfirm")}
                </p>
                <InputOTP maxLength={4} value={pin2} onChange={setPin2} containerClassName="justify-center">
                  <InputOTPGroup className="gap-2">
                    {[0, 1, 2, 3].map((i) => (
                      <InputOTPSlot
                        key={i}
                        index={i}
                        className="num size-10 rounded-xl border border-input text-base font-bold"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
                {mismatch && (
                  <p className="text-center text-xs font-bold text-destructive">{t("pinMismatch")}</p>
                )}
              </div>
              <Button
                size="lg"
                disabled={pin1.length !== 4 || pin1 !== pin2 || busy}
                onClick={() => {
                  hapticNotify("success");
                  void handleSetPin();
                }}
                className="w-full rounded-2xl text-base font-bold shadow-brand"
              >
                {busy && <Loader2 className="size-5 animate-spin" />}
                {t("finish")}
              </Button>
            </div>
          )}
        </div>
        <p className="py-6 text-center text-xs text-muted-foreground">badiyos · Latur, Maharashtra</p>
      </div>
    </div>
  );
}
