# Filter merchant wallet to earnings only

The wallet ledger now holds two kinds of rows: shop earnings and delivery earnings. This app should only ever show the shop earnings ones.

## Change

Only one place in the app reads the ledger: the Wallet screen (`src/routes/wallet.tsx`).

- Add a `wallet_type = 'earnings'` filter to that query.
- Include `earnings` in the query cache key so cached results can't mix.

Everything derived from that query — paid-out total and pending payout on the wallet screen, and the transaction list — then automatically excludes delivery rows.

## Not changing

- Reports and order-based revenue/commission figures read `merchant_orders`, not the ledger, so they stay as they are.
- No database changes, no new screen for delivery wallet rows.

## Verify

Sign in as the reviewer shop and confirm the Wallet screen loads with correct totals and no delivery rows, and that the build stays clean.
