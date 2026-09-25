# Delivery mode for business accounts

Store screens stay exactly as today. Delivery is a separate area with its own tabs and menu.

## 1. Mode switch
- Read `store_enabled`, `delivery_enabled`, `delivery_status` from `merchant_my_context`.
- Store only: today's app, no change. Delivery only: go straight to delivery home. Both: a "Store | Delivery" pill in the header. The last choice is remembered on the device.
- Delivery inactive or suspended: a simple screen that says "Your delivery account is not active. Contact badiyos." with a Call button (8007444464).

## 2. "Your name"
- The first time delivery mode opens on a device, ask "Your name" once. It is saved on the device, can be changed in delivery settings, and is sent as `_actor_label` on every business action.

## 3. Delivery layout
- Bottom tabs: Home, Orders, Receivers, Wallet.
- Menu: Pickup points, Staff (the existing screen, plus a "Manage delivery" toggle for `manage_delivery`), Language, Your name, Profile, Logout.

## 4. Screens
- **Home:** wallet card (red when below the limit or negative, with a Top up button); today's counts (Pending, On the way, Delivered, Returned); dispatch info (next slot, "7 of 10 orders" progress, "Dispatch now" with a confirm step only if manual dispatch is on, otherwise "Delivery plan not set, contact badiyos"); active trips; a big "+ New order" button.
- **New order:** receiver search (name or phone, recent first, add inline), reference no., description, packets (1-50), pickup point (default preselected), "Save & add another". Bulk: paste or upload a CSV (receiver_phone, reference_no, description, packets), per-row preview with errors, sample CSV download.
- **Orders:** tabs Pending, Batched, On the way, Delivered, Returned, Failed, Cancelled; search by reference or receiver; Cancel with a reason (Pending); "Send again" (Failed/Returned).
- **Trip detail:** big pickup OTP at the top ("Give this OTP to the rider at pickup"), stops in order with status, rider name and Call button, each drop OTP with a Share button, "Share all OTPs" (name, short address, OTP per line), return stops clearly marked.
- **Receivers / Pickup points:** list, search, add/edit (name, contact, 10-digit phone, address + map pin with the same picker as onboarding, notes), deactivate. The backend's out-of-area error is shown as-is.
- **Wallet:** balance, low-balance limit, history, top-ups. Top up: enter an amount (min/max from the backend), open Razorpay checkout, then keep checking until the credit appears.

## 5. Notifications
- Low-balance and delivery-failed alerts are shown. Tapping one opens Wallet or the trip. Store order alerts work as today.

## 6. Language
- All new text in English and Marathi. Big, simple buttons.

## Needed from you
- Razorpay Key ID and Key Secret (same as the Customer App). I'll ask for them as secrets during the build.

## Technical details
- Folders: `src/routes/delivery.*.tsx`, `src/components/delivery/*`, `src/lib/delivery/*` (mode hook, actor name, RPC wrappers, CSV parsing that reuses `parseCsv`).
- RPCs used as they exist: `business_create_order`, `business_create_orders_bulk`, `business_cancel_order`, `business_requeue_order`, `business_dispatch_now`, `business_get_trip_otps`, `business_get_wallet`, `business_get_profile`, `business_upsert_receiver`, `business_set_receiver_active`, `business_upsert_pickup_point`, `business_create_topup_intent`, `business_check_location`.
- Lists (receivers, pickup points, orders, batches, dispatch plan) are read directly from `business_receivers`, `business_pickup_points`, `business_orders`, `business_batches`, `bulk_dispatch_plans` under the existing access rules. First build step: confirm those rules let the merchant read them; if not, report it as a needed backend change and do not change the database.
- Top-up: a `createServerFn` with auth creates the Razorpay order (notes `purpose: 'merchant_wallet_topup'`, `merchant_id`), then the client calls `business_create_topup_intent`, opens checkout (web script; Capacitor uses the same approach as the Customer App if one exists, otherwise web checkout inside the app), then polls `business_get_wallet`. The existing webhook credits the wallet.
- Push: `push.ts` tap handler sends `data.type` of wallet/trip to `/delivery/wallet` or `/delivery/trip/$id`. The native ringing screen is only used for store orders.
- No new tables, columns or functions. Anything missing goes in the final report.
