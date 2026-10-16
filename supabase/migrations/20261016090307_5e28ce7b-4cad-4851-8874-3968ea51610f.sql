ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS upi_id text,
  ADD COLUMN IF NOT EXISTS fssai_number text,
  ADD COLUMN IF NOT EXISTS fssai_expiry date,
  ADD COLUMN IF NOT EXISTS udyam_number text;

ALTER TABLE public.merchant_documents DROP CONSTRAINT merchant_documents_doc_type_check;
ALTER TABLE public.merchant_documents ADD CONSTRAINT merchant_documents_doc_type_check
  CHECK (doc_type = ANY (ARRAY['aadhar','aadhaar','pan','gst_certificate','shop_license','cancelled_cheque','fssai','udyam']));

CREATE OR REPLACE FUNCTION public.app_merchant_issue_signup_agreement()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m merchants; _type text; _id uuid;
BEGIN
  SELECT * INTO _m FROM merchants WHERE auth_user_id = auth.uid() AND deleted_at IS NULL LIMIT 1;
  IF _m.id IS NULL THEN RAISE EXCEPTION 'merchant_not_found'; END IF;
  _type := CASE WHEN _m.service_type = 'food' THEN 'restaurant' ELSE 'store' END;
  SELECT id INTO _id FROM agreements
   WHERE party_type = 'merchant' AND party_id = _m.id AND template_type = _type AND status <> 'expired'
   ORDER BY created_at DESC LIMIT 1;
  IF _id IS NOT NULL THEN RETURN _id; END IF;
  RETURN public.agreement_issue('merchant', _m.id, _type, false, NULL);
END $$;
REVOKE ALL ON FUNCTION public.app_merchant_issue_signup_agreement() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.app_merchant_issue_signup_agreement() TO authenticated;