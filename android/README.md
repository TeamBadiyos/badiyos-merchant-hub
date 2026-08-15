# Android native sources (hand-authored only)

This folder intentionally contains ONLY the hand-authored native files for the
full-screen "new order" ringing alert — same approach as the sibling Partner App.
The full Gradle project is generated locally with `npx cap add android`; these
files are then copied in / merged.

Files here:
- `app/src/main/java/com/badiyos/merchant/MainActivity.java`
- `app/src/main/java/com/badiyos/merchant/MerchantMessagingService.java`
- `app/src/main/java/com/badiyos/merchant/OrderRingActivity.java`
- `app/src/main/res/layout/activity_order_ring.xml`
- `app/src/main/res/raw/README.txt` (drop `new_order_alert.mp3` here)
- `MANIFEST_MERGE.md` — the exact manifest block to merge manually

See `MANIFEST_MERGE.md` for the manual steps.
