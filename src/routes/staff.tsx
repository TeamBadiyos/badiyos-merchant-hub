import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Pencil, Plus, ShieldCheck, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { AccessDenied, PendingApproval } from "@/components/GateNotice";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { ALL_PERMISSIONS, useAuth, type Permission } from "@/lib/auth";
import { useI18n, type Key } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/use-require-auth";
import { digitsOnly, validatePhone } from "@/lib/validation";

type Role = Database["public"]["Tables"]["merchant_roles"]["Row"];
type Staff = Database["public"]["Tables"]["merchant_staff"]["Row"];

const PERM_LABEL: Record<Permission, Key> = {
  view_orders: "permViewOrders",
  manage_orders: "permManageOrders",
  manage_products: "permManageProducts",
  view_reports: "permViewReports",
  manage_staff: "permManageStaff",
};

export const Route = createFileRoute("/staff")({
  head: () => ({
    meta: [
      { title: "Roles & staff — badiyos Merchant Portal" },
      {
        name: "description",
        content:
          "Create roles with permissions and invite staff by mobile number so your team sees only what they need.",
      },
      { property: "og:title", content: "Roles & staff — badiyos Merchant Portal" },
      { property: "og:description", content: "Manage shop roles, permissions and staff access." },
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
  const [roleForm, setRoleForm] = useState<{ open: boolean; role: Role | null }>({
    open: false,
    role: null,
  });
  const [inviteOpen, setInviteOpen] = useState(false);

  const roles = useQuery({
    queryKey: ["merchant-roles", merchant?.id],
    enabled: Boolean(merchant?.id) && allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("merchant_roles")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

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
      const { error } = await supabase
        .from("merchant_staff")
        .update({ status: member.status === "active" ? "inactive" : "active" })
        .eq("id", member.id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["merchant-staff"] }),
    onError: () => toast.error("Could not update this staff member."),
  });

  const setStaffRole = useMutation({
    mutationFn: async ({ member, roleId }: { member: Staff; roleId: string }) => {
      const { error } = await supabase
        .from("merchant_staff")
        .update({ role_id: roleId })
        .eq("id", member.id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["merchant-staff"] }),
    onError: () => toast.error("Could not change the role."),
  });

  if (!merchant) return null;

  return (
    <AppShell
      title={t("rolesStaff")}
      onRefresh={() => Promise.all([roles.refetch(), staff.refetch()])}
    >
      {merchant.status !== "approved" ? (
        <PendingApproval />
      ) : !allowed ? (
        <AccessDenied />
      ) : (
        <div className="space-y-6">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
                <ShieldCheck className="size-5 text-primary" />
                {t("roles")}
              </h2>
              <Button
                size="sm"
                variant="ghost"
                className="font-bold text-primary"
                onClick={() => setRoleForm({ open: true, role: null })}
              >
                <Plus className="size-4" />
                {t("createRole")}
              </Button>
            </div>
            {roles.isLoading && <Loader2 className="mx-auto size-5 animate-spin text-primary" />}
            {roles.data?.length === 0 && (
              <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                {t("noRoles")}
              </p>
            )}
            {roles.data?.map((role) => (
              <div
                key={role.id}
                className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-card"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">{role.name}</p>
                  <p className="text-xs font-semibold text-muted-foreground">
                    {permsOf(role)
                      .map((p) => t(PERM_LABEL[p]))
                      .join(" · ") || "—"}
                  </p>
                </div>
                <button
                  aria-label={t("editRole")}
                  onClick={() => setRoleForm({ open: true, role })}
                  className="rounded-xl bg-primary-soft p-2 text-primary"
                >
                  <Pencil className="size-4" />
                </button>
              </div>
            ))}
          </section>

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
                      {member.name ?? "Staff"}
                    </p>
                    <p className="num text-xs font-semibold text-muted-foreground">
                      +91 {member.phone}
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
                <div className="mt-3 flex items-center gap-3">
                  <Select
                    value={member.role_id ?? ""}
                    onValueChange={(roleId) => setStaffRole.mutate({ member, roleId })}
                  >
                    <SelectTrigger className="rounded-xl text-xs font-bold">
                      <SelectValue placeholder={t("role")} />
                    </SelectTrigger>
                    <SelectContent>
                      {(roles.data ?? []).map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    className="shrink-0 rounded-xl text-xs font-bold"
                    onClick={() => toggleStaff.mutate(member)}
                  >
                    {member.status === "active" ? t("deactivate") : t("activate")}
                  </Button>
                </div>
              </div>
            ))}
          </section>
        </div>
      )}

      {roleForm.open && merchant.id && (
        <RoleForm
          merchantId={merchant.id}
          role={roleForm.role}
          onClose={() => setRoleForm({ open: false, role: null })}
        />
      )}
      {inviteOpen && merchant.id && (
        <InviteForm
          merchantId={merchant.id}
          roles={roles.data ?? []}
          onClose={() => setInviteOpen(false)}
        />
      )}
    </AppShell>
  );
}

function permsOf(role: Role): Permission[] {
  const value = role.permissions;
  const list = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? Object.entries(value as Record<string, unknown>)
          .filter(([, v]) => v === true)
          .map(([k]) => k)
      : [];
  return list.filter((p): p is Permission =>
    (ALL_PERMISSIONS as readonly string[]).includes(String(p)),
  );
}

function RoleForm({
  merchantId,
  role,
  onClose,
}: {
  merchantId: string;
  role: Role | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [name, setName] = useState(role?.name ?? "");
  const [perms, setPerms] = useState<Permission[]>(role ? permsOf(role) : ["view_orders"]);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const payload = { merchant_id: merchantId, name: name.trim(), permissions: perms };
      if (role) {
        const { error } = await supabase.from("merchant_roles").update(payload).eq("id", role.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("merchant_roles").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(t("saved"));
      void queryClient.invalidateQueries({ queryKey: ["merchant-roles"] });
      onClose();
    },
    onError: () => toast.error("Could not save the role."),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>{role ? t("editRole") : t("createRole")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-bold">{t("roleName")}</Label>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              className="rounded-xl"
              placeholder="Counter staff"
            />
            {error && <p className="text-xs font-bold text-destructive">{error}</p>}
          </div>
          <div className="space-y-3">
            <Label className="text-sm font-bold">{t("permissions")}</Label>
            {ALL_PERMISSIONS.map((perm) => (
              <label key={perm} className="flex items-center gap-3 text-sm font-semibold">
                <Checkbox
                  checked={perms.includes(perm)}
                  onCheckedChange={(checked) =>
                    setPerms((prev) =>
                      checked ? [...new Set([...prev, perm])] : prev.filter((p) => p !== perm),
                    )
                  }
                />
                {t(PERM_LABEL[perm])}
              </label>
            ))}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button
              className="flex-1 rounded-xl font-bold"
              disabled={save.isPending}
              onClick={() => {
                if (!name.trim()) {
                  setError(t("required"));
                  return;
                }
                save.mutate();
              }}
            >
              {save.isPending && <Loader2 className="size-4 animate-spin" />}
              {t("save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InviteForm({
  merchantId,
  roles,
  onClose,
}: {
  merchantId: string;
  roles: Role[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [roleId, setRoleId] = useState<string | undefined>(roles[0]?.id);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("merchant_staff").insert({
        merchant_id: merchantId,
        name: name.trim() || null,
        phone,
        role_id: roleId ?? null,
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
          <div className="space-y-2">
            <Label className="text-sm font-bold">{t("role")}</Label>
            <Select value={roleId ?? ""} onValueChange={setRoleId}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder={t("role")} />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
