# Scan-first New Order screen (Delivery mode)

## What changes for the merchant
- **New order** opens straight into a live camera scanner. Each sticker scanned shows up as a chip ("104521-7 ✓") with a count ("3 packets"). Tap ✕ to remove one.
- Messages in plain words: "Ye badiyos sticker nahi hai", "Number galat hai, dobara check karo", "Ye sticker aapke business ka nahi hai", "Ye sticker pehle se use hua hai — Order #…, receiver, date", "Ye sticker cancel ho chuka hai", "Already added".
- "Type number" button for stickers that won't scan (accepts 1045217 or 104521-7); chip shows a small "manual" tag.
- **Select Receiver** (enabled after 1+ packet): search by name / shop / phone, Recent 5 and Most frequent at the top, "+ Add receiver" uses the existing form. Pickup point picked automatically if only one, otherwise a dropdown that remembers the last choice.
- Sticky bottom bar: "Place Order — 3 packets → Shree Medical". Success: "3 orders placed", list clears, camera keeps scanning. If some stickers fail, those chips turn red with the reason and nothing is created until fixed.
- Removed from New order: invoice number, description, packet count.
- **Orders list / details**: show the sticker number instead of invoice no. (old orders unchanged), search by sticker number, plus a scan icon to search by scanning.
- **Delivery Home**: "Stickers left: 1,240"; red with "Order stickers" when under 3 days of stock.
- Purple theme kept; English + Marathi text; capacitor.config.ts untouched.

## Technical details
- RPCs (verified live): `business_seal_check(_merchant_id, _raw)`, `business_create_packet_orders(_merchant_id, _receiver_id, _pickup_point_id, _codes[], _entry_methods[], _actor_label)` returning `{ok:false, failed:[{index,input,code,error,...}]}` on failure, `business_seal_stock(_merchant_id)` returning `available, used, void, avg_used_per_day_7d`. All take the merchant id from `useAuth().merchant.id`; actor label sent via `bizRpc`.
- Low stock rule: `available < avg_used_per_day_7d * 3` (and avg > 0).
- Scanner: `getUserMedia` (rear camera) + a JS QR decoder (`jsqr` on canvas frames, or native `BarcodeDetector` when available). Same code ignored for 2 s; beep via existing `alert-sound` style tone + `hapticNotify`. Camera stops when leaving the screen. Android already has camera permission via WebView prompt; if denied, show "Type number" fallback.
- Error codes mapped to i18n keys (en/mr) with the Hinglish lines above; ALREADY_USED uses order/receiver/date fields from the check response; DUPLICATE_IN_LIST handled too; unknown → friendly generic.
- Recent / frequent receivers: derived from the existing bounded `listOrders` data (receiver counts + latest), no new queries on tables beyond reads.
- Last pickup point stored on the device.
- Orders list: read sticker code via `business_seal_stickers(code)` joined on `business_order_id` in `listOrders` (read-only); fallback to `reference_no` when none. Scan-to-search reuses the scanner component in a small dialog.
- Files: rewrite `src/routes/delivery.new.tsx`; new `src/components/delivery/QrScanner.tsx`, `src/lib/delivery/seals.ts`; edit `src/lib/delivery/api.ts`, `src/routes/delivery.orders.tsx`, `src/routes/delivery.index.tsx`, `src/lib/delivery/i18n.ts`. Bulk upload screen unchanged.
- No database changes.
