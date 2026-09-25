# Rider details for business trips

Adds one new read-only backend function. Nothing else changes.

## What it does
`business_get_trip_rider(_courier_order_id uuid)` returns jsonb:
- `available: false` when no rider is assigned yet.
- Otherwise: `name`, `phone`, `photo_url` (the same fields `courier_get_rider_info` gives a customer), plus `vehicle` (the trip's vehicle type name).
- `location`: `{lat, lng, location_updated_at, stale}` only while the trip is active (DRIVER_ASSIGNED, ARRIVED_PICKUP, PICKED_UP, IN_TRANSIT) and the rider has a location fix. Otherwise `null`. Stale uses the same `courier_location_stale_seconds` setting (120s default).

## Who can call it
- It starts with `business_require_delivery()`, so the caller must be the owner or staff with manage_delivery, and delivery must be active for the business.
- The trip must have `source = 'business'` and `business_merchant_id` equal to the caller's business. Anything else raises Forbidden (42501), the same as `business_get_trip_otps`.

## Technical details
- `SECURITY DEFINER`, `STABLE`, `search_path = public`.
- Reads `courier_orders`, `experts`, and `courier_vehicle_types` (name by `vehicle_type_id`).
- `REVOKE` from public and anon. `GRANT EXECUTE` to authenticated and service_role.
- No tables, columns, policies or other functions are changed. Nothing is written, so the customer location-read log is not touched.
- No app code changes in this step. The trip screen can use the function afterwards if you ask for it.

## Verification
- An anon call is denied.
- The reviewer shop (delivery inactive) gets "Delivery is not active".
- A made-up or other business's trip id is refused.
