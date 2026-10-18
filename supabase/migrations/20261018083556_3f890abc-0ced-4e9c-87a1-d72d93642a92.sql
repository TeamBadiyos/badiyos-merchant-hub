ALTER TABLE public.merchants ALTER COLUMN commission_pct SET DEFAULT 10;

CREATE OR REPLACE FUNCTION public.merchant_start_fresh()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_jwt_phone text := right(regexp_replace(coalesce(auth.jwt()->>'phone',''), '\D', '', 'g'), 10);
  v_old merchants;
  v_phone text;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_old FROM merchants WHERE auth_user_id = v_uid ORDER BY created_at DESC LIMIT 1;
  IF v_old.id IS NULL AND length(v_jwt_phone) = 10 THEN
    SELECT * INTO v_old FROM merchants
     WHERE deleted_at IS NOT NULL AND right(regexp_replace(phone, '\D', '', 'g'), 10) = v_jwt_phone
     ORDER BY deleted_at DESC LIMIT 1;
  END IF;
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'merchant_not_found'; END IF;
  IF v_old.deleted_at IS NULL THEN RAISE EXCEPTION 'Only deleted shops can start a fresh application'; END IF;

  v_phone := right(regexp_replace(coalesce(v_old.phone,''), '\D', '', 'g'), 10);
  IF length(v_phone) <> 10 THEN v_phone := v_jwt_phone; END IF;
  IF length(coalesce(v_phone,'')) <> 10 THEN RAISE EXCEPTION 'Phone number missing'; END IF;

  -- release the phone from any deleted row still holding it
  UPDATE merchants
     SET phone = 'deleted-' || left(id::text, 8) || '-' || v_phone, updated_at = now()
   WHERE deleted_at IS NOT NULL AND phone = v_phone;
  UPDATE merchants SET auth_user_id = NULL, updated_at = now() WHERE id = v_old.id;

  INSERT INTO merchants (auth_user_id, phone, status, onboarding_step, commission_pct)
  VALUES (v_uid, v_phone, 'draft', 1, 10)
  RETURNING id INTO v_id;

  INSERT INTO audit_logs (actor_id, action, target_table, target_id, before_state, after_state)
  VALUES (v_uid, 'merchant_start_fresh', 'merchants', v_id,
          jsonb_build_object('previous_merchant_id', v_old.id), jsonb_build_object('status', 'draft'));
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.merchant_start_fresh() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.merchant_start_fresh() TO authenticated;