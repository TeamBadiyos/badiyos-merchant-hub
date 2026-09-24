# Hide unpaid online orders completely

## Rule
An order is visible to the merchant only if it is a cash order (`payment_mode = 'cod'`) OR `payment_status = 'paid'`. Every other online order is hidden everywhere. Cash orders behave exactly as today.

## Changes
1. **Order list query** (`src/lib/orders.ts`): add a filter `payment_mode.eq.cod OR payment_status.eq.paid` so unpaid online orders never load — this covers Home new orders, Pending tab, all history tabs and every count/badge built from that list.
2. **Reports, Wallet, Rewards queries** (`src/lib/reports.ts`, `src/routes/wallet.tsx`, `src/routes/rewards.tsx`): same filter so totals/counts exclude unpaid online orders.
3. **Realtime / new-order sheet / sound** (`use-order-realtime.ts`, `NewOrderSheet.tsx`): keep ignoring unpaid rows; when a row updates to `paid`, refetch so it appears with ring + sheet as now.
4. **Order card** (`OrderCard.tsx`): remove the "Payment pending from customer" pill and note; remove the `isAwaitingPayment` branch.
5. **Cleanup**: remove `isAwaitingPayment` helper and the `awaitingPayment` / `awaitingPaymentNote` text (English + Marathi).

## Check
Log in as demo shop: order BS26092453356 (unpaid online) no longer shows in any tab or count; existing cash orders still show with Accept/Reject working.

No tables, columns or functions created.
