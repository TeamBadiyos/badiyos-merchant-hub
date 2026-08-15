import { Clock, Lock } from "lucide-react";

import { PlaceholderPanel } from "@/components/AppShell";
import { useI18n } from "@/lib/i18n";

export function PendingApproval() {
  const { t } = useI18n();
  return (
    <PlaceholderPanel title={t("pendingApproval")} description={t("pendingApprovalSub")} icon={Clock} />
  );
}

export function AccessDenied() {
  const { t } = useI18n();
  return <PlaceholderPanel title={t("accessDenied")} description={t("accessDeniedSub")} icon={Lock} />;
}
