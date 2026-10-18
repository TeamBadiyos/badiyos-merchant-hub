CREATE OR REPLACE FUNCTION public.product_upsert_core(_store_id uuid, _product_id uuid, _payload jsonb, _who text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _svc text; _cat uuid; _pid uuid; _p record; _v jsonb; _a jsonb; _i int; _mn int; _mx int;
BEGIN
  SELECT coalesce(service_type,'store') INTO _svc FROM public.merchants WHERE id=_store_id;
  IF _svc IS NULL THEN RAISE EXCEPTION 'store_not_found'; END IF;
  IF coalesce(trim(_payload->>'name'),'') = '' THEN RAISE EXCEPTION 'name_required'; END IF;
  IF (_payload->>'price') IS NULL OR (_payload->>'price')::numeric < 0 THEN RAISE EXCEPTION 'invalid_price'; END IF;
  IF nullif(_payload->>'original_price','') IS NOT NULL AND (_payload->>'original_price')::numeric < (_payload->>'price')::numeric THEN RAISE EXCEPTION 'invalid_original_price'; END IF;
  _cat := nullif(_payload->>'category_id','')::uuid;
  IF _cat IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.catalog_categories WHERE id=_cat AND service_type=_svc AND is_active) THEN
    RAISE EXCEPTION 'invalid_category'; END IF;
  FOR _a IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'addons','[]')) LOOP
    _mn := coalesce((_a->>'min_select')::int,0); _mx := coalesce((_a->>'max_select')::int,1);
    IF _mn < 0 OR _mx < 1 OR _mn > _mx THEN RAISE EXCEPTION 'invalid_addon_limits'; END IF;
  END LOOP;

  IF _product_id IS NOT NULL THEN
    SELECT * INTO _p FROM public.products WHERE id=_product_id AND merchant_id=_store_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'product_not_found'; END IF;
    IF _who IN ('owner','staff') AND _p.approval_status='approved' THEN
      UPDATE public.products SET pending_changes=_payload, pending_submitted_at=now() WHERE id=_product_id;
      RETURN jsonb_build_object('ok',true,'product_id',_product_id,'status','pending_review');
    END IF;
  END IF;

  IF _product_id IS NULL THEN
    INSERT INTO public.products (merchant_id, name, price, is_active, approval_status)
    VALUES (_store_id, _payload->>'name', (_payload->>'price')::numeric, true,
            CASE WHEN _who='cc' THEN 'approved' ELSE 'pending' END)
    RETURNING id INTO _pid;
  ELSE _pid := _product_id; END IF;

  UPDATE public.products SET
    name=_payload->>'name', description=_payload->>'description', image_path=_payload->>'image_path',
    category_id=_cat, price=(_payload->>'price')::numeric, original_price=nullif(_payload->>'original_price','')::numeric,
    approval_status=CASE WHEN _who='cc' THEN 'approved' ELSE 'pending' END,
    approval_reviewed_at=CASE WHEN _who='cc' THEN now() ELSE approval_reviewed_at END,
    approval_reviewed_by=CASE WHEN _who='cc' THEN auth.uid() ELSE approval_reviewed_by END,
    pending_changes=NULL, pending_submitted_at=NULL
  WHERE id=_pid;

  IF _payload ? 'variants' THEN
    DELETE FROM public.product_variants WHERE product_id=_pid;
    _i := 0;
    FOR _v IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'variants','[]')) LOOP
      INSERT INTO public.product_variants(product_id,name,price,sort_order,is_default)
      VALUES (_pid, _v->>'name', (_v->>'price')::numeric, _i, coalesce((_v->>'is_default')::boolean,false));
      _i := _i+1;
    END LOOP;
  END IF;
  IF _payload ? 'addons' THEN
    DELETE FROM public.product_addons WHERE product_id=_pid;
    _i := 0;
    FOR _a IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'addons','[]')) LOOP
      INSERT INTO public.product_addons(product_id,name,price,sort_order,is_active,group_name,min_select,max_select)
      VALUES (_pid, _a->>'name', (_a->>'price')::numeric, _i, coalesce((_a->>'is_active')::boolean,true),
              nullif(trim(_a->>'group_name'),''), coalesce((_a->>'min_select')::int,0), coalesce((_a->>'max_select')::int,1));
      _i := _i+1;
    END LOOP;
  END IF;
  RETURN jsonb_build_object('ok',true,'product_id',_pid,'status',CASE WHEN _who='cc' THEN 'approved' ELSE 'pending' END);
END $function$;

GRANT EXECUTE ON FUNCTION public.merchant_access(uuid) TO authenticated;