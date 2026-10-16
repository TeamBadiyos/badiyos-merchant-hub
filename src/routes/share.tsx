import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Copy, Download, MessageCircle, Share2 } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/use-require-auth";

export const Route = createFileRoute("/share")({
  head: () => ({
    meta: [
      { title: "Share store link — badiyos Merchant Portal" },
      { name: "description", content: "Share your badiyos store link, download a QR poster and see visits and orders from the link." },
      { property: "og:title", content: "Share store link — badiyos" },
      { property: "og:description", content: "Your store link, QR code and poster." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SharePage,
});

const TX = {
  en: { title: "Share store link", copy: "Copy", copied: "Link copied", wa: "WhatsApp", share: "Share", poster: "Download poster",
    order: "Order on badiyos", visits: "Visits from link (30 days)", orders: "Orders from link (30 days)",
    msg: "Order from {s} on badiyos:" },
  mr: { title: "दुकान लिंक शेअर करा", copy: "कॉपी", copied: "लिंक कॉपी झाली", wa: "WhatsApp", share: "शेअर", poster: "पोस्टर डाउनलोड करा",
    order: "badiyos वर ऑर्डर करा", visits: "लिंकवरून भेटी (३० दिवस)", orders: "लिंकवरून ऑर्डर्स (३० दिवस)",
    msg: "{s} कडून badiyos वर ऑर्डर करा:" },
};

function SharePage() {
  const { lang } = useI18n();
  const L = TX[lang === "mr" ? "mr" : "en"];
  const merchant = useRequireAuth();
  const [qr, setQr] = useState<string | null>(null);
  const slug = merchant?.store_slug;
  const url = slug ? `https://badiyos.com/store/${slug}?src=link` : "https://badiyos.com";
  const name = merchant?.store_name ?? "badiyos";

  useEffect(() => {
    void QRCode.toDataURL(url, { width: 600, margin: 1, color: { dark: "#000000", light: "#ffffff" } }).then(setQr);
  }, [url]);

  const stats = useQuery({
    queryKey: ["merchant-insights", merchant?.id, 30, "link"],
    enabled: !!merchant?.id && merchant?.status === "approved",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("merchant_insights", { _days: 30 });
      if (error) throw error;
      const d = data as { sources?: { link?: number }; link_orders?: number };
      return { visits: Number(d.sources?.link ?? 0), orders: Number(d.link_orders ?? 0) };
    },
  });

  if (!merchant) return null;
  const msg = `${L.msg.replace("{s}", name)} ${url}`;

  async function poster() {
    if (!qr) return;
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: "a5" });
    const brand = getComputedStyle(document.documentElement).getPropertyValue("--brand").trim();
    doc.setFillColor(107, 51, 106); // brand #6B336A
    void brand;
    doc.rect(0, 0, 148, 40, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text(name, 74, 24, { align: "center", maxWidth: 130 });
    doc.addImage(qr, "PNG", 29, 55, 90, 90);
    doc.setTextColor(107, 51, 106);
    doc.setFontSize(20);
    doc.text("Order on badiyos", 74, 162, { align: "center" });
    doc.setTextColor(90, 90, 90);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(url.replace("?src=link", ""), 74, 172, { align: "center" });
    doc.save(`${slug ?? "store"}-poster.pdf`);
  }

  return (
    <AppShell title={L.title} onRefresh={() => stats.refetch()}>
      <div className="space-y-4">
        <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <p className="break-all text-sm font-bold text-primary">{url.replace("?src=link", "")}</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Button variant="outline" onClick={() => void navigator.clipboard.writeText(url).then(() => toast.success(L.copied))}>
              <Copy className="size-4" />{L.copy}
            </Button>
            <Button variant="outline" asChild>
              <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"><MessageCircle className="size-4" />{L.wa}</a>
            </Button>
            <Button variant="outline" onClick={() => {
              if (navigator.share) void navigator.share({ title: name, text: msg, url }).catch(() => {});
              else void navigator.clipboard.writeText(url).then(() => toast.success(L.copied));
            }}>
              <Share2 className="size-4" />{L.share}
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 text-center shadow-card">
          {qr && <img src={qr} alt="QR" className="mx-auto size-56 rounded-xl" />}
          <p className="mt-2 text-sm font-bold text-foreground">{name}</p>
          <p className="text-xs font-semibold text-primary">{L.order}</p>
          <Button className="mt-4 w-full" onClick={() => void poster()}><Download className="size-4" />{L.poster}</Button>
        </section>

        <div className="grid grid-cols-2 gap-3">
          {[[L.visits, stats.data?.visits], [L.orders, stats.data?.orders]].map(([l, v]) => (
            <div key={String(l)} className="rounded-2xl border border-border bg-card p-4 shadow-card">
              <p className="num text-2xl font-extrabold text-primary">{v ?? "—"}</p>
              <p className="mt-1 text-xs font-bold text-muted-foreground">{l}</p>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
