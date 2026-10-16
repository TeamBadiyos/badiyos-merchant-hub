CREATE TABLE public.category_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  service_type text NOT NULL,
  suggested_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  category_id uuid REFERENCES public.catalog_categories(id),
  reason text,
  submitted_by uuid,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cs_name_len CHECK (char_length(btrim(suggested_name)) BETWEEN 1 AND 40),
  CONSTRAINT cs_status CHECK (status IN ('pending','approved','rejected'))
);
CREATE UNIQUE INDEX category_suggestions_one_open ON public.category_suggestions(product_id) WHERE status='pending';
CREATE INDEX category_suggestions_merchant ON public.category_suggestions(merchant_id, created_at DESC);
GRANT SELECT ON public.category_suggestions TO authenticated;
GRANT ALL ON public.category_suggestions TO service_role;
ALTER TABLE public.category_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Shop members and CC read suggestions" ON public.category_suggestions
  FOR SELECT TO authenticated USING (public.merchant_access(merchant_id) IS NOT NULL);

CREATE OR REPLACE FUNCTION public.merchant_suggest_category(_product_id uuid, _name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.products; svc text; other_id uuid; n text := btrim(coalesce(_name,'')); sid uuid;
BEGIN
  SELECT * INTO p FROM public.products WHERE id=_product_id;
  IF p.id IS NULL OR public.merchant_access(p.merchant_id) IS NULL THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT coalesce(service_type,'store') INTO svc FROM public.merchants WHERE id=p.merchant_id;
  IF n = '' THEN
    DELETE FROM public.category_suggestions WHERE product_id=_product_id AND status='pending';
    RETURN jsonb_build_object('ok',true,'cleared',true);
  END IF;
  IF char_length(n) > 40 THEN RAISE EXCEPTION 'Max 40 characters'; END IF;
  SELECT id INTO other_id FROM public.catalog_categories WHERE service_type=svc AND is_other AND is_active ORDER BY sort_order LIMIT 1;
  IF other_id IS NOT NULL THEN UPDATE public.products SET category_id=other_id WHERE id=_product_id; END IF;
  UPDATE public.category_suggestions SET suggested_name=n, updated_at=now()
    WHERE product_id=_product_id AND status='pending' RETURNING id INTO sid;
  IF sid IS NULL THEN
    INSERT INTO public.category_suggestions(merchant_id,product_id,service_type,suggested_name,submitted_by)
    VALUES (p.merchant_id,_product_id,svc,n,auth.uid()) RETURNING id INTO sid;
  END IF;
  RETURN jsonb_build_object('ok',true,'id',sid);
END $$;
REVOKE ALL ON FUNCTION public.merchant_suggest_category(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.merchant_suggest_category(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_decide_category_suggestion(_id uuid, _approve boolean, _category_id uuid DEFAULT NULL, _new_name text DEFAULT NULL, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.category_suggestions; cat uuid := _category_id; moved int := 0; nm text;
BEGIN
  IF NOT public.is_active_staff(auth.uid(), ARRAY['super_admin','ops_manager']) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT * INTO s FROM public.category_suggestions WHERE id=_id FOR UPDATE;
  IF s.id IS NULL OR s.status<>'pending' THEN RAISE EXCEPTION 'Suggestion is not pending'; END IF;
  IF _approve THEN
    IF cat IS NULL THEN
      nm := btrim(coalesce(nullif(_new_name,''), s.suggested_name));
      SELECT id INTO cat FROM public.catalog_categories WHERE service_type=s.service_type AND lower(name)=lower(nm) LIMIT 1;
      IF cat IS NULL THEN
        INSERT INTO public.catalog_categories(service_type,name,sort_order,is_active,is_other)
        VALUES (s.service_type, nm, coalesce((SELECT max(sort_order) FROM public.catalog_categories WHERE service_type=s.service_type AND NOT is_other),0)+1, true, false)
        RETURNING id INTO cat;
      END IF;
    END IF;
    SELECT name INTO nm FROM public.catalog_categories WHERE id=cat;
    WITH t AS (
      UPDATE public.category_suggestions SET status='approved', category_id=cat, decided_by=auth.uid(), decided_at=now(), updated_at=now()
      WHERE status='pending' AND merchant_id=s.merchant_id AND lower(btrim(suggested_name))=lower(btrim(s.suggested_name))
      RETURNING product_id)
    UPDATE public.products p SET category_id=cat FROM t WHERE p.id=t.product_id;
    GET DIAGNOSTICS moved = ROW_COUNT;
    PERFORM public.party_notify('merchant', s.merchant_id, 'category_suggestion',
      'Category approved', format('"%s" is now a category. %s item(s) moved into it.', nm, moved),
      jsonb_build_object('category_id',cat));
  ELSE
    UPDATE public.category_suggestions SET status='rejected', reason=nullif(btrim(coalesce(_reason,'')),''), decided_by=auth.uid(), decided_at=now(), updated_at=now() WHERE id=s.id;
    PERFORM public.party_notify('merchant', s.merchant_id, 'category_suggestion',
      'Category suggestion not approved', format('"%s" was not added.%s', s.suggested_name, coalesce(' '||nullif(btrim(_reason),''),'')), '{}'::jsonb);
  END IF;
  RETURN jsonb_build_object('ok',true,'category_id',cat,'moved',moved);
END $$;
REVOKE ALL ON FUNCTION public.admin_decide_category_suggestion(uuid,boolean,uuid,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_decide_category_suggestion(uuid,boolean,uuid,text,text) TO authenticated;