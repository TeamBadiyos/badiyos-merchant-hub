# Parcel labels for business delivery trips

## What will change

- Add **Print labels** to each eligible trip and to each dispatch-run group on Delivery Home.
- A trip prints only that trip’s labels; a run prints labels for every currently dispatched, non-cancelled trip in that run.
- Keep the existing packing-list print action unchanged.
- Offer two remembered device-local formats:
  - **Thermal 100×50 mm** — one parcel label per page.
  - **A4 sheet** — eight labels per page with cut lines.
- Support English and Marathi for all new controls, format names, empty states, and errors.

## Backend-owned label data

- Extend the live `business_get_trip_otps(_courier_order_id)` function through a migration, preserving its existing ownership and delivery-permission checks.
- Return the backend fields needed by the label renderer:
  - dispatch run ID and India-local dispatch date,
  - business name,
  - existing trip number,
  - for each packet row: packet code, packet number, packet total, and saved drop label.
- Continue returning receiver name, address, and invoice/reference numbers with the matching drop.
- Do not add tables or columns. The existing `business_trip_packets` rows remain authoritative.
- Do not derive trip numbers, drop labels, packet numbering, totals, or packet codes in the app. The app only flattens the returned packet rows into printable labels and preserves backend ordering.

## Label design and output

Each packet row produces exactly one label containing:

- Large `T<trip_no> · <drop_label>` and `<packet_no>/<packet_total>` at the top.
- Receiver name, shortened address, and all invoice/reference numbers for that drop.
- Small dispatch date and business name.
- A scannable QR encoding the backend packet code exactly.
- The same packet code in readable text below the QR.

The large line will not include run time. The date remains in the small metadata line.

- Build labels as a clean isolated print document, separate from the app shell, matching the working packing-list print approach.
- Generate a downloadable PDF from the same label data and selected layout as the fallback when printing is unavailable or blocked.
- Bundle QR generation and Unicode-capable PDF font assets so names and addresses remain readable without external network requests.
- Validate the generated label count against the number of backend packet rows before opening print or download.

## Home and trip behavior

- Group active Home trips by the backend dispatch-run ID and show one **Print labels** action for each run.
- Include only rows whose backend batch state is `dispatched`; cancelled or completed trips are not included in a run print.
- Keep each trip’s existing packing list, rider state, navigation, and cancellation behavior unchanged.
- On trip detail, show the format selector and **Print labels** only when the trip is dispatched and has packet rows; otherwise show a simple no-labels message.

## Verification

- Confirm one backend packet row produces one label, with no locally generated trip/drop/packet values.
- Confirm a trip action prints only its packets and a run action combines all dispatched trips in that backend run.
- Confirm cancelled trips are excluded.
- Confirm Thermal output is one 100×50 mm label per page and A4 output is eight labels per page with cut lines.
- Confirm QR contents exactly equal the printed packet code.
- Confirm the selected format survives navigation and app restart on the same device.
- Check English, Marathi, web print, Android WebView print behavior, PDF download fallback, current build status, and mobile layout.
