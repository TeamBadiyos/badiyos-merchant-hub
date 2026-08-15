import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, KeyRound, MessageCircle, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { BrandMark, Wordmark } from "@/components/Wordmark";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

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
      {
        property: "og:description",
        content: "WhatsApp OTP login for badiyos merchants.",
      },
    ],
  }),
  component: LoginPage,
});

type Step = "mobile" | "otp" | "pin";

function LoginPage() {
  const { t, lang, setLang } = useI18n();
  const { signIn, setPin } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("mobile");
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [pin1, setPin1] = useState("");
  const [pin2, setPin2] = useState("");
  const [seconds, setSeconds] = useState(30);

  useEffect(() => {
    if (step !== "otp") return;
    setSeconds(30);
    const id = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [step]);

  const mismatch = pin2.length === 4 && pin1 !== pin2;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="bg-brand-gradient px-3 pt-6 pb-8 text-primary-foreground">
        <div className="mx-auto flex w-full max-w-[520px] items-center justify-between">
          <div className="flex items-center gap-1.5">
            <BrandMark className="size-5 text-xl" />
            <span className="text-2xl">
              <Wordmark className="text-primary-foreground [&_span]:text-primary-foreground/70" />
            </span>
          </div>
          <div className="flex overflow-hidden rounded-full bg-primary-foreground/15 p-0.5 text-xs font-bold">
            {(["en", "mr"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`rounded-full px-1.5 py-0.5 transition-colors ${
                  lang === l ? "bg-primary-foreground text-primary" : "text-primary-foreground"
                }`}
              >
                {l === "en" ? "English" : "मराठी"}
              </button>
            ))}
          </div>
        </div>
        <p className="mx-auto mt-3 w-full max-w-[520px] text-sm font-semibold opacity-90">
          {t("subTagline")}
        </p>
      </div>

      <div className="mx-auto -mt-4 w-full max-w-[520px] flex-1 px-3">
        <div className="rounded-3xl border border-border bg-card p-3 shadow-card">
          {step === "mobile" && (
            <div className="space-y-3">
              <div>
                <h1 className="text-xl font-extrabold text-foreground">{t("loginTitle")}</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">{t("loginSub")}</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="mobile" className="text-sm font-bold">
                  {t("mobile")}
                </Label>
                <div className="flex items-center gap-1.5 rounded-2xl border border-input bg-background px-2 focus-within:ring-2 focus-within:ring-ring/40">
                  <span className="num text-sm font-bold text-muted-foreground">+91</span>
                  <Input
                    id="mobile"
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="98765 43210"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    className="num border-0 bg-transparent px-0 text-base font-bold tracking-wide shadow-none focus-visible:ring-0"
                  />
                </div>
              </div>
              <Button
                size="lg"
                disabled={mobile.length !== 10}
                onClick={() => setStep("otp")}
                className="w-full rounded-2xl text-base font-bold shadow-brand"
              >
                <MessageCircle className="size-2.5" />
                {t("sendOtp")}
              </Button>
              <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                <ShieldCheck className="size-2 text-primary" />
                {t("verified")}
              </p>
            </div>
          )}

          {step === "otp" && (
            <div className="space-y-3">
              <button
                onClick={() => setStep("mobile")}
                className="flex items-center gap-1 text-sm font-bold text-muted-foreground"
              >
                <ArrowLeft className="size-2" />
                {t("changeNumber")}
              </button>
              <div>
                <h1 className="text-xl font-extrabold text-foreground">{t("otpTitle")}</h1>
                <p className="num mt-0.5 text-sm text-muted-foreground">
                  {t("otpSub")} +91 {mobile}
                </p>
              </div>
              <InputOTP maxLength={6} value={otp} onChange={setOtp} containerClassName="justify-center">
                <InputOTPGroup className="gap-1">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot
                      key={i}
                      index={i}
                      className="num size-5 rounded-xl border border-input text-base font-bold"
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              <Button
                size="lg"
                disabled={otp.length !== 6}
                onClick={() => {
                  signIn(mobile);
                  setStep("pin");
                }}
                className="w-full rounded-2xl text-base font-bold shadow-brand"
              >
                {t("verify")}
              </Button>
              <p className="num text-center text-xs text-muted-foreground">
                {seconds > 0 ? `${t("resend")} · 00:${String(seconds).padStart(2, "0")}` : t("resend")}
              </p>
            </div>
          )}

          {step === "pin" && (
            <div className="space-y-3">
              <div>
                <div className="flex size-5 items-center justify-center rounded-2xl bg-primary-soft">
                  <KeyRound className="size-2.5 text-primary" />
                </div>
                <h1 className="mt-2 text-xl font-extrabold text-foreground">{t("pinTitle")}</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">{t("pinSub")}</p>
              </div>
              <div className="space-y-2">
                <InputOTP maxLength={4} value={pin1} onChange={setPin1} containerClassName="justify-center">
                  <InputOTPGroup className="gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <InputOTPSlot
                        key={i}
                        index={i}
                        className="num size-5 rounded-xl border border-input text-base font-bold"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
                <p className="text-center text-xs font-bold text-muted-foreground">
                  {t("pinConfirm")}
                </p>
                <InputOTP maxLength={4} value={pin2} onChange={setPin2} containerClassName="justify-center">
                  <InputOTPGroup className="gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <InputOTPSlot
                        key={i}
                        index={i}
                        className="num size-5 rounded-xl border border-input text-base font-bold"
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
                disabled={pin1.length !== 4 || pin1 !== pin2}
                onClick={() => {
                  setPin();
                  navigate({ to: "/home", replace: true });
                }}
                className="w-full rounded-2xl text-base font-bold shadow-brand"
              >
                {t("finish")}
              </Button>
            </div>
          )}
        </div>
        <p className="py-3 text-center text-xs text-muted-foreground">
          badiyos · Latur, Maharashtra
        </p>
      </div>
    </div>
  );
}