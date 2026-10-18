CREATE OR REPLACE FUNCTION public.current_user_phone_digits()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _p text;
BEGIN
  SELECT coalesce(nullif(u.phone,''), nullif(u.raw_user_meta_data->>'merchant_phone',''), nullif(u.raw_user_meta_data->>'phone',''))
    INTO _p FROM auth.users u WHERE u.id = auth.uid();
  IF length(right(regexp_replace(coalesce(_p,''),'\D','','g'),10)) <> 10 THEN
    SELECT m.phone INTO _p FROM merchants m WHERE m.auth_user_id = auth.uid() AND m.phone NOT LIKE 'deleted-%' ORDER BY m.created_at DESC LIMIT 1;
  END IF;
  IF length(right(regexp_replace(coalesce(_p,''),'\D','','g'),10)) <> 10 THEN
    BEGIN EXECUTE 'SELECT phone FROM experts WHERE user_id = $1 LIMIT 1' INTO _p USING auth.uid();
    EXCEPTION WHEN others THEN NULL; END;
  END IF;
  RETURN right(regexp_replace(coalesce(_p,''),'\D','','g'),10);
END $$;
REVOKE ALL ON FUNCTION public.current_user_phone_digits() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.current_user_phone_digits() TO authenticated;

CREATE OR REPLACE FUNCTION public._send_action_otp(_digits text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions' AS $$
BEGIN
  IF _digits = '9999900000' THEN
    INSERT INTO otp_codes(phone, code, is_verified, expires_at) VALUES ('+91'||_digits, '1234', false, now()+interval '10 minutes');
  ELSE
    PERFORM net.http_post(url := 'https://dkneclwmmjlqswovtqno.supabase.co/functions/v1/send-otp',
      headers := jsonb_build_object('content-type','application/json'), body := jsonb_build_object('phone', _digits));
  END IF;
END $$;
REVOKE ALL ON FUNCTION public._send_action_otp(text) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.app_agreement_request_otp(_agreement_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $function$
DECLARE a agreements; _digits text;
BEGIN
  SELECT * INTO a FROM agreements WHERE id=_agreement_id;
  IF a.id IS NULL OR public.party_auth_user(a.party_type,a.party_id) IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not found'; END IF;
  IF a.status <> 'sent' THEN RAISE EXCEPTION 'Agreement is not awaiting acceptance'; END IF;
  _digits := public.current_user_phone_digits();
  IF length(_digits) <> 10 THEN RAISE EXCEPTION 'No phone number on this account'; END IF;
  PERFORM public._send_action_otp(_digits);
  UPDATE agreements SET otp_hash=NULL, otp_expires_at=now()+interval '10 minutes', otp_attempts=0 WHERE id=a.id;
  RETURN jsonb_build_object('sent_to', right(_digits,4), 'expires_in_seconds', 600);
END $function$;

CREATE OR REPLACE FUNCTION public.app_agreement_accept(_agreement_id uuid, _otp text, _device text DEFAULT NULL::text, _ip text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE a agreements; _ip2 text; _digits text; _row otp_codes;
BEGIN
  SELECT * INTO a FROM agreements WHERE id=_agreement_id FOR UPDATE;
  IF a.id IS NULL OR public.party_auth_user(a.party_type,a.party_id) IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not found'; END IF;
  IF a.status <> 'sent' THEN RAISE EXCEPTION 'Agreement is not awaiting acceptance'; END IF;
  IF a.otp_attempts >= 5 THEN RAISE EXCEPTION 'Too many attempts, request a new OTP'; END IF;
  _digits := public.current_user_phone_digits();
  SELECT * INTO _row FROM otp_codes
   WHERE phone IN ('+91'||_digits, '91'||_digits, _digits) AND is_verified = false AND expires_at > now()
   ORDER BY created_at DESC LIMIT 1;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'OTP expired, request a new one'; END IF;
  IF _row.code <> btrim(coalesce(_otp,'')) THEN
    UPDATE agreements SET otp_attempts=otp_attempts+1 WHERE id=a.id; RAISE EXCEPTION 'Wrong OTP';
  END IF;
  UPDATE otp_codes SET is_verified = true WHERE id = _row.id;
  BEGIN _ip2 := coalesce(_ip, (current_setting('request.headers', true)::jsonb)->>'x-forwarded-for'); EXCEPTION WHEN others THEN _ip2 := _ip; END;
  UPDATE agreements SET status='accepted', signed_method='otp', accepted_at=now(), otp_hash=NULL,
    accepted_phone='+91'||_digits, accepted_device=left(_device,300), accepted_ip=left(_ip2,100)
   WHERE id=a.id;
  RETURN jsonb_build_object('ok',true,'accepted_at',now());
END $function$;

CREATE OR REPLACE FUNCTION public.merchant_bank_change_request_otp(_store_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $function$
DECLARE _digits text;
BEGIN
  PERFORM public.merchant_require(_store_id, ARRAY['owner']);
  _digits := public.current_user_phone_digits();
  IF length(_digits)<>10 THEN RAISE EXCEPTION 'No phone number on this account'; END IF;
  PERFORM public._send_action_otp(_digits);
  RETURN jsonb_build_object('sent_to',right(_digits,4));
END $function$;

CREATE OR REPLACE FUNCTION public.merchant_bank_change_submit(_store_id uuid, _holder text, _account text, _ifsc text, _proof_path text, _otp text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _digits text; _row otp_codes; _id uuid; _acc text := regexp_replace(coalesce(_account,''),'\s','','g'); _i text := upper(btrim(coalesce(_ifsc,'')));
BEGIN
  PERFORM public.merchant_require(_store_id, ARRAY['owner']);
  IF length(btrim(coalesce(_holder,'')))<2 THEN RAISE EXCEPTION 'Enter account holder name'; END IF;
  IF _acc !~ '^[0-9]{9,18}$' THEN RAISE EXCEPTION 'Enter a valid account number'; END IF;
  IF _i !~ '^[A-Z]{4}0[A-Z0-9]{6}$' THEN RAISE EXCEPTION 'Enter a valid IFSC'; END IF;
  IF coalesce(_proof_path,'') NOT LIKE _store_id::text||'/%' THEN RAISE EXCEPTION 'Upload cancelled cheque or passbook'; END IF;
  IF EXISTS(SELECT 1 FROM public.merchant_bank_change_requests WHERE merchant_id=_store_id AND status='pending') THEN RAISE EXCEPTION 'A bank change is already pending'; END IF;
  _digits := public.current_user_phone_digits();
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
END $function$;