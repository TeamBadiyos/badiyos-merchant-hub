import { Link } from "@tanstack/react-router";

import { useI18n } from "@/lib/i18n";

/** "By continuing, you agree to ... Terms and Privacy Policy" line. */
export function LegalConsent({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  return (
    <p className={`text-center text-xs text-muted-foreground ${className}`}>
      {t("consentPrefix")}{" "}
      <Link
        to="/legal/$slug"
        params={{ slug: "terms" }}
        className="font-bold text-primary underline"
      >
        {t("termsTitle")}
      </Link>{" "}
      {t("consentAnd")}{" "}
      <Link
        to="/legal/$slug"
        params={{ slug: "privacy-policy" }}
        className="font-bold text-primary underline"
      >
        {t("privacyPolicy")}
      </Link>
      {t("consentSuffix")}
    </p>
  );
}