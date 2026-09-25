import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Download, Loader2, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { DeliveryShell, deliveryHead } from "@/components/delivery/DeliveryShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { parseCsv } from "@/lib/csv";
import { bizRpc, getProfile, listReceivers, phone10 } from "@/lib/delivery/api";
import { useDT } from "@/lib/delivery/i18n";

export const Route = createFileRoute("/delivery/bulk")({
  head: () => deliveryHead("Bulk delivery upload", "Create many delivery orders from a CSV."),
  component: Bulk,
});

const SAMPLE = `receiver_phone,reference_no,description,packets
9876543210,INV-1001,Medicines,1
9123456780,INV-1002,Grocery box,2
`;

function Bulk() {
  const dt = useDT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const receivers = useQuery({ queryKey: ["biz", "receivers"], queryFn: listReceivers });
  const profile = useQuery({ queryKey: ["biz", "profile"], queryFn: getProfile });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<number, string>>({});

  const pickup = useMemo(() => {
    const list = (profile.data?.pickup_points ?? []).filter((p) => p.is_active);
    return list.find((p) => p.is_default) ?? list[0] ?? null;
  }, [profile.data]);

  const rows = useMemo(() => {
    const raw = parseCsv(text);
    if (!raw.length) return [];
    const header = raw[0]!.map((h) => h.trim().toLowerCase());
    const hasHeader = header.includes("receiver_phone");
    const idx = (c: string, fb: number) => (hasHeader ? header.indexOf(c) : fb);
    const byPhone = new Map((receivers.data ?? []).filter((r) => r.is_active).map((r) => [phone10(r.contact_phone ?? ""), r]));
    return (hasHeader ? raw.slice(1) : raw).map((cells, i) => {
      const get = (c: string, fb: number) => (cells[idx(c, fb)] ?? "").trim();
      const phone = phone10(get("receiver_phone", 0));
      const packets = Number(get("packets", 3) || "1");
      const r = byPhone.get(phone);
      const errors: string[] = [];
      if (!r) errors.push(dt("receiverNotFound"));
      if (!Number.isInteger(packets) || packets < 1 || packets > 50) errors.push(dt("packetsInvalid"));
      return {
        n: i + 1,
        phone,
        receiver: r ?? null,
        reference_no: get("reference_no", 1),
        description: get("description", 2),
        packets,
        errors,
      };
    });
  }, [text, receivers.data, dt]);

  const bad = rows.filter((r) => r.errors.length || serverErrors[r.n]).length;

  const submit = async () => {
    setBusy(true);
    setServerErrors({});
    try {
      const res = await bizRpc<{ ok: boolean; created_ids: string[]; errors: { row: number; error: string }[] }>(
        "business_create_orders_bulk",
        {
          _orders: rows.map((r) => ({
            receiver_id: r.receiver!.id,
            pickup_point_id: pickup?.id ?? null,
            reference_no: r.reference_no || null,
            description: r.description || null,
            packet_count: r.packets,
          })),
        },
      );
      if (!res.ok) {
        setServerErrors(Object.fromEntries(res.errors.map((e) => [e.row, e.error])));
        return;
      }
      toast.success(`${res.created_ids.length} ${dt("created")}`);
      void qc.invalidateQueries({ queryKey: ["biz"] });
      void navigate({ to: "/delivery/orders" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DeliveryShell title={dt("bulkUpload")}>
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">{dt("csvHint")}</p>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" asChild>
            <label className="cursor-pointer">
              <Upload className="size-4" />
              {dt("uploadCsv")}
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setText(await f.text());
                  e.target.value = "";
                }}
              />
            </label>
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              const a = document.createElement("a");
              a.href = URL.createObjectURL(new Blob([SAMPLE], { type: "text/csv" }));
              a.download = "badiyos-delivery-sample.csv";
              a.click();
            }}
          >
            <Download className="size-4" />
            {dt("sampleCsv")}
          </Button>
        </div>
        <Textarea rows={6} placeholder={dt("pasteCsv")} value={text} onChange={(e) => setText(e.target.value)} className="num text-xs" />

        {rows.length > 0 && (
          <>
            <p className="text-sm font-bold text-foreground">
              {dt("preview")}: {rows.length - bad} {dt("rowsOk")}
              {bad > 0 && <span className="text-destructive"> · {bad} {dt("rowsErr")}</span>}
            </p>
            <div className="divide-y divide-border rounded-xl border border-border bg-card">
              {rows.map((r) => {
                const err = [...r.errors, serverErrors[r.n]].filter(Boolean);
                return (
                  <div key={r.n} className={`p-3 text-xs ${err.length ? "bg-destructive/5" : ""}`}>
                    <p className="font-bold text-foreground">
                      {dt("row")} {r.n}: {r.receiver?.name ?? r.phone} · {r.reference_no || "—"} · {r.packets}
                    </p>
                    {err.length > 0 && <p className="mt-0.5 font-semibold text-destructive">{err.join(", ")}</p>}
                  </div>
                );
              })}
            </div>
            <Button
              size="lg"
              className="h-12 w-full"
              disabled={busy || rows.some((r) => r.errors.length) || !pickup}
              onClick={() => void submit()}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {dt("createAll")} ({rows.length})
            </Button>
          </>
        )}
      </div>
    </DeliveryShell>
  );
}
