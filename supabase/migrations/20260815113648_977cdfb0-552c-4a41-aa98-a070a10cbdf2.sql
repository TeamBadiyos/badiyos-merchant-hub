-- 1. Merchant RPCs: signed-in users only (revoke the implicit PUBLIC/anon EXECUTE)
REVOKE EXECUTE ON FUNCTION public.merchant_decide_order(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.merchant_advance_order(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.merchant_ensure_draft(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.merchant_my_context() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.merchant_set_login_pin(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.merchant_submit_application() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.merchant_create_offline_sale(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.merchant_claim_staff_invite() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.merchant_decide_order(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merchant_advance_order(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merchant_ensure_draft(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merchant_my_context() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merchant_set_login_pin(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merchant_submit_application() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merchant_create_offline_sale(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merchant_claim_staff_invite() TO authenticated, service_role;

-- 2. Internal-only helpers: reachable by the app's server code (service_role) only
REVOKE EXECUTE ON FUNCTION public.merchant_verify_pin_internal(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.merchant_has_login_pin(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merchant_verify_pin_internal(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.merchant_has_login_pin(text) TO service_role;

-- 3. Trigger-only helper: not callable through the API at all
REVOKE EXECUTE ON FUNCTION public.merchant_orders_ledger_on_complete() FROM PUBLIC, anon, authenticated;

-- 4. Bookings: creation limited to signed-in users
DROP POLICY IF EXISTS "Users can insert own bookings" ON public.bookings;
CREATE POLICY "Users can insert own bookings"
  ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own bookings" ON public.bookings;
CREATE POLICY "Users can view own bookings"
  ON public.bookings FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 5. Bookings: force privileged columns to safe values on insert.
--    price/status/rating/review_text are already forced by this trigger; extend it so a
--    customer cannot seed dispatch, payment, refund or OTP state either.
CREATE OR REPLACE FUNCTION public.bookings_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _price numeric;
  _addr_lat numeric;
  _addr_lng numeric;
  _bypass text;
BEGIN
  BEGIN _bypass := current_setting('app.booking_bypass', true); EXCEPTION WHEN OTHERS THEN _bypass := NULL; END;

  SELECT price INTO _price FROM public.service_catalogue_config
   WHERE duration_minutes = NEW.service_duration_minutes AND is_active = true
   ORDER BY created_at DESC LIMIT 1;
  IF _price IS NULL THEN
    RAISE EXCEPTION 'Invalid service duration';
  END IF;
  NEW.price := _price;
  NEW.status := 'confirmed';
  NEW.rating := NULL;
  NEW.review_text := NULL;

  -- Client-supplied privileged state is ignored unless a SECURITY DEFINER function
  -- explicitly opted in via app.booking_bypass.
  IF _bypass IS DISTINCT FROM 'on' THEN
    NEW.assigned_expert_id := NULL;
    NEW.razorpay_order_id := NULL;
    NEW.razorpay_payment_id := NULL;
    NEW.refund_id := NULL;
    NEW.refund_status := NULL;
    NEW.refund_amount := NULL;
    NEW.cancellation_fee := NULL;
    NEW.cancellation_reason := NULL;
    NEW.cancelled_by := NULL;
    NEW.cancelled_at := NULL;
    NEW.started_at := NULL;
    NEW.service_end_at := NULL;
    NEW.start_otp := NULL;
    NEW.end_otp := NULL;
    NEW.broadcast_started_at := NULL;
    NEW.current_search_radius_km := NULL;
    NEW.deleted_at := NULL;
    NEW.deleted_by := NULL;
    NEW.delete_reason := NULL;
  END IF;

  -- Fallback: populate booking coordinates from the address if missing
  IF (NEW.booking_lat IS NULL OR NEW.booking_lng IS NULL) AND NEW.address_id IS NOT NULL THEN
    SELECT latitude, longitude INTO _addr_lat, _addr_lng
      FROM public.addresses WHERE id = NEW.address_id;
    IF NEW.booking_lat IS NULL THEN NEW.booking_lat := _addr_lat; END IF;
    IF NEW.booking_lng IS NULL THEN NEW.booking_lng := _addr_lng; END IF;
  END IF;

  -- Hard guard: refuse bookings with no coordinates (undispatchable)
  IF NEW.booking_lat IS NULL OR NEW.booking_lng IS NULL THEN
    RAISE EXCEPTION 'Booking requires geographic coordinates: booking_lat/booking_lng were not provided and could not be resolved from address_id %', NEW.address_id
      USING ERRCODE = 'check_violation', HINT = 'Ensure the selected address has latitude/longitude, or pass booking_lat/booking_lng explicitly.';
  END IF;

  RETURN NEW;
END;
$$;