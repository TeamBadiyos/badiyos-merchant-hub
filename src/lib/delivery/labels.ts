import QRCode from "qrcode";

import devanagariFontUrl from "@/assets/NotoSansDevanagari-Regular.ttf?url";
import type { TripInfo } from "@/lib/delivery/api";

const LABEL_FORMAT_KEY = "badiyos.delivery.labelFormat";

export type LabelFormat = "thermal" | "a4";

export type ParcelLabel = {
  tripNo: number;
  dropLabel: string;
  packetNo: number;
  packetTotal: number;
  packetCode: string;
  receiverName: string;
  address: string;
  invoices: string[];
  dispatchDate: string;
  businessName: string;
};

export function readLabelFormat(): LabelFormat {
  if (typeof window === "undefined") return "thermal";
  return localStorage.getItem(LABEL_FORMAT_KEY) === "a4" ? "a4" : "thermal";
}

export function saveLabelFormat(format: LabelFormat) {
  if (typeof window !== "undefined") localStorage.setItem(LABEL_FORMAT_KEY, format);
}

export function parcelLabelsFromTrips(trips: TripInfo[]): ParcelLabel[] {
  const labels = trips.flatMap((trip) =>
    trip.stops.flatMap((stop) =>
      (stop.packets ?? []).map((packet) => ({
        tripNo: packet.trip_no,
        dropLabel: packet.drop_label,
        packetNo: packet.packet_no,
        packetTotal: packet.packet_total,
        packetCode: packet.code,
        receiverName: stop.receiver_name ?? stop.contact_name ?? "—",
        address: stop.address ?? "—",
        invoices: stop.reference_nos ?? [],
        dispatchDate: trip.dispatch_date ?? "—",
        businessName: trip.business_name ?? "—",
      })),
    ),
  );

  const packetCount = trips.reduce(
    (total, trip) => total + trip.stops.reduce((sum, stop) => sum + (stop.packets?.length ?? 0), 0),
    0,
  );
  if (labels.length !== packetCount || labels.some((label) => !label.packetCode || !label.dropLabel)) {
    throw new Error("Parcel label data is incomplete. Please refresh and try again.");
  }
  return labels;
}

const esc = (value: unknown) =>
  String(value ?? "").replace(/[&<>\"]/g, (character) => {
    const replacements: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
    return replacements[character] ?? character;
  });

async function labelMarkup(label: ParcelLabel) {
  const qr = await QRCode.toDataURL(label.packetCode, { errorCorrectionLevel: "M", margin: 0, width: 320 });
  return `<article class="label">
    <div class="copy">
      <div class="top"><strong>T${esc(label.tripNo)} · ${esc(label.dropLabel)}</strong><strong>${esc(label.packetNo)}/${esc(label.packetTotal)}</strong></div>
      <div class="receiver">${esc(label.receiverName)}</div>
      <div class="address">${esc(label.address)}</div>
      <div class="invoice">${esc(label.invoices.length ? label.invoices.join(", ") : "—")}</div>
      <div class="meta">${esc(label.dispatchDate)} · ${esc(label.businessName)}</div>
    </div>
    <div class="qr"><img src="${qr}" alt=""><div>${esc(label.packetCode)}</div></div>
  </article>`;
}

