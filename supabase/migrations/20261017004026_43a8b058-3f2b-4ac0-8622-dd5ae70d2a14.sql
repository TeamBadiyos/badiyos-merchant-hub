CREATE TABLE public.merchant_location_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  old_latitude double precision, old_longitude double precision, old_address text,
  latitude double precision NOT NULL, longitude double precision NOT NULL, address text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  rejection_reason text, submitted_by uuid, decided_by uuid, decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.merchant_location_change_requests TO authenticated;
GRANT ALL ON public.merchant_location_change_requests TO service_role;
ALTER TABLE public.merchant_location_change_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own location requests" ON public.merchant_location_change_requests FOR SELECT TO authenticated
  USING (public.merchant_access(merchant_id) = 'owner' OR public.is_active_staff(auth.uid(), ARRAY['super_admin','ops_manager']));
CREATE UNIQUE INDEX merchant_location_change_one_pending ON public.merchant_location_change_requests(merchant_id) WHERE status='pending';

-- Shops may set their first pin themselves; moving an existing pin needs badiyos approval.
CREATE OR REPLACE FUNCTION public.merchants_guard_location() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF (NEW.latitude IS DISTINCT FROM OLD.latitude OR NEW.longitude IS DISTINCT FROM OLD.longitude)
     AND OLD.latitude IS NOT NULL AND OLD.longitude IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND current_setting('app.location_change_ok', true) IS DISTINCT FROM 'on'
     AND NOT public.is_active_staff(auth.uid(), ARRAY['super_admin','ops_manager']) THEN
    RAISE EXCEPTION 'Shop location changes need badiyos approval';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS merchants_guard_location ON public.merchants;
CREATE TRIGGER merchants_guard_location BEFORE UPDATE OF latitude, longitude ON public.merchants
  FOR EACH ROW EXECUTE FUNCTION public.merchants_guard_location();

CREATE OR REPLACE FUNCTION public.merchant_location_change_submit(_store_id uuid,_lat double precision,_lng double precision,_address text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.merchants; _id uuid;
BEGIN
  PERFORM public.merchant_require(_store_id, ARRAY['owner']);
  IF _lat IS NULL OR _lng IS NULL OR _lat NOT BETWEEN -90 AND 90 OR _lng NOT BETWEEN -180 AND 180 THEN RAISE EXCEPTION 'Pin your shop on the map'; END IF;
  IF length(btrim(coalesce(_address,'')))<5 THEN RAISE EXCEPTION 'Enter shop address'; END IF;
  IF EXISTS(SELECT 1 FROM public.merchant_location_change_requests WHERE merchant_id=_store_id AND status='pending') THEN RAISE EXCEPTION 'A location change is already pending'; END IF;
  SELECT * INTO m FROM public.merchants WHERE id=_store_id;
  INSERT INTO public.merchant_location_change_requests(merchant_id,old_latitude,old_longitude,old_address,latitude,longitude,address,submitted_by)
  VALUES(_store_id,m.latitude,m.longitude,m.address,_lat,_lng,btrim(_address),auth.uid()) RETURNING id INTO _id;
  INSERT INTO public.audit_logs(actor_id,action,target_table,target_id,after_state)
  VALUES(auth.uid(),'merchant_location_change_submitted','merchant_location_change_requests',_id,jsonb_build_object('lat',_lat,'lng',_lng));
  PERFORM public.party_notify('merchant',_store_id,'location_change_submitted','Location change submitted',
    'Your new shop location is under review. Customers see your current location until approved.', jsonb_build_object('request_id',_id));
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_decide_location_change(_request_id uuid,_approve boolean,_reason text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.merchant_location_change_requests;
BEGIN
  IF NOT public.is_active_staff(auth.uid(), ARRAY['super_admin','ops_manager']) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO r FROM public.merchant_location_change_requests WHERE id=_request_id FOR UPDATE;
  IF r.id IS NULL OR r.status<>'pending' THEN RAISE EXCEPTION 'Request is not pending'; END IF;
  IF NOT _approve AND btrim(coalesce(_reason,''))='' THEN RAISE EXCEPTION 'Reason required'; END IF;
  UPDATE public.merchant_location_change_requests SET status=CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
    rejection_reason=CASE WHEN _approve THEN NULL ELSE btrim(_reason) END, decided_by=auth.uid(), decided_at=now(), updated_at=now() WHERE id=r.id;
  IF _approve THEN
    UPDATE public.merchants SET latitude=r.latitude, longitude=r.longitude, address=r.address WHERE id=r.merchant_id;
  END IF;
  INSERT INTO public.audit_logs(actor_id,action,target_table,target_id,after_state)
  VALUES(auth.uid(),CASE WHEN _approve THEN 'merchant_location_change_approved' ELSE 'merchant_location_change_rejected' END,'merchant_location_change_requests',r.id,jsonb_build_object('reason',_reason));
  PERFORM public.party_notify('merchant',r.merchant_id,'location_change_decided',
    CASE WHEN _approve THEN 'Shop location approved' ELSE 'Shop location change rejected' END,
    CASE WHEN _approve THEN 'Customers now see your new shop location.' ELSE 'Reason: '||btrim(_reason) END,
    jsonb_build_object('request_id',r.id));
END $$;

REVOKE EXECUTE ON FUNCTION public.merchant_location_change_submit(uuid,double precision,double precision,text), public.admin_decide_location_change(uuid,boolean,text), public.merchants_guard_location() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merchant_location_change_submit(uuid,double precision,double precision,text), public.admin_decide_location_change(uuid,boolean,text) TO authenticated;