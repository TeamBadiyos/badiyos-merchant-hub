import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { DeliveryShell, deliveryHead } from "@/components/delivery/DeliveryShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDT } from "@/lib/delivery/i18n";
import { useActorName } from "@/lib/delivery/mode";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/delivery/settings")({
  head: () => deliveryHead("Delivery settings", "Your name on this phone and app language."),
  component: Settings,
});

function Settings() {
  const dt = useDT();
  const { lang, setLang } = useI18n();
  const { name, save } = useActorName();
  const [draft, setDraft] = useState("");
  useEffect(() => setDraft(name ?? ""), [name]);

  return (
    <DeliveryShell title={dt("settings")}>
      <div className="space-y-6">
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground">{dt("yourName")}</Label>
          <Input className="h-12" value={draft} maxLength={60} onChange={(e) => setDraft(e.target.value)} />
          <p className="text-xs text-muted-foreground">{dt("yourNameSub")}</p>
          <Button
            className="h-11 w-full"
            disabled={!draft.trim()}
            onClick={() => {
              save(draft);
              toast.success(dt("saved"));
            }}
          >
            {dt("save")}
          </Button>
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground">{dt("language")}</Label>
          <div className="grid grid-cols-2 gap-2">
            {(["en", "mr"] as const).map((l) => (
              <Button key={l} variant={lang === l ? "default" : "outline"} className="h-11" onClick={() => setLang(l)}>
                {l === "en" ? "English" : "मराठी"}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </DeliveryShell>
  );
}
