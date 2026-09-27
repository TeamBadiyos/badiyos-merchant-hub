# Packing lists for delivery trips

## What will change

- After a dispatch run creates trips, show a packing list for every active trip on Delivery Home and inside that trip.
- Use the requested heading format: **“12:00 run · Trip 3 · Ausa Road”**, with the courier order code in smaller text below.
- Show total parcels in the heading, then route-ordered drops labelled **C1, C2, C3…** with receiver name and all invoice/reference numbers.
- When no rider has been assigned, show **“Finding rider”** instead of the current generic rider message.
- Add a **Print packing list** action that prints only the clean packing-list content.
- Add one **Packed** checkbox per trip. It is saved only on that device and remains checked when moving between Home and trip detail.
- Add all new wording in English and Marathi. Existing delivery and store behavior stays unchanged.

## Data and backend

- Extend the live `business_get_trip_otps(_courier_order_id)` function through a migration; re-read its live definition immediately before applying the change.
- Keep its existing ownership and delivery-permission checks unchanged.
- Add only the fields needed by this UI:
  - dispatch-run label derived from the batch creation time in India time,
  - `trip_no`, numbered by batch creation order within the same dispatch run,
  - zone name,
  - total parcel count,
  - per-drop parcel count and route label data.
- Derive a dispatch run from batches for the same merchant sharing the dispatch creation timestamp. The current batching process creates all trips from one run with that same timestamp.
- Do not add tables or columns. The **Packed** state remains local to the device, keyed by courier trip ID.

## Screen behavior

### Delivery Home
- Enrich each active-trip row with its packing summary and rider availability.
- Show the run/trip/zone heading, courier code, parcel total, compact C1/C2 drop list, Packed checkbox, and a link to the trip.
- Preserve existing refresh intervals and avoid adding another realtime subscription.

### Trip screen
- Reuse the same packing-list component above the existing OTP/stops content.
- Sort drops by the route sequence returned by the backend.
- Fetch the existing rider endpoint every 10 seconds; show rider details when available and **Finding rider** otherwise.
- The print button opens the browser/native print sheet with only the packing list visible.

## Verification

- Confirm one dispatch run containing multiple zones numbers trips 1, 2, 3 consistently and shows the correct zone and parcel totals.
- Confirm C1/C2 order matches the courier stop sequence and invoices are grouped under the correct receiver.
- Confirm Packed stays in sync between Home and trip detail on the same device, without affecting another trip.
- Confirm printing excludes navigation, wallet, OTPs, and other screen controls.
- Confirm a riderless trip says Finding rider and changes to rider details after assignment.
- Check English and Marathi, mobile layout, type checks, current build status, and the end-to-end delivery trip flow.
