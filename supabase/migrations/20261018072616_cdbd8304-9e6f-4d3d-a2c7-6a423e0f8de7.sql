CREATE OR REPLACE FUNCTION public.merchant_start_fresh()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_old merchants;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_old FROM merchants WHERE auth_user_id = v_uid LIMIT 1;
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'merchant_not_found'; END IF;
  IF v_old.deleted_at IS NULL THEN RAISE EXCEPTION 'Only deleted shops can start a fresh application'; END IF;

  -- Archive the deleted row (kept for records) and free the login + phone.
  UPDATE merchants
     SET auth_user_id = NULL,
         phone = 'deleted-' || left(id::text, 8) || '-' || coalesce(phone, ''),
         updated_at = now()
   WHERE id = v_old.id;

  INSERT INTO merchants (auth_user_id, phone, status, onboarding_step)
  VALUES (v_uid, regexp_replace(coalesce(v_old.phone,''), '\D', '', 'g'), 'draft', 1)
  RETURNING id INTO v_id;

  INSERT INTO audit_logs (action, entity_type, entity_id, actor_id, details)
  VALUES ('merchant_start_fresh', 'merchant', v_id, v_uid, jsonb_build_object('previous_merchant_id', v_old.id));
  RETURN v_id;
EXCEPTION WHEN undefined_column THEN
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.merchant_start_fresh() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.merchant_start_fresh() TO authenticated;