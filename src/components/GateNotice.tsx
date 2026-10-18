import { Link, useNavigate } from "@tanstack/react-router";
import { Ban, Clock, Loader2, Lock, PauseCircle, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PlaceholderPanel } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { friendlyErrorMessage } from "@/lib/friendly-error";
import { useI18n } from "@/lib/i18n";

/** Shown whenever the shop is not approved; explains the actual state. */
export function PendingApproval() {
  const { t, lang } = useI18n();
  const { merchant, signOut, refresh } = useAuth();
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);

  const startFresh = async () => {
    setStarting(true);
    const { error } = await supabase.rpc("merchant_start_fresh");
    if (error) {
      setStarting(false);
      toast.error(friendlyErrorMessage(error, lang));
      return;
    }
    await refresh();
    await navigate({ to: "/onboarding", replace: true });
  };

  let title = t("pendingApproval");
  let description = t("pendingApprovalSub");
  let icon = Clock;
  let reason: string | null = null;

  if (merchant?.deleted_at) {
    title = t("gateDeletedTitle");
    description = t("gateDeletedSub");
    icon = Ban;
    reason = merchant.delete_reason;
  } else if (merchant?.status === "rejected") {
    title = t("gateRejectedTitle");
    description = t("gateRejectedSub");
    icon = XCircle;
    reason = merchant.rejection_reason;
  } else if (merchant?.status === "suspended") {
    title = t("gateSuspendedTitle");
    description = t("gateSuspendedSub");
    icon = PauseCircle;
  }

  const closed = icon !== Clock;

  return (
    <div className="space-y-4">
      <PlaceholderPanel title={title} description={description} icon={icon} />
      {reason ? (
        <div className="rounded-2xl border border-primary/30 bg-secondary p-4">
          <p className="text-xs font-bold uppercase text-primary">{t("gateReason")}</p>
          <p className="mt-1 text-sm text-foreground">{reason}</p>
        </div>
      ) : null}
      {merchant?.deleted_at ? (
        <Button
          disabled={starting}
          onClick={() => void startFresh()}
          className="h-12 w-full rounded-2xl font-bold"
        >
          {starting && <Loader2 className="size-5 animate-spin" />}
          {t("gateStartFresh")}
        </Button>
      ) : null}
      {closed ? (
        <div className="flex gap-2">
          <Button
            asChild
            variant={merchant?.deleted_at ? "outline" : "default"}
            className="h-12 min-w-0 flex-1 rounded-2xl font-bold"
          >
            <Link to="/support">{t("gateContactSupport")}</Link>
          </Button>
          <Button
            variant="outline"
            className="h-12 shrink-0 rounded-2xl px-4 font-bold"
            onClick={() => void signOut()}
          >
            {t("gateSignOut")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function AccessDenied() {
  const { t } = useI18n();
  return <PlaceholderPanel title={t("accessDenied")} description={t("accessDeniedSub")} icon={Lock} />;
}
