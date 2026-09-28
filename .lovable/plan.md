# Delivery proofs in Delivery mode

No backend changes. capacitor.config.ts untouched. English + Marathi, purple theme.

## What the backend actually returns (checked)
- `business_order_proofs(_order_id)` / `business_stop_proofs(_stop_id)` → `{ completed_via, completed_at, status, proofs: [ { storage_path, seal_codes, captured_at, location_unverified, expert_id, lat, lng, ... } ] }`. No signed URLs and no rider name in these.
- `business_proof_report(_merchant_id, _from, _to, _receiver_id, _limit ≤500, _offset)` → `{ total, rows: [ { stop_id, courier_order_id, completed_at, completed_via, receiver_id, receiver_name, rider_name, seal_codes[], photo_paths[], location_unverified } ] }`.
- Signed URLs (thumbnails, full view, ZIP) all come from the `download-urls` endpoint, sent paths in chunks of 300.
- Settings come from `business_profiles.drop_proof_mode` and `proof_retention_days` (read-only).

## 1. Order detail and Trip detail
- Delivered drop shows a small badge: "OTP se" / "Bill photo se" (English: "By OTP" / "By bill photo").
- Photo proofs show thumbnails; tap opens a full-screen viewer with pinch zoom and swipe between photos, showing time, rider name (from the trip rider), sticker numbers, and a "Location first time" tag when `location_unverified`.
- Orders screen: delivered order card gets a "Proof" button opening the same sheet.

## 2. New "Delivery Proofs" screen (`/delivery/proofs`, in the Delivery menu)
- Date range (default today), receiver search, filter All / Photo / OTP (filtered on the loaded rows).
- List: thumbnail or OTP badge, receiver, sticker numbers, time, rider. Loads 100 at a time with "Load more".
- Tap → the same full-screen proof viewer.

## 3. Download ZIP
- "Download" gathers all filtered photo rows (pages through the report), requests signed URLs in batches of 300, fetches files with limited parallelism, re-requests a URL if it failed or is older than ~4 min.
- Builds ZIP with JSZip: photos named `<date>_<time>_<receiver>_<sticker>_<n>.jpg` + `index.csv` (date, time, receiver, sticker numbers, rider, completed_via, file name). OTP-only rows go in the CSV with empty file name.
- Saves `badiyos-proofs-<from>-<to>.zip`; progress shown ("Downloading 12 / 40"). On phone uses the same download path as the label PDFs.

## 4. Delivery settings (read-only)
- "Delivery proof: OTP / Bill Photo / OTP ya Bill Photo"
- "Photos kept for N days"

## Technical details
- New `src/lib/delivery/proofs.ts`: typed RPC wrappers, `signProofUrls(paths)` calling the endpoint with the current session access token, a small in-memory URL cache with expiry.
- New `src/components/delivery/ProofViewer.tsx` (full-screen, CSS transform pinch zoom) and `ProofBadge`.
- New route `src/routes/delivery.proofs.tsx` with its own head(); menu entry in DeliveryShell.
- Add `jszip` dependency.
- i18n keys in en + mr in `src/lib/delivery/i18n.ts`.
- If the endpoint rejects the preview origin (CORS), fall back to a server function proxy that forwards the same bearer token.
