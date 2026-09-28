import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Camera, Download, KeyRound, Loader2, MapPinOff } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { DeliveryShell, deliveryHead } from "@/components/delivery/DeliveryShell";
import { PhotoViewer, ProofBadge } from "@/components/delivery/ProofViewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listReceivers } from "@/lib/delivery/api";
import { useDT } from "@/lib/delivery/i18n";
import { istDate, istTime, proofReport, signProofUrls, todayIst, type ProofRow } from "@/lib/delivery/proofs";
import { sealDisplay } from "@/lib/delivery/seals";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/delivery/proofs")({
  head: () => deliveryHead("Delivery proofs", "Bill photos and OTP confirmations for delivered orders."),
  component: Proofs,
});

type Filter = "all" | "photo" | "otp";
const PAGE = 100;

function Thumb({ path }: { path: string }) {
  const q = useQuery({ queryKey: ["biz", "proof-urls", path], queryFn: () => signProofUrls([path]), staleTime: 3 * 60_000 });
  return q.data?.[path] ? <img src={q.data[path]} alt="" className="size-full object-cover" /> : <Camera className="m-auto size-5 text-muted-foreground" />;
}

const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;
const safe = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 30) || "x";

function Proofs() {
  const dt = useDT();
  const { merchant } = useAuth();
  const mid = merchant?.id ?? "";
  const [from, setFrom] = useState(todayIst());
  const [to, setTo] = useState(todayIst());
  const [search, setSearch] = useState("");
  const [receiverId, setReceiverId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [viewing, setViewing] = useState<ProofRow | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const receivers = useQuery({ queryKey: ["biz", "receivers"], queryFn: listReceivers });
  const matches = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s || receiverId) return [];
    return (receivers.data ?? []).filter((r) => `${r.name} ${r.contact_name ?? ""} ${r.contact_phone ?? ""}`.toLowerCase().includes(s)).slice(0, 6);
  }, [search, receiverId, receivers.data]);

  const report = useInfiniteQuery({
    queryKey: ["biz", "proof-report", mid, from, to, receiverId],
    enabled: !!mid && !!from && !!to,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => proofReport({ merchantId: mid, from, to, receiverId, limit: PAGE, offset: pageParam }),
    getNextPageParam: (last, all) => (all.length * PAGE < last.total ? all.length * PAGE : undefined),
  });
  const rows = (report.data?.pages ?? []).flatMap((p) => p.rows);
  const total = report.data?.pages[0]?.total ?? 0;
  const list = rows.filter((r) => filter === "all" || r.completed_via === filter);

  async function download() {
    try {
      setProgress(dt("preparing"));
      const all: ProofRow[] = [];
      for (let off = 0; ; off += 500) {
        const r = await proofReport({ merchantId: mid, from, to, receiverId, limit: 500, offset: off });
        all.push(...r.rows);
        if (off + 500 >= r.total) break;
      }
      const chosen = all.filter((r) => filter === "all" || r.completed_via === filter);
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const files: { path: string; name: string }[] = [];
      const lines = [["date", "time", "receiver", "sticker_numbers", "rider", "completed_via", "file_name"].join(",")];
      for (const r of chosen) {
        const stickers = r.seal_codes.map(sealDisplay).join(" ");
        const base = `${istDate(r.completed_at)}_${istTime(r.completed_at).replace(/[^0-9]/g, "")}_${safe(r.receiver_name ?? "")}_${safe(r.seal_codes[0] ?? "")}`;
        const names = r.photo_paths.map((p, k) => {
          const ext = (p.split(".").pop() ?? "jpg").slice(0, 4);
          const name = `${base}_${k + 1}.${ext}`;
          files.push({ path: p, name });
          return name;
        });
        const row = [istDate(r.completed_at), istTime(r.completed_at), r.receiver_name ?? "", stickers, r.rider_name ?? "", r.completed_via ?? "", names.join(" ")];
        lines.push(row.map(csvCell).join(","));
      }
      zip.file("index.csv", "\uFEFF" + lines.join("\n"));
      let done = 0;
      const fetchOne = async (f: { path: string; name: string }) => {
        for (let attempt = 0; attempt < 2; attempt++) {
          const url = (await signProofUrls([f.path], attempt > 0))[f.path];
          if (!url) continue;
          const res = await fetch(url).catch(() => null);
          if (res?.ok) { zip.file(f.name, await res.blob()); break; }
        }
        done++;
        setProgress(`${dt("downloading")} ${done} / ${files.length}`);
      };
      for (let i = 0; i < files.length; i += 300) await signProofUrls(files.slice(i, i + 300).map((f) => f.path));
      for (let i = 0; i < files.length; i += 6) await Promise.all(files.slice(i, i + 6).map(fetchOne));
      setProgress(dt("preparing"));
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `badiyos-proofs-${from}-${to}.zip`; a.rel = "noopener";
      document.body.appendChild(a); a.click();
      setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 2000);
      toast.success(dt("zipReady"));
    } catch {
      toast.error(dt("proofLoadFailed"));
    } finally {
      setProgress(null);
    }
  }

  return (
    <DeliveryShell title={dt("deliveryProofs")} onRefresh={() => report.refetch()}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-semibold text-muted-foreground">{dt("fromDate")}
            <Input type="date" className="mt-1 h-11" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="text-xs font-semibold text-muted-foreground">{dt("toDate")}
            <Input type="date" className="mt-1 h-11" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        <div className="relative">
          <Input className="h-11" placeholder={dt("searchReceiver")} value={search} onChange={(e) => { setSearch(e.target.value); setReceiverId(null); }} />
          {matches.length > 0 && (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-border bg-card shadow-card">
              {matches.map((r) => (
                <button key={r.id} className="block w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { setReceiverId(r.id); setSearch(r.name); }}>
                  {r.name}<span className="ml-2 text-xs text-muted-foreground">{r.contact_phone}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(["all", "photo", "otp"] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
              {f === "all" ? dt("all") : f === "photo" ? dt("viaPhoto") : dt("viaOtp")}
            </Button>
          ))}
        </div>
        <Button className="h-11 w-full" disabled={!!progress || total === 0} onClick={() => void download()}>
          {progress ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          {progress ?? dt("downloadZip")}
        </Button>

        {report.isLoading ? <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" /> : report.error ? (
          <p className="text-sm text-destructive">{dt("proofLoadFailed")}</p>
        ) : list.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">{dt("noProofs")}</p>
        ) : (
          list.map((r) => (
            <button key={r.stop_id} onClick={() => r.photo_paths.length && setViewing(r)} className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left shadow-card">
              <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary-soft">
                {r.photo_paths[0] ? <Thumb path={r.photo_paths[0]} /> : <KeyRound className="size-6 text-primary" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-foreground">{r.receiver_name ?? "—"}</p>
                <p className="num truncate text-xs text-muted-foreground">{r.seal_codes.map(sealDisplay).join(", ") || "—"}</p>
                <p className="num text-xs text-muted-foreground">{istDate(r.completed_at)} {istTime(r.completed_at)}{r.rider_name ? ` · ${r.rider_name}` : ""}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <ProofBadge via={r.completed_via} />
                  {r.location_unverified && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground"><MapPinOff className="size-3" />{dt("locationFirstTime")}</span>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
        {report.hasNextPage && (
          <Button variant="outline" className="w-full" disabled={report.isFetchingNextPage} onClick={() => void report.fetchNextPage()}>
            {dt("loadMore")}
          </Button>
        )}
      </div>
      {viewing && (
        <PhotoViewer
          photos={viewing.photo_paths.map((p) => ({ path: p, time: viewing.completed_at, seals: viewing.seal_codes, unverified: viewing.location_unverified }))}
          index={0}
          rider={viewing.rider_name}
          onClose={() => setViewing(null)}
        />
      )}
    </DeliveryShell>
  );
}
