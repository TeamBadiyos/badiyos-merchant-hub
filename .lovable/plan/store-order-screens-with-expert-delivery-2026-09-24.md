# Store order screens with Expert delivery

Uses only the existing backend functions. No new tables, columns or functions.

## What the merchant will see

1. **New order sheet**: slides up with a sound when a new paid order arrives. Shows order number, items, total and a 5-minute countdown. The timer is display only: at 0 it reads "Time up", and the backend's auto-reject shows up through the live refresh, which closes the sheet. Buttons: Accept, Reject.
2. **Reject with a reason**: a small picker with Out of stock / Store closed / Technical issue / Other. Reject stays disabled until a reason is picked.
3. **Order card buttons**: Accept / Reject on new orders, and **Mark Ready** on accepted/preparing orders. The Complete/Delivered button is removed completely. Per your answer, Mark Ready stays on delivery orders too. Until the backend allows it, tapping it shows "Delivery is managed by the rider".
4. **Rider status on the card** once accepted: Finding rider… → Rider arriving → Rider at shop → Picked up → Delivered. For now it shows the status only, without rider name or phone (your choice). Those get added once the backend shares them.
5. **Pickup OTP**: once the rider is at the shop, the card shows the code in large text with "Rider ko saman dete waqt ye OTP batayein".
6. English + Marathi text for every new label.

## Technical details

- New orders = status `placed`/`paid` (plus legacy `pending` COD). Update `ORDER_STATUSES`, labels and tones: add `placed`, `paid`, `delivered`, `cancelled`. Remove `completed` from `NEXT_STATUS`.
- `merchant_decide_order(_order_id, _decision, _reason)`: reason codes `OUT_OF_STOCK | STORE_CLOSED | TECHNICAL_ISSUE | OTHER`. The native Android ring bridge rejects with `OTHER` (it has no picker). The new sheet opens instead for a real reason when the app is open.
- `merchant_advance_order(_order_id, 'ready')` only. Add friendly errors for `delivery_managed_by_expert` and `reason_required`.
- Rider status: `merchant_get_pickup_otp` returns `{ok:false, courier_status}` before arrival and `{ok:true, otp}` at `ARRIVED_PICKUP`. It's polled with React Query every 10s for accepted orders that have `courier_order_id` and no `picked_up_at`/`delivered_at`. After that, `picked_up_at`/`delivered_at`/status come from `merchant_orders` via the existing realtime channel. Status mapping: SEARCHING/no expert → Finding rider; ASSIGNED → Arriving; ARRIVED_PICKUP → At shop + OTP; picked_up_at → Picked up; delivered → Delivered.
- Countdown: 5 minutes from `placed_at ?? created_at`, ticking every second. It never calls reject.
- Sheet: new `NewOrderSheet` (shadcn Drawer) mounted in AppShell. It opens on a realtime INSERT/UPDATE into placed/paid (plus the existing chime) and also for any open new orders on load. It closes when the order leaves the new state.
- Files: `OrderCard.tsx`, new `NewOrderSheet.tsx`, new `RejectReasonDialog`, `order-status.ts`, `use-order-realtime.ts`, `native-order-actions.ts`, `home.tsx` (new-order filter), `i18n.tsx`.
- Test as the demo shop 9999900000 with a test paid order (inserted via service role for testing only): sheet + countdown, reject with reason, accept → rider status, Ready error message.
