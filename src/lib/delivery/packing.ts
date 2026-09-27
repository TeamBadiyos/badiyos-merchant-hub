import { useCallback, useEffect, useState } from "react";

const PACKED_KEY = "badiyos.delivery.packedTrips";
const PACKED_EVENT = "badiyos:packed-trips-changed";

function readPackedTrips(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PACKED_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function useTripPacked(tripId: string) {
  const [packed, setPackedState] = useState(false);

  useEffect(() => {
    const sync = () => setPackedState(readPackedTrips().includes(tripId));
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(PACKED_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(PACKED_EVENT, sync);
    };
  }, [tripId]);

  const setPacked = useCallback(
    (next: boolean) => {
      const ids = new Set(readPackedTrips());
      if (next) ids.add(tripId);
      else ids.delete(tripId);
      localStorage.setItem(PACKED_KEY, JSON.stringify([...ids]));
      setPackedState(next);
      window.dispatchEvent(new Event(PACKED_EVENT));
    },
    [tripId],
  );

  return { packed, setPacked };
}

const esc = (value: unknown) =>
  String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export type PackingSheet = {
  title: string;
  heading: string;
  subheading: string;
  columns: [string, string, string, string];
  rows: { label: string; name: string; invoices: string; parcels: string }[];
  footer: string;
};

/**
 * Prints the packing sheet from a standalone iframe document.
 * The app's own layout is `position: fixed` / `overflow: hidden`, so printing the
 * live DOM produced a blank page — this renders clean print-only markup instead.
 */
export function printPackingSheet(sheet: PackingSheet) {
  if (typeof document === "undefined") return;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(sheet.title)}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;padding:16px;font-family:"Nunito Sans",Arial,Helvetica,sans-serif;color:#111}
  h1{margin:0;font-size:16px}
  .sub{margin:4px 0 12px;font-size:11px;color:#555}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th,td{border:1px solid #999;padding:6px 8px;text-align:left;vertical-align:top}
  th{background:#f0e6f5;font-size:11px;text-transform:uppercase}
  .lbl{width:44px;font-weight:800;text-align:center}
  .qty{width:56px;text-align:right;font-weight:700}
  .tick{width:36px}
  .foot{margin-top:12px;font-size:11px;color:#555}
  @page{margin:10mm}
</style></head><body>
<h1>${esc(sheet.heading)}</h1>
<p class="sub">${esc(sheet.subheading)}</p>
<table><thead><tr>
  <th class="lbl">${esc(sheet.columns[0])}</th>
  <th>${esc(sheet.columns[1])}</th>
  <th>${esc(sheet.columns[2])}</th>
  <th class="qty">${esc(sheet.columns[3])}</th>
  <th class="tick"></th>
</tr></thead><tbody>
${sheet.rows
  .map(
    (r) =>
      `<tr><td class="lbl">${esc(r.label)}</td><td>${esc(r.name)}</td><td>${esc(r.invoices)}</td><td class="qty">${esc(r.parcels)}</td><td class="tick"></td></tr>`,
  )
  .join("")}
</tbody></table>
<p class="foot">${esc(sheet.footer)}</p>
</body></html>`;

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const run = () => {
    try {
      win.focus();
      win.print();
    } finally {
      window.setTimeout(() => frame.remove(), 1_000);
    }
  };
  if (doc.readyState === "complete") window.setTimeout(run, 100);
  else frame.addEventListener("load", () => window.setTimeout(run, 100), { once: true });
}
