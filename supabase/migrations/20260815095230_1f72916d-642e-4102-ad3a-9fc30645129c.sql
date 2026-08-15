-- 1. merchants: PIN + onboarding progress
ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS pin_hash text,
  ADD COLUMN IF NOT EXISTS onboarding_step smallint NOT NULL DEFAULT 1;

-- 2. Seed the CATALOG (store) segment + store categories
INSERT INTO public.segments (name, short_name, slug, vertical_type, display_template, rank, is_active)
VALUES ('badiyos Store', 'Store', 'store', 'CATALOG', 'STORE_FIRST', 2, true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.store_categories (segment_id, name, slug, rank, is_active)
SELECT s.id, v.name, v.slug, v.rank, true
FROM public.segments s
CROSS JOIN (VALUES
  ('Kirana & Grocery','kirana-grocery',1),
  ('Fruits & Vegetables','fruits-vegetables',2),
  ('Bakery & Sweets','bakery-sweets',3),
  ('Dairy & Milk','dairy-milk',4),
  ('Medical & Pharmacy','medical-pharmacy',5),
  ('Stationery & Books','stationery-books',6),
  ('Electronics & Mobile','electronics-mobile',7),
  ('Hardware & Electrical','hardware-electrical',8),
  ('Clothing & Footwear','clothing-footwear',9),
  ('Restaurant & Food','restaurant-food',10)
) AS v(name, slug, rank)
WHERE s.slug = 'store'
ON CONFLICT (segment_id, slug) DO NOTHING;

-- 3. Create / claim a draft merchant row for the signed-in user
CREATE OR REPLACE FUNCTION public.merchant_ensure_draft(_phone text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_digits text := regexp_replace(coalesce(_phone,''), '\D', '', 'g');
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT id INTO v_id FROM public.merchants WHERE auth_user_id = v_uid LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  IF v_digits !~ '^[6-9][0-9]{9}$' THEN RAISE EXCEPTION 'Invalid phone number'; END IF;

  -- Claim an unlinked row for this phone if ops pre-created it
  UPDATE public.merchants
     SET auth_user_id = v_uid, updated_at = now()
   WHERE regexp_replace(coalesce(phone,''), '\D', '', 'g') = v_digits
     AND auth_user_id IS NULL
  RETURNING id INTO v_id;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.merchants (auth_user_id, phone, status, onboarding_step)
  VALUES (v_uid, v_digits, 'draft', 1)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 4. PIN helpers for merchants
CREATE OR REPLACE FUNCTION public.merchant_set_login_pin(p_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_updated int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_pin !~ '^\d{4}$' THEN RAISE EXCEPTION 'PIN must be 4 digits'; END IF;

  UPDATE public.merchants
     SET pin_hash = crypt(p_pin, gen_salt('bf')), updated_at = now()
   WHERE auth_user_id = v_uid;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN RAISE EXCEPTION 'Merchant profile not found'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.merchant_has_login_pin(p_phone text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.merchants m
    WHERE regexp_replace(coalesce(m.phone,''), '\D', '', 'g')
          = regexp_replace(coalesce(p_phone,''), '\D', '', 'g')
      AND m.pin_hash IS NOT NULL
      AND m.auth_user_id IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.merchant_verify_pin_internal(p_phone text, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_phone text := regexp_replace(coalesce(p_phone,''), '\D', '', 'g');
  v_m public.merchants%ROWTYPE;
  v_lock public.pin_login_lockouts%ROWTYPE;
  v_now timestamptz := now();
  v_max int := 5;
  v_window interval := interval '15 minutes';
BEGIN
  IF p_pin IS NULL OR p_pin !~ '^\d{4}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'BAD_PIN');
  END IF;

  SELECT * INTO v_m FROM public.merchants
   WHERE regexp_replace(coalesce(phone,''), '\D', '', 'g') = v_phone
   LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'NOT_REGISTERED'); END IF;
  IF v_m.pin_hash IS NULL OR v_m.auth_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_PIN');
  END IF;

  SELECT * INTO v_lock FROM public.pin_login_lockouts WHERE phone = v_phone;
  IF FOUND AND v_lock.locked_until IS NOT NULL AND v_lock.locked_until > v_now THEN
    RETURN jsonb_build_object('ok', false, 'error', 'LOCKED',
      'retry_after_seconds', EXTRACT(EPOCH FROM (v_lock.locked_until - v_now))::int);
  END IF;

  IF crypt(p_pin, v_m.pin_hash) = v_m.pin_hash THEN
    DELETE FROM public.pin_login_lockouts WHERE phone = v_phone;
    RETURN jsonb_build_object('ok', true, 'merchant_id', v_m.id, 'auth_user_id', v_m.auth_user_id);
  END IF;

  INSERT INTO public.pin_login_lockouts(phone, failed_attempts, locked_until, updated_at)
  VALUES (v_phone, 1, NULL, v_now)
  ON CONFLICT (phone) DO UPDATE
     SET failed_attempts = public.pin_login_lockouts.failed_attempts + 1,
         updated_at = v_now,
         locked_until = CASE
           WHEN public.pin_login_lockouts.failed_attempts + 1 >= v_max THEN v_now + v_window
           ELSE NULL END
  RETURNING * INTO v_lock;

  IF v_lock.locked_until IS NOT NULL AND v_lock.locked_until > v_now THEN
    RETURN jsonb_build_object('ok', false, 'error', 'LOCKED',
      'retry_after_seconds', EXTRACT(EPOCH FROM (v_lock.locked_until - v_now))::int);
  END IF;
  RETURN jsonb_build_object('ok', false, 'error', 'BAD_PIN',
    'attempts_left', v_max - v_lock.failed_attempts);
END;
$$;

-- 5. Submit application for review
CREATE OR REPLACE FUNCTION public.merchant_submit_application()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_m public.merchants%ROWTYPE;
BEGIN
  SELECT * INTO v_m FROM public.merchants WHERE auth_user_id = auth.uid() LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Merchant profile not found'; END IF;
  IF v_m.status NOT IN ('draft','rejected') THEN RAISE EXCEPTION 'Application already submitted'; END IF;

  IF coalesce(v_m.store_name,'') = '' OR coalesce(v_m.owner_name,'') = ''
     OR v_m.store_category_id IS NULL OR coalesce(v_m.address,'') = ''
     OR coalesce(v_m.pincode,'') !~ '^\d{6}$'
     OR coalesce(v_m.bank_account_number,'') = ''
     OR coalesce(v_m.bank_ifsc,'') !~ '^[A-Z]{4}0[A-Z0-9]{6}$'
     OR coalesce(v_m.bank_account_holder_name,'') = '' THEN
    RAISE EXCEPTION 'Please complete all required onboarding details before submitting';
  END IF;

  UPDATE public.merchants
     SET status = 'pending_review', onboarding_step = 5, updated_at = now()
   WHERE id = v_m.id;
END;
$$;

-- 6. Execute grants
REVOKE ALL ON FUNCTION public.merchant_verify_pin_internal(text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merchant_verify_pin_internal(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.merchant_ensure_draft(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merchant_set_login_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merchant_submit_application() TO authenticated;
GRANT EXECUTE ON FUNCTION public.merchant_has_login_pin(text) TO anon, authenticated, service_role;

-- 7. Storage policies: each merchant owns folder <merchant_id>/ in merchant-documents
DROP POLICY IF EXISTS "Merchants read own documents" ON storage.objects;
CREATE POLICY "Merchants read own documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'merchant-documents'
         AND (storage.foldername(name))[1] = public.current_merchant_id()::text);

DROP POLICY IF EXISTS "Merchants upload own documents" ON storage.objects;
CREATE POLICY "Merchants upload own documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'merchant-documents'
         AND (storage.foldername(name))[1] = public.current_merchant_id()::text);

DROP POLICY IF EXISTS "Merchants update own documents" ON storage.objects;
CREATE POLICY "Merchants update own documents" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'merchant-documents'
         AND (storage.foldername(name))[1] = public.current_merchant_id()::text)
  WITH CHECK (bucket_id = 'merchant-documents'
         AND (storage.foldername(name))[1] = public.current_merchant_id()::text);

DROP POLICY IF EXISTS "Merchants delete own documents" ON storage.objects;
CREATE POLICY "Merchants delete own documents" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'merchant-documents'
         AND (storage.foldername(name))[1] = public.current_merchant_id()::text);

-- Staff oversight of uploaded documents
DROP POLICY IF EXISTS "Staff read merchant documents" ON storage.objects;
CREATE POLICY "Staff read merchant documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'merchant-documents'
         AND public.is_active_staff(auth.uid(), ARRAY['super_admin','ops_manager']));
