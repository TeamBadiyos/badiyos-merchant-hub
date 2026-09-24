# Protect privileged merchant columns

## Step 1 findings (current state, nothing changed yet)

**Columns the merchant writes directly from the app (onboarding screen, `update` on merchants):**
- Step 1 (GST): is_gst_registered, gstin, gst_legal_name, gst_status, store_name, owner_name, address, city, pincode, onboarding_step
- Step 2 (business): store_name, owner_name, store_category_id, segment_id, address, city, state, country, pincode, latitude, longitude, onboarding_step
- Step 3 (documents): shop_photo_url (other documents go to merchant_documents, not merchants)
- Step 4 (bank): pan, bank_account_number, bank_ifsc, bank_account_holder_name, onboarding_step
- No other screen (Profile/Settings) updates the merchants row directly. Store timings live in merchant_store_hours.

**Status transitions by the merchant:**
- Only one: `draft` or `rejected` -> `pending_review`, done inside the `merchant_submit_application()` database function (checks all required fields first). The app never writes `status` directly.

**Writes that go through trusted functions (not direct client updates):**
- merchant_ensure_draft (creates draft row / links pre-created row: auth_user_id)
- merchant_submit_application (status, onboarding_step)
- merchant_set_accepting_orders (is_accepting_orders — Open/Closed toggle)
- merchant_set_login_pin (pin_hash)
- Server side (service role): OTP/PIN login only; no merchant row updates.

Note: current table has no rating or KYC-verified flag columns; gst_status is the closest "verification" field (set from GST lookup during onboarding).

## Step 2 — Guard trigger

New BEFORE UPDATE trigger `merchants_guard_privileged` on public.merchants. It lets everything through when the caller is:
- service_role, or
- active staff with super_admin / ops_manager, or
- a trusted database function (runs as owner, e.g. submit application, set accepting orders, set PIN).

For a merchant writing directly from the app, it raises an error if any of these change:
- status (any change — the only legit transition already runs via merchant_submit_application)
- commission_type, commission_value, fee_tier_id
- zone_id
- approved_at, approved_by, onboarded_by
- auth_user_id, phone, pin_hash
- gst_status once status is no longer draft/rejected (verification locked after submit)
- store_category_id and segment_id once status is not draft/pending_review/rejected

Everything else (store name, owner name, photo, address, location, GST/bank details, is_accepting_orders, store_hours, fulfillment settings) stays editable.

Question to confirm during build: should bank details / GSTIN also lock after approval? Default in this plan: stay editable (matches the request).

## Step 3 — Tests and report
1. Fresh onboarding end to end with a throwaway test number (draft -> 4 steps -> submit -> pending_review), then clean it up.
2. Approved reviewer shop (9999900000): edit store name, shop photo, timings, toggle Open/Closed — all succeed.
3. Same user, direct `supabase.from('merchants').update({status:'approved'})` and `{commission_value: 0}` — capture and show the exact error text.
4. MyAdmin approve/reject: simulate as an active ops_manager staff session (or verify the staff bypass path in SQL) — status changes succeed. Real MyAdmin app lives in another project; I will confirm it uses staff login, not merchant login.

## Technical details
- Bypass check: `auth.role() = 'service_role' OR current_user NOT IN ('authenticated','anon') OR is_active_staff(auth.uid(), ARRAY['super_admin','ops_manager'])`.
- Compare with `IS DISTINCT FROM` per column; raise `42501` with a clear message naming the column.
- Single migration; no app code changes expected.
