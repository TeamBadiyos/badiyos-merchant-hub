CREATE OR REPLACE FUNCTION public.merchant_instant_settlement_preview(_store_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE _d date := (now() AT TIME ZONE 'Asia/Kolkata')::date; _cut timestamptz; _n numeric; _c int; _adj numeric; _net numeric; _pct numeric; _gstp numeric; _fee numeric; _gst numeric;
BEGIN
  PERFORM public.merchant_require(_store_id, ARRAY['owner']);
  _cut := (_d::timestamp AT TIME ZONE 'Asia/Kolkata');
  SELECT count(*), coalesce(sum(o.merchant_net),0) INTO _c,_n FROM public.merchant_orders o
   WHERE o.merchant_id=_store_id AND o.status='delivered' AND o.delivered_at < _cut AND o.payment_status='paid'
     AND coalesce(o.refund_status,'none') NOT IN ('refund_pending','processing','done','failed')
     AND NOT EXISTS (SELECT 1 FROM public.merchant_settlement_items i WHERE i.order_id=o.id);
  SELECT coalesce(sum(a.amount),0) INTO _adj FROM public.merchant_settlement_adjustments a WHERE a.store_id=_store_id AND a.settlement_id IS NULL;
  _net := round(_n+_adj,2);
  SELECT coalesce(m.instant_settlement_fee_pct,0) INTO _pct FROM public.merchants m WHERE m.id=_store_id;
  _gstp := coalesce(public.tax_rate('instant_fee_gst'),0);
  _fee := CASE WHEN _net>0 THEN round(_net*_pct/100,2) ELSE 0 END;
  _gst := round(_fee*_gstp/100,2);
  RETURN jsonb_build_object('available',greatest(_net,0),'order_count',_c,'fee_pct',_pct,'fee',_fee,'fee_gst_pct',_gstp,'fee_gst',_gst,
    'you_get',greatest(round(_net-_fee-_gst,2),0),
    'already_today',EXISTS(SELECT 1 FROM public.merchant_settlements s WHERE s.store_id=_store_id AND s.type='instant' AND s.run_date=_d));
END $$;
REVOKE EXECUTE ON FUNCTION public.merchant_instant_settlement_preview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merchant_instant_settlement_preview(uuid) TO authenticated;

CREATE TABLE public.merchant_bank_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  account_holder_name text NOT NULL,
  account_number text NOT NULL,
  ifsc text NOT NULL,
  proof_path text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  rejection_reason text,
  submitted_by uuid,
  verified_phone text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.merchant_bank_change_requests TO authenticated;
GRANT ALL ON public.merchant_bank_change_requests TO service_role;
ALTER TABLE public.merchant_bank_change_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own bank requests" ON public.merchant_bank_change_requests FOR SELECT TO authenticated
  USING (public.merchant_access(merchant_id) = 'owner' OR public.is_active_staff(auth.uid(), ARRAY['super_admin','ops_manager','finance']));
CREATE UNIQUE INDEX merchant_bank_change_one_pending ON public.merchant_bank_change_requests(merchant_id) WHERE status='pending';

CREATE OR REPLACE FUNCTION public.merchant_bank_change_request_otp(_store_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public, extensions AS $$
DECLARE _phone text; _digits text;
BEGIN
  PERFORM public.merchant_require(_store_id, ARRAY['owner']);
  _phone := coalesce(nullif((SELECT phone FROM auth.users WHERE id=auth.uid()),''),(SELECT raw_user_meta_data->>'phone' FROM auth.users WHERE id=auth.uid()),'');
  _digits := right(regexp_replace(_phone,'\D','','g'),10);
  IF length(_digits)<>10 THEN RAISE EXCEPTION 'No phone number on this account'; END IF;
  PERFORM net.http_post(url := 'https://dkneclwmmjlqswovtqno.supabase.co/functions/v1/send-otp',
    headers := jsonb_build_object('content-type','application/json'), body := jsonb_build_object('phone',_digits));
  RETURN jsonb_build_object('sent_to',right(_digits,4));
END $$;

CREATE OR REPLACE FUNCTION public.merchant_bank_change_submit(_store_id uuid,_holder text,_account text,_ifsc text,_proof_path text,_otp text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _phone text; _digits text; _row otp_codes; _id uuid; _acc text := regexp_replace(coalesce(_account,''),'\s','','g'); _i text := upper(btrim(coalesce(_ifsc,'')));
BEGIN
  PERFORM public.merchant_require(_store_id, ARRAY['owner']);
  IF length(btrim(coalesce(_holder,'')))<2 THEN RAISE EXCEPTION 'Enter account holder name'; END IF;
  IF _acc !~ '^[0-9]{9,18}$' THEN RAISE EXCEPTION 'Enter a valid account number'; END IF;
  IF _i !~ '^[A-Z]{4}0[A-Z0-9]{6}$' THEN RAISE EXCEPTION 'Enter a valid IFSC'; END IF;
  IF coalesce(_proof_path,'') NOT LIKE _store_id::text||'/%' THEN RAISE EXCEPTION 'Upload cancelled cheque or passbook'; END IF;
  IF EXISTS(SELECT 1 FROM public.merchant_bank_change_requests WHERE merchant_id=_store_id AND status='pending') THEN RAISE EXCEPTION 'A bank change is already pending'; END IF;
  _phone := coalesce(nullif((SELECT phone FROM auth.users WHERE id=auth.uid()),''),(SELECT raw_user_meta_data->>'phone' FROM auth.users WHERE id=auth.uid()),'');
  _digits := right(regexp_replace(_phone,'\D','','g'),10);
  SELECT * INTO _row FROM otp_codes WHERE phone IN ('+91'||_digits,'91'||_digits,_digits) AND is_verified=false AND expires_at>now() ORDER BY created_at DESC LIMIT 1;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'OTP expired, request a new one'; END IF;
  IF _row.code <> btrim(coalesce(_otp,'')) THEN RAISE EXCEPTION 'Wrong OTP'; END IF;
  UPDATE otp_codes SET is_verified=true WHERE id=_row.id;
  INSERT INTO public.merchant_bank_change_requests(merchant_id,account_holder_name,account_number,ifsc,proof_path,submitted_by,verified_phone)
  VALUES(_store_id,btrim(_holder),_acc,_i,_proof_path,auth.uid(),'+91'||_digits) RETURNING id INTO _id;
  INSERT INTO public.audit_logs(actor_id,action,target_table,target_id,after_state)
  VALUES(auth.uid(),'merchant_bank_change_submitted','merchant_bank_change_requests',_id,jsonb_build_object('ifsc',_i,'last4',right(_acc,4)));
  PERFORM public.party_notify('merchant',_store_id,'bank_change_submitted','Bank change submitted',
    'Your new bank account ••••'||right(_acc,4)||' is under review. Payouts continue to your current account until approved.', jsonb_build_object('request_id',_id));
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_decide_bank_change(_request_id uuid,_approve boolean,_reason text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.merchant_bank_change_requests;
BEGIN
  IF NOT public.is_active_staff(auth.uid(), ARRAY['super_admin','ops_manager','finance']) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO r FROM public.merchant_bank_change_requests WHERE id=_request_id FOR UPDATE;
  IF r.id IS NULL OR r.status<>'pending' THEN RAISE EXCEPTION 'Request is not pending'; END IF;
  IF NOT _approve AND btrim(coalesce(_reason,''))='' THEN RAISE EXCEPTION 'Reason required'; END IF;
  UPDATE public.merchant_bank_change_requests SET status=CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
    rejection_reason=CASE WHEN _approve THEN NULL ELSE btrim(_reason) END, decided_by=auth.uid(), decided_at=now(), updated_at=now() WHERE id=r.id;
  IF _approve THEN
    UPDATE public.merchants SET bank_account_holder_name=r.account_holder_name, bank_account_number=r.account_number, bank_ifsc=r.ifsc WHERE id=r.merchant_id;
  END IF;
  INSERT INTO public.audit_logs(actor_id,action,target_table,target_id,after_state)
  VALUES(auth.uid(),CASE WHEN _approve THEN 'merchant_bank_change_approved' ELSE 'merchant_bank_change_rejected' END,'merchant_bank_change_requests',r.id,jsonb_build_object('reason',_reason));
  PERFORM public.party_notify('merchant',r.merchant_id,'bank_change_decided',
    CASE WHEN _approve THEN 'Bank change approved' ELSE 'Bank change rejected' END,
    CASE WHEN _approve THEN 'Payouts will now go to ••••'||right(r.account_number,4)||'.' ELSE 'Reason: '||btrim(_reason) END,
    jsonb_build_object('request_id',r.id));
END $$;

REVOKE EXECUTE ON FUNCTION public.merchant_bank_change_request_otp(uuid), public.merchant_bank_change_submit(uuid,text,text,text,text,text), public.admin_decide_bank_change(uuid,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merchant_bank_change_request_otp(uuid), public.merchant_bank_change_submit(uuid,text,text,text,text,text), public.admin_decide_bank_change(uuid,boolean,text) TO authenticated;