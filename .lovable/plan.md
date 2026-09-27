# Partial pickup — remove packets from a trip

No backend changes. `capacitor.config.ts` untouched. English + Marathi, purple theme.

## What the live backend returns (checked)

- `business_remove_packets_from_trip(_batch_id, _order_ids, _reason)`
  - success: `{ ok:true, trip_cancelled:false, removal_id, codes[], packets_removed, refund, new_total, drops_left }`
  - all removed: `{ ok:true, trip_cancelled:true, codes[], result }` (goes through the normal trip cancel, so fee/refund come from `result`)
  - refused: `{ ok:false, reason }` with `pickup_done | not_in_trip | nothing_selected | packet_scanned | not_business_trip`
  - A reason is **required** by the backend (empty → error). So "optional reason" in the UI sends a default text ("Removed by business") when left blank.
- `business_get_trip_otps` now returns `removed_packets[]`: `code, drop_label, receiver_name, reason, notes, removed_by ('rider'|'business'), removed_at`.
- Trip `packets[]` have `code` + `scanned_pickup_at` but **no order id**. The remove call needs business order ids.
- Wallet refund line reads `Packets removed from trip T<no> #<id>`.

## 1. Trip detail — select and remove

- Show only while `can_cancel` (dispatched, pickup not done).
- Load this trip's business orders (id, seal_code, packet_count, drop_stop_id, receiver) by `courier_order_id` — read-only, same way the Orders list reads them.
- Each order gets one row under its drop (C1, C2…): sticker number (104521-7) or "N packets". Checkbox only if none of its packets are scanned; scanned ones show a small "Scanned" tag, no checkbox.
- Sticky "Is trip se hatao (N)" button → dialog: optional reason (quick choices + note), message "Ye packets agle slot me jayenge".
- If every remaining order is selected → red warning "Poori trip cancel ho jayegi — rider pickup pe aa chuka hai toh cancel fee lag sakti hai." (fee preview shown when trip status is at pickup).
- Results:
  - ok → "N packets hataye, ₹X wallet me wapas" (₹ part hidden when refund is 0)
  - trip_cancelled → "Trip cancel ho gayi"
  - packet_scanned → "Ye packet rider scan kar chuka hai"
  - other reasons → plain friendly text; refresh trip, orders, wallet.

## 2. Trip detail — "Trip se hataye gaye" section

List from `removed_packets`: sticker/packet code, drop label, receiver, reason, "Rider" / "Aap", time (IST).

## 3. Rider removals — push + Home banner

- Push already arrives from backend; add its tap target to the existing delivery deep-link handler (opens Orders filtered to those stickers).
- Delivery Home banner per trip with rider removals in the active trips: "Trip T3: N packets rider ko nahi mile — agle slot me jayenge". Tap → Orders "Waiting — next slot" filter. Dismiss is device-local per removal.

## 4. Orders — "Waiting — next slot"

- A pending order that has a removal record shows the status "Waiting — next slot" (instead of plain Pending), with the removal reason.
- "Cancel order" stays available; its confirm adds the warning "Sticker void ho jayega, naya sticker lagana padega" when the order has a sticker.

## 5. Wallet

Formatter maps `Packets removed from trip T3 #…` → "Packets removed from trip T3" / Marathi equivalent (no raw id).

## 6. Labels

Everywhere uses backend `trip_no` as "T3" and backend `drop_label` (C1, C2…); nothing calculated locally.

## Technical details

- `api.ts`: `removePackets()` via `bizRpc` (without `_actor_label`, which this function doesn't accept), `RemovedPacket` type, `removed_packets` on `TripInfo`, `listTripOrders(courierOrderId)`, `listRemovedPackets(since)` from `business_trip_removed_packets` (read access to be confirmed at build start; fallback: use trips' `removed_packets`).
- New `RemovePacketsDialog.tsx`, `RemovedPacketsList.tsx`; edits to `delivery.trip.$id.tsx`, `delivery.index.tsx`, `delivery.orders.tsx`, `delivery.wallet.tsx`, `deep-links.ts`, `i18n.ts`.
- First build step: check the rider-removal push payload type and the removed-packets read policy; adapt without backend changes.
- Not testable end-to-end here (no signed-in session / no dispatched trips); verify on phone after the next dispatch.