async function makeLabelHtml(labels: ParcelLabel[], format: LabelFormat, title: string) {
  const markup = await Promise.all(labels.map(labelMarkup));
  const page = format === "thermal" ? "size:100mm 50mm;margin:0" : "size:A4 portrait;margin:10mm";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>
    @font-face{font-family:LabelSans;src:url('${devanagariFontUrl}') format('truetype');font-weight:400}
    *{box-sizing:border-box} html,body{margin:0;padding:0;color:#111;background:#fff;font-family:LabelSans,Arial,sans-serif}
    .sheet{${format === "a4" ? "display:grid;grid-template-columns:repeat(2,95mm);grid-auto-rows:69.25mm;width:190mm" : ""}}
    .label{width:${format === "thermal" ? "100mm" : "95mm"};height:${format === "thermal" ? "50mm" : "69.25mm"};padding:${format === "thermal" ? "4mm" : "5mm"};display:flex;gap:3mm;overflow:hidden;break-inside:avoid;page-break-inside:avoid;${format === "a4" ? "border:0.25mm dashed #888" : "page-break-after:always"}}
    .label:last-child{page-break-after:auto}.copy{min-width:0;flex:1;display:flex;flex-direction:column}.top{display:flex;justify-content:space-between;gap:2mm;font-size:${format === "thermal" ? "16pt" : "15pt"};line-height:1.05}.receiver{margin-top:2mm;font-size:11pt;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.address{margin-top:1mm;font-size:8pt;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.invoice{margin-top:1mm;font-size:8pt;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.meta{margin-top:auto;font-size:6.5pt;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.qr{width:${format === "thermal" ? "27mm" : "30mm"};flex:none;text-align:center;font:700 6.5pt monospace;overflow:hidden}.qr img{display:block;width:100%;aspect-ratio:1}.qr div{margin-top:1mm;overflow-wrap:anywhere;line-height:1.05}
    @page{${page}}
  </style></head><body><main class="sheet">${markup.join("")}</main></body></html>`;
}

export async function printParcelLabels(labels: ParcelLabel[], format: LabelFormat, title: string) {
  if (typeof document === "undefined" || labels.length === 0) return;
  const html = await makeLabelHtml(labels, format, title);
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    throw new Error("Printing is not available on this device.");
  }
  doc.open();
  doc.write(html);
  doc.close();
  await doc.fonts.ready;
  win.focus();
  win.print();
  window.setTimeout(() => frame.remove(), 2_000);
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index] ?? 0);
  return btoa(binary);
}

export async function downloadParcelLabels(labels: ParcelLabel[], format: LabelFormat, title: string) {
  if (labels.length === 0) return;
  const [{ jsPDF }, fontResponse, qrImages] = await Promise.all([
    import("jspdf"),
    fetch(devanagariFontUrl),
    Promise.all(labels.map((label) => QRCode.toDataURL(label.packetCode, { errorCorrectionLevel: "M", margin: 0, width: 320 }))),
  ]);
  const fontBase64 = arrayBufferToBase64(await fontResponse.arrayBuffer());
  const thermal = format === "thermal";
  const pdf = new jsPDF({ orientation: thermal ? "landscape" : "portrait", unit: "mm", format: thermal ? [100, 50] : "a4" });
  pdf.addFileToVFS("NotoSansDevanagari.ttf", fontBase64);
  pdf.addFont("NotoSansDevanagari.ttf", "LabelSans", "normal");
  pdf.setFont("LabelSans", "normal");

  labels.forEach((label, index) => {
    if (thermal && index > 0) pdf.addPage([100, 50], "landscape");
    if (!thermal && index > 0 && index % 8 === 0) pdf.addPage("a4", "portrait");
    const column = thermal ? 0 : index % 2;
    const row = thermal ? 0 : Math.floor((index % 8) / 2);
    const x = thermal ? 0 : 10 + column * 95;
    const y = thermal ? 0 : 10 + row * 69.25;
    const width = thermal ? 100 : 95;
    const height = thermal ? 50 : 69.25;
    if (!thermal) {
      pdf.setDrawColor(145);
      pdf.setLineDashPattern([1.2, 1.2], 0);
      pdf.rect(x, y, width, height);
      pdf.setLineDashPattern([], 0);
    }
    const inset = thermal ? 4 : 5;
    const qrSize = thermal ? 27 : 30;
    const textWidth = width - inset * 2 - qrSize - 3;
    pdf.setTextColor(17);
    pdf.setFontSize(16);
    pdf.text(`T${label.tripNo} · ${label.dropLabel}`, x + inset, y + inset + 5);
    pdf.text(`${label.packetNo}/${label.packetTotal}`, x + width - inset - qrSize - 3, y + inset + 5, { align: "right" });
    pdf.setFontSize(11);
    pdf.text(label.receiverName, x + inset, y + inset + 12, { maxWidth: textWidth });
    pdf.setFontSize(8);
    pdf.text(pdf.splitTextToSize(label.address, textWidth).slice(0, 2), x + inset, y + inset + 17);
    pdf.text(label.invoices.length ? label.invoices.join(", ") : "—", x + inset, y + inset + 27, { maxWidth: textWidth });
    pdf.setFontSize(6.5);
    pdf.setTextColor(85);
    pdf.text(`${label.dispatchDate} · ${label.businessName}`, x + inset, y + height - inset, { maxWidth: textWidth });
    const qrX = x + width - inset - qrSize;
    pdf.addImage(qrImages[index] ?? "", "PNG", qrX, y + inset, qrSize, qrSize);
    pdf.setFont("courier", "bold");
    pdf.setFontSize(6.5);
    pdf.setTextColor(17);
    pdf.text(label.packetCode, qrX + qrSize / 2, y + inset + qrSize + 3, { align: "center", maxWidth: qrSize });
    pdf.setFont("LabelSans", "normal");
  });

  pdf.save(`${title.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase()}.pdf`);
}