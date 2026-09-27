# Cancel trip (before pickup)

## What the user gets
- On the trip screen, a **Cancel trip** button appears only while the parcels are not yet picked up.
- Tapping it opens a dialog: pick/type a reason (required), then confirm.
- Dialog text: "Orders go back to Pending and will go in the next dispatch." plus the refund amount.
- If the rider has already reached the pickup, the dialog also shows the **cancellation fee** and the **refund after fee** before confirming.
- After success: toast with the actual refund returned by the backend, trip refreshes, orders show as Pending.
- If the backend refuses (e.g. "Parcels already picked up"), its message is shown as-is.
- Button disappears once pickup is done. English + Marathi.

## Current backend (checked live)
- `business_cancel_trip(_batch_id, _reason, _actor_label)` exists; it needs the **batch id**, only allows dispatched trips, refuses after pickup, and returns `cancellation_fee` and `refund_amount` only after cancelling.
- Fee applies only when the rider status is `ARRIVED_PICKUP` (percentage of the trip amount from courier settings).
- `business_get_trip_otps` (what the trip screen reads) does not return the batch id, trip amount or a fee preview, so the fee cannot be shown before confirming today.

## Changes
1. **Backend (one migration, re-reading the live definition first):** extend `business_get_trip_otps` to also return `batch_id`, `trip_amount`, `can_cancel` (dispatched, not picked up, status REQUESTED/SEARCHING/DRIVER_ASSIGNED/ARRIVED_PICKUP), `cancel_fee_preview` and `refund_preview` using the same formula as the cancel function. Ownership checks unchanged. No new tables, columns or functions; `business_cancel_trip` untouched.
2. **App:** add `cancelTrip(batchId, reason)` in the delivery API (passes `_actor_label` like other delivery calls); a `CancelTripDialog` on the trip screen with reason choices (Rider late, Order changed, Customer cancelled, Other + note); visibility driven by `can_cancel`; errors shown via the backend message.
3. Home active-trip cards unchanged.

## Technical notes
- Refund toast uses the function's returned `refund_amount`, not the preview.
- Invalidate trip, active trips, orders and wallet queries after success.
