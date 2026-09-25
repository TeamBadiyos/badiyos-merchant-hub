import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { LocationPicker } from "@/components/delivery/LocationPicker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { bizRpc, isPhone10, phone10, type PickupPoint, type Receiver } from "@/lib/delivery/api";
import { useDT } from "@/lib/delivery/i18n";

type Kind = "receiver" | "pickup";

/** Add/edit form for a receiver or a pickup point (same fields + map pin). */
export function PlaceForm({
  kind,
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  kind: Kind;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: Partial<Omit<Receiver, "address"> & Omit<PickupPoint, "address"> & { address: string | null }> | null;
  onSaved: (id: string) => void;
}) {
  const dt = useDT();
  const [f, setF] = useState(() => ({
    name: initial?.name ?? "",
    contact_name: initial?.contact_name ?? "",
    contact_phone: initial?.contact_phone ?? "",
    address: initial?.address ?? "",
    notes: initial?.notes ?? "",
    lat: initial?.lat ?? null,
    lng: initial?.lng ?? null,
    is_default: initial?.is_default ?? false,
  }));
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: unknown) => setF((s) => ({ ...s, [k]: v }));

  const submit = async () => {
    const phone = phone10(f.contact_phone);
    if (!f.name.trim() || !f.address.trim()) { toast.error(dt("required")); return; }
    if (kind === "receiver" && !isPhone10(phone)) { toast.error(dt("phoneInvalid")); return; }
    if (kind === "pickup" && phone && !isPhone10(phone)) { toast.error(dt("phoneInvalid")); return; }
    if (f.lat == null || f.lng == null) { toast.error(dt("pinRequired")); return; }
    setBusy(true);
    try {
      const base = {
        _id: initial?.id ?? null,
        _name: f.name.trim(),
        _address: f.address.trim(),
        _lat: f.lat,
        _lng: f.lng,
        _contact_name: f.contact_name.trim() || null,
        _contact_phone: phone || null,
      };
      const id =
        kind === "receiver"
          ? await bizRpc<string>("business_upsert_receiver", { ...base, _notes: f.notes.trim() || null })
          : await bizRpc<string>("business_upsert_pickup_point", {
              ...base,
              _is_default: f.is_default,
              _is_active: initial?.is_active ?? true,
            });
      toast.success(dt("saved"));
      onSaved(typeof id === "string" ? id : String((id as { id?: string })?.id ?? ""));
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initial?.id ? dt("edit") : kind === "receiver" ? dt("addReceiver") : dt("addPickup")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label={kind === "receiver" ? dt("businessName") : dt("pickupName")}>
            <Input value={f.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label={dt("contactPerson")}>
            <Input value={f.contact_name} onChange={(e) => set("contact_name", e.target.value)} />
          </Field>
          <Field label={dt("phone")}>
            <Input
              inputMode="numeric"
              maxLength={10}
              value={f.contact_phone}
              onChange={(e) => set("contact_phone", e.target.value.replace(/\D/g, ""))}
            />
          </Field>
          <Field label={dt("address")}>
            <Textarea rows={2} value={f.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <LocationPicker
            lat={f.lat}
            lng={f.lng}
            onChange={(a, b) => setF((s) => ({ ...s, lat: a, lng: b }))}
          />
          {kind === "receiver" ? (
            <Field label={dt("notes")}>
              <Textarea rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
            </Field>
          ) : (
            <label className="flex items-center justify-between rounded-xl border border-border p-3 text-sm font-semibold">
              {dt("isDefault")}
              <Switch checked={f.is_default} onCheckedChange={(v) => set("is_default", v)} />
            </label>
          )}
          <Button size="lg" className="h-12 w-full" disabled={busy} onClick={() => void submit()}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {dt("save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
