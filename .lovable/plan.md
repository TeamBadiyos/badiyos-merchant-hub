# Use backend-owned packing-list labels

## Confirmed current behavior

- `trip_no` already comes from `business_batches.trip_no` through `business_get_trip_otps` and is displayed directly.
- The trip label already comes from `business_batches.trip_label` through `business_get_trip_otps` and is displayed directly.
- The dispatch-run time comes from `business_dispatch_runs.created_at`, formatted by `business_get_trip_otps` in India time.
- Drop labels are not fully backend-owned today:
  - `business_get_trip_otps` currently calculates `C1`, `C2…` from stop sequence.
  - The packing-list screen ignores that value and independently renders `C${index + 1}`.
- The authoritative labels already exist in `business_batches.drop_labels`, saved when each trip is created.

## Changes

1. Update the live `business_get_trip_otps(_courier_order_id)` definition through a migration, preserving all existing access checks and response fields.
2. For every drop stop, return `drop_label` from the matching receiver entry in `business_batches.drop_labels`; do not generate a label from stop sequence.
3. Add `drop_label` to the app’s trip-stop data shape.
4. Render `stop.drop_label` directly in the shared packing list on Home, trip detail, and print view; remove the local `C${index + 1}` calculation.
5. Keep route ordering based on the backend-returned stop order/sequence, but do not derive any displayed trip or drop number locally.

## Verification

- Re-read the migrated live function and confirm `trip_no`, `trip_label`, dispatch-run time, and `drop_label` all originate from backend records.
- Confirm no packing-list code contains local C1/C2 or trip-number generation.
- Check type safety and the current build.
- A visual multi-trip verification requires a completed dispatch run with courier trips; the current database only has older planning batches without saved trip numbers or labels.
