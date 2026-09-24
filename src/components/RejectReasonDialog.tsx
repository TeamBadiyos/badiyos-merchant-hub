import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n";
import { REJECT_REASONS } from "@/lib/order-status";

export function RejectReasonDialog({
  open,
  onOpenChange,
  onConfirm,
  busy,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (reason: string) => void;
  busy?: boolean;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={(v) => (setReason(null), onOpenChange(v))}>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>{t("rejectReasonTitle")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          {REJECT_REASONS.map((r) => (
            <button
              key={r.code}
              type="button"
              onClick={() => setReason(r.code)}
              className={`rounded-xl border px-4 py-3 text-left text-sm font-bold transition-colors ${
                reason === r.code
                  ? "border-destructive bg-destructive/10 text-destructive"
                  : "border-border bg-card text-foreground"
              }`}
            >
              {t(r.label)}
            </button>
          ))}
        </div>
        <Button
          variant="destructive"
          className="mt-2 w-full rounded-xl font-bold"
          disabled={!reason || busy}
          onClick={() => reason && onConfirm(reason)}
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          {t("confirmReject")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
