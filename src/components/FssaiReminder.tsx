import { AlertTriangle } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

/** Shown to the owner when the FSSAI licence expires within 30 days (or already has). */
export function FssaiReminder() {
  const { t, lang } = useI18n();
  const { merchant, context } = useAuth();
  const expiry = merchant?.fssai_expiry;
  if (!expiry || !context.isOwner) return null;
  const end = new Date(`${expiry}T23:59:59`);
  const daysLeft = Math.ceil((end.getTime() - Date.now()) / 86_400_000);
  if (daysLeft > 30) return null;
  const date = end.toLocaleDateString(lang === "mr" ? "mr-IN" : "en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const text = (daysLeft < 0 ? t("fssaiExpired") : t("fssaiExpiringSoon")).replace("{date}", date);
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4"
    >
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
      <p className="text-sm font-bold text-foreground">{text}</p>
    </div>
  );
}
