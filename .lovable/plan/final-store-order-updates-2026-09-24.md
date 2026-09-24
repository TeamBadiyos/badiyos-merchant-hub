# Final store order updates

Uses only existing backend functions. No new tables, columns or functions.

## 1. Mark Ready on Expert-delivered orders
- Show "Mark Ready" when the order is `accepted`, `preparing` or `expert_assigned` (add `expert_assigned` to the status list with a label "Rider assigned", English + Marathi).
- Button calls `merchant_advance_order(order, "ready")` (already the case).
- Test on the demo shop: create a test order linked to a delivery, accept it, tap Mark Ready, confirm the status reads back as Ready.

## 2. Rider name + call button
- New hook calling `merchant_get_order_rider(order_id)`, refreshing every 10 seconds while the order is not yet delivered/cancelled.
- When it returns data (rider assigned through picked up), the delivery box on the order card shows the rider's name and a "Call" button (`tel:` link). When it returns nothing, nothing extra is shown.
- The existing pickup OTP and 10-second refresh stay as they are.

## 3. Lock-screen alert: only "Open"
- Android notification: remove the Accept and Reject action buttons; add a single "Open" action that opens the app on the Orders screen.
- Ringing screen: replace Accept/Reject with one "Open" button; remove the direct-decision path so the lock screen can never reject.
- Rejecting always goes through the in-app reason picker.

## Technical details
- Files: `src/lib/order-status.ts`, `src/lib/order-actions.ts` (new `useOrderRider`), `src/components/OrderCard.tsx`, `src/lib/i18n.tsx`, `MerchantMessagingService.java`, `OrderRingActivity.java`, `activity_order_ring.xml`, and `src/lib/native-order-actions.ts` (handle "open" only: navigate to /orders, never call `merchant_decide_order`).
- Android changes need a new app build to take effect on phones.
