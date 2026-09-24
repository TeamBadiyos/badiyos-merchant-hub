CREATE OR REPLACE FUNCTION public.merchants_guard_privileged()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_col text;
BEGIN
  IF auth.role() = 'service_role'
     OR current_user NOT IN ('authenticated','anon')
     OR public.is_active_staff(auth.uid(), ARRAY['super_admin','ops_manager']) THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN v_col := 'status';
  ELSIF NEW.commission_type IS DISTINCT FROM OLD.commission_type THEN v_col := 'commission_type';
  ELSIF NEW.commission_value IS DISTINCT FROM OLD.commission_value THEN v_col := 'commission_value';
  ELSIF NEW.fee_tier_id IS DISTINCT FROM OLD.fee_tier_id THEN v_col := 'fee_tier_id';
  ELSIF NEW.zone_id IS DISTINCT FROM OLD.zone_id THEN v_col := 'zone_id';
  ELSIF NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN v_col := 'approved_at';
  ELSIF NEW.approved_by IS DISTINCT FROM OLD.approved_by THEN v_col := 'approved_by';
  ELSIF NEW.onboarded_by IS DISTINCT FROM OLD.onboarded_by THEN v_col := 'onboarded_by';
  ELSIF NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id THEN v_col := 'auth_user_id';
  ELSIF NEW.phone IS DISTINCT FROM OLD.phone THEN v_col := 'phone';
  ELSIF NEW.pin_hash IS DISTINCT FROM OLD.pin_hash THEN v_col := 'pin_hash';
  ELSIF NEW.gst_status IS DISTINCT FROM OLD.gst_status AND OLD.status NOT IN ('draft','rejected') THEN v_col := 'gst_status';
  ELSIF (NEW.store_category_id IS DISTINCT FROM OLD.store_category_id OR NEW.segment_id IS DISTINCT FROM OLD.segment_id)
        AND OLD.status NOT IN ('draft','pending_review','rejected') THEN v_col := 'store_category_id';
  END IF;

  IF v_col IS NOT NULL THEN
    RAISE EXCEPTION 'Not allowed to change % on merchant profile', v_col USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER merchants_guard_privileged
BEFORE UPDATE ON public.merchants
FOR EACH ROW EXECUTE FUNCTION public.merchants_guard_privileged();