import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Crown, Loader2, Plus, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ModeShell } from "@/components/ModeShell";
import { AccessDenied, PendingApproval } from "@/components/GateNotice";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth, type Permission } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/use-require-auth";
import { digitsOnly, validatePhone } from "@/lib/validation";

type Staff = Database["public"]["Tables"]["merchant_staff"]["Row"];

/** The single standard Staff role: everything except managing staff. Custom roles are no longer offered (old rows are kept). */
const STAFF_PERMISSIONS: Permission[] = [
  "view_orders",
  "manage_orders",
  "manage_products",
  "view_reports",
  "manage_delivery",
];
const STAFF_ROLE_NAME = "Staff";

async function ensureStaffRole(merchantId: string): Promise<string> {
  const { data: existing, error } = await supabase
    .from("merchant_roles")
    .select("id")
    .eq("merchant_id", merchantId)
    .eq("name", STAFF_ROLE_NAME)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (existing) {
    await supabase
      .from("merchant_roles")
      .update({ permissions: STAFF_PERMISSIONS })
      .eq("id", existing.id);
    return existing.id;
  }
  const { data, error: insertError } = await supabase
    .from("merchant_roles")
    .insert({ merchant_id: merchantId, name: STAFF_ROLE_NAME, permissions: STAFF_PERMISSIONS })
    .select("id")
    .single();
  if (insertError) throw insertError;
  return data.id;
}

export const Route = createFileRoute("/staff")({
  head: () => ({
    meta: [
      { title: "Staff — badiyos Merchant Portal" },
      {
        name: "description",
        content:
          "Add staff by mobile number. The owner manages money, documents and staff; staff run daily orders.",
      },
      { property: "og:title", content: "Staff — badiyos Merchant Portal" },
      { property: "og:description", content: "Manage your shop owner and staff access." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StaffPage,
});

function StaffPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  const merchant = useRequireAuth();
  const queryClient = useQueryClient();
  const allowed = can("manage_staff");
  const [inviteOpen, setInviteOpen] = useState(false);

  const staff = useQuery({
    queryKey: ["merchant-staff", merchant?.id],
    enabled: Boolean(merchant?.id) && allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("merchant_staff")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const toggleStaff = useMutation({
    mutationFn: async (member: Staff) => {
      const activating = member.status !== "active";
      const patch: { status: string; role_id?: string } = {
        status: activating ? "active" : "inactive",
      };
      if (activating) patch.role_id = await ensureStaffRole(member.merchant_id);
      const { error } = await supabase.from("merchant_staff").update(patch).eq("id", member.id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["merchant-staff"] }),
    onError: () => toast.error("Could not update this staff member."),
  });

  if (!merchant) return null;

  return (
    <ModeShell title={t("staff")} onRefresh={() => staff.refetch()}>
      {merchant.status !== "approved" ? (
        <PendingApproval />
      ) : !allowed ? (
        <AccessDenied />
      ) : (
        <div className="space-y-6">
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-card">
            <Crown className="size-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-foreground">
                {merchant.owner_name ?? merchant.store_name}
              </p>
              <p className="num text-xs font-semibold text-muted-foreground">+91 {merchant.phone}</p>
            </div>
            <span className="shrink-0 rounded-full bg-primary-soft px-3 py-1 text-[10px] font-bold text-accent-foreground">
              {t("ownerRole")}
            </span>
          </div>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
                <Users className="size-5 text-primary" />
                {t("staff")}
              </h2>
              <Button
                size="sm"
                variant="ghost"
                className="font-bold text-primary"
                onClick={() => setInviteOpen(true)}
              >
                <Plus className="size-4" />
                {t("inviteStaff")}
              </Button>
            </div>
            {staff.isLoading && <Loader2 className="mx-auto size-5 animate-spin text-primary" />}
            {staff.data?.length === 0 && (
              <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                {t("noStaff")}
              </p>
            )}
            {staff.data?.map((member) => (
              <div key={member.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground">
                      {member.name ?? t("staffRole")}
                    </p>
                    <p className="num text-xs font-semibold text-muted-foreground">
                      +91 {member.phone} · {t("staffRole")}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-bold ${
                      member.status === "active"
                        ? "bg-primary-soft text-accent-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {member.status === "active" ? t("active") : t("inactive")}
                  </span>
                </div>
                <Button
                  variant="outline"
                  className="mt-3 w-full rounded-xl text-xs font-bold"
                  disabled={toggleStaff.isPending}
                  onClick={() => toggleStaff.mutate(member)}
                >
                  {member.status === "active" ? t("deactivate") : t("activate")}
                </Button>
              </div>
            ))}
          </section>
        </div>
      )}

      {inviteOpen && merchant.id && (
        <InviteForm merchantId={merchant.id} onClose={() => setInviteOpen(false)} />
      )}
    </ModeShell>
  );
}

function InviteForm({
  merchantId,
  onClose,
}: {
  merchantId: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const roleId = await ensureStaffRole(merchantId);
      const { error } = await supabase.from("merchant_staff").insert({
        merchant_id: merchantId,
        name: name.trim() || null,
        phone,
        role_id: roleId,
        status: "active",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("saved"));
      void queryClient.invalidateQueries({ queryKey: ["merchant-staff"] });
      onClose();
    },
    onError: () => toast.error("Could not invite this staff member."),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>{t("inviteStaff")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-bold">{t("staffName")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl" />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-bold">{t("phone")}</Label>
            <Input
              inputMode="numeric"
              value={phone}
              onChange={(e) => {
                const next = digitsOnly(e.target.value).slice(0, 10);
                setPhone(next);
                setError(next.length === 10 ? validatePhone(next) : null);
              }}
              className="num rounded-xl"
              placeholder="98765 43210"
            />
            {error && <p className="text-xs font-bold text-destructive">{error}</p>}
            <p className="text-xs text-muted-foreground">{t("staffHint")}</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button
              className="flex-1 rounded-xl font-bold"
              disabled={save.isPending}
              onClick={() => {
                const phoneError = validatePhone(phone);
                setError(phoneError);
                if (!phoneError) save.mutate();
              }}
            >
              {save.isPending && <Loader2 className="size-4 animate-spin" />}
              {t("inviteStaff")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
