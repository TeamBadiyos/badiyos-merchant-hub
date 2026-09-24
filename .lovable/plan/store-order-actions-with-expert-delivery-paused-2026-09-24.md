# Store order actions with Expert delivery — PAUSED

Waiting on the Customer App project to finish the delivery backend (rider link, delivery status, pickup OTP, auto courier dispatch on Accept). No tables, columns or functions will be created here.

## When you say the backend is done
1. Read the live schema and the new backend functions (accept/reject/ready, delivery status, pickup OTP).
2. Build only the merchant screens on top of them:
   - Remove the "Mark completed"/"Delivered" button. Merchant can only Accept, Reject (reason: OUT_OF_STOCK, STORE_CLOSED, TECHNICAL_ISSUE, OTHER) and Mark Ready.
   - New order bottom sheet: sound, item list, total, 5-minute countdown. At 0 the order is auto-rejected (via the backend, if it provides this; otherwise flagged to you).
   - After Accept, the order card shows delivery progress: "Finding rider…" → rider name + phone + "Arriving" → "Picked up" → "Delivered", updating live.
   - Pickup OTP in large text on the card with the note "Rider ko saman dete waqt ye OTP batayein".
   - Every action goes through backend functions, no direct table writes.
   - English + Marathi text.
3. Test as the demo shop (9999900000) with a test order.

## Current state (checked)
Shop orders today have no rider, delivery status or pickup OTP fields; the delivery OTP/rider data only exists for courier orders, with no link to shop orders.
