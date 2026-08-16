-- 1. merchant_is_currently_open: no anonymous execution
REVOKE EXECUTE ON FUNCTION public.merchant_is_currently_open(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.merchant_is_currently_open(uuid) FROM PUBLIC;

-- 2. product-images: drop broad authenticated read, keep owner access, add staff read
DROP POLICY IF EXISTS "Authenticated can read approved store product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can read product images" ON storage.objects;

CREATE POLICY "Staff read product images"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'product-images'
  AND public.is_active_staff(auth.uid(), NULL::text[])
);

-- 3. resolve_caller_identity: return every identity the caller genuinely holds
CREATE OR REPLACE FUNCTION public.resolve_caller_identity(_auth_uid uuid)
RETURNS TABLE(user_type text, user_id uuid)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF _auth_uid IS NULL THEN RETURN; END IF;
  -- Only ever resolve the caller's own identity.
  IF _auth_uid IS DISTINCT FROM auth.uid() THEN RETURN; END IF;

  RETURN QUERY
    SELECT 'staff'::text, s.id FROM public.staff_users s
      WHERE s.auth_user_id = _auth_uid AND s.status = 'active'
  UNION ALL
    SELECT 'expert'::text, e.id FROM public.experts e WHERE e.auth_user_id = _auth_uid
  UNION ALL
    SELECT 'customer'::text, u.id FROM public.users u WHERE u.id = _auth_uid
  UNION ALL
    SELECT 'merchant'::text, m.id FROM public.merchants m WHERE m.auth_user_id = _auth_uid;
END
$function$;