# Rider function + native Razorpay top-up

Two pieces of work, both already scoped.

## 1. `business_get_trip_rider` (backend, previously approved)

One new read-only SQL function. Nothing else changes.

- `business_get_trip_rider(_courier_order_id uuid)` returns jsonb:
  - `available: false` when no rider is assigned yet.
  - Otherwise: `name`, `phone`, `photo_url`, plus `vehicle` (trip's vehicle type name).
  - `location`: `{lat, lng, location_updated_at, stale}` only while the trip is active (DRIVER_ASSIGNED, ARRIVED_PICKUP, PICKED_UP, IN_TRANSIT) and the rider has a location fix; otherwise `null`. Stale uses the `courier_location_stale_seconds` setting (120s default).
- Access: starts with `business_require_delivery()` (owner or staff with manage_delivery, delivery active). Trip must have `source = 'business'` and belong to the caller's business; anything else raises Forbidden (42501).
- `SECURITY DEFINER`, `STABLE`, `search_path = public`. `REVOKE` from public/anon; `GRANT EXECUTE` to authenticated and service_role.
- No tables, columns, policies or other functions change.
- Verified: anon denied; reviewer shop (delivery inactive) gets "Delivery is not active"; foreign trip id refused.

## 2. Native Razorpay checkout for wallet top-up

Same approach as the Customer App (`razorpayCheckout.ts`): native Capacitor Razorpay checkout on Android/iOS, web checkout.js only as a browser fallback.

### App code
- New `src/lib/razorpayCheckout.ts`: detects the native platform via Capacitor; on native it calls the Razorpay Capacitor plugin's `Checkout.open(...)` with the order id, amount, key and business name; in the browser it falls back to the current web checkout (checkout.js script). Resolves on `payment_id`, rejects on cancel/failure with a readable message.
- `src/routes/delivery/wallet.tsx`: top-up flow switches from web-only to this helper; after success it keeps the existing poll-until-credit-appears behaviour. No other change to the wallet screen.
- Package: add the Razorpay Capacitor plugin (`capacitor-razorpay`).

### Native Android setup steps (needed for the next build)
1. `bun add capacitor-razorpay` then `npx cap sync android` (done in code).
2. In `android/app/build.gradle`, add Razorpay's maven repo to repositories: `maven { url "https://github.com/razorpay/razorpay-pod" }` is iOS — for Android the plugin pulls `com.razorpay:checkout` from Maven Central automatically; no manual repo needed. Confirm minSdkVersion 21+ (already satisfied).
3. No manifest changes needed — the plugin declares the Razorpay activity itself.
4. Rebuild the Android app (new APK/AAB); Razorpay keys stay server-side secrets as today — only the public key id is sent to the app at top-up time.
5. Test on a real device with Razorpay test mode before release.

### Verification
- Typecheck/build pass.
- Browser top-up still works via the web fallback.
- Native path verified by code path check; on-device test happens with the next Android build.
