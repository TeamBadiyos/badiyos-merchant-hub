CREATE TABLE public.merchant_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id),
  entry_type text NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  info_amount numeric(12,2),
  order_id uuid REFERENCES public.merchant_orders(id),
  settlement_id uuid REFERENCES public.merchant_settlements(id),
  adjustment_id uuid REFERENCES public.merchant_settlement_adjustments(id),
  note text,
  entry_at timestamptz NOT NULL DEFAULT now(),
  dedupe_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX merchant_ledger_entries_m_idx ON public.merchant_ledger_entries(merchant_id, entry_at DESC);
GRANT SELECT ON public.merchant_ledger_entries TO authenticated;
GRANT ALL ON public.merchant_ledger_entries TO service_role;
ALTER TABLE public.merchant_ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ledger read" ON public.merchant_ledger_entries FOR SELECT TO authenticated
USING (public.merchant_access(merchant_id) IS NOT NULL OR public.is_active_staff(auth.uid(), ARRAY['super_admin','ops_manager','finance']));

CREATE OR REPLACE FUNCTION public.ledger_validate_type() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.entry_type NOT IN ('sale','commission','commission_gst','tcs','tds','refund','instant_fee','instant_fee_gst','adjustment','payout','round_off_carried') THEN
    RAISE EXCEPTION 'bad entry_type %', NEW.entry_type; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_validate BEFORE INSERT ON public.merchant_ledger_entries FOR EACH ROW EXECUTE FUNCTION public.ledger_validate_type();
CREATE OR REPLACE FUNCTION public.ledger_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN RAISE EXCEPTION 'ledger entries are immutable'; END $$;
CREATE TRIGGER ledger_no_change BEFORE UPDATE OR DELETE ON public.merchant_ledger_entries FOR EACH ROW EXECUTE FUNCTION public.ledger_immutable();

CREATE OR REPLACE FUNCTION public.ledger_post(_m uuid,_type text,_amt numeric,_key text,_at timestamptz,_order uuid DEFAULT NULL,_sett uuid DEFAULT NULL,_adj uuid DEFAULT NULL,_note text DEFAULT NULL,_info numeric DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF coalesce(_amt,0)=0 AND _info IS NULL THEN RETURN; END IF;
  INSERT INTO public.merchant_ledger_entries(merchant_id,entry_type,amount,info_amount,order_id,settlement_id,adjustment_id,note,entry_at,dedupe_key)
  VALUES (_m,_type,round(coalesce(_amt,0),2),_info,_order,_sett,_adj,_note,coalesce(_at,now()),_key)
  ON CONFLICT (dedupe_key) DO NOTHING;
END $$;
REVOKE EXECUTE ON FUNCTION public.ledger_post FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ledger_post_order(_o public.merchant_orders) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE g numeric; d numeric; k text := _o.id::text; at timestamptz := coalesce(_o.delivered_at,_o.updated_at);
BEGIN
  IF _o.status='delivered' AND _o.payment_status='paid' THEN
    g := coalesce(_o.item_total,_o.items_total,0);
    PERFORM public.ledger_post(_o.merchant_id,'sale',g,'sale:'||k,at,_o.id,NULL,NULL,_o.order_number);
    PERFORM public.ledger_post(_o.merchant_id,'commission',-coalesce(_o.commission_amount,0),'comm:'||k,at,_o.id,NULL,NULL,_o.order_number);
    PERFORM public.ledger_post(_o.merchant_id,'commission_gst',-coalesce(_o.commission_gst,0),'cgst:'||k,at,_o.id,NULL,NULL,_o.order_number);
    PERFORM public.ledger_post(_o.merchant_id,'tcs',-coalesce(_o.tcs_amount,0),'tcs:'||k,at,_o.id,NULL,NULL,_o.order_number);
    PERFORM public.ledger_post(_o.merchant_id,'tds',-coalesce(_o.tds_amount,0),'tds:'||k,at,_o.id,NULL,NULL,_o.order_number);
    IF _o.merchant_net IS NOT NULL THEN
      d := _o.merchant_net - (g-coalesce(_o.commission_amount,0)-coalesce(_o.commission_gst,0)-coalesce(_o.tcs_amount,0)-coalesce(_o.tds_amount,0));
      IF abs(d) >= 0.01 THEN PERFORM public.ledger_post(_o.merchant_id,'adjustment',d,'net:'||k,at,_o.id,NULL,NULL,'Order net reconciliation'); END IF;
    END IF;
    IF coalesce(_o.refund_status,'none') IN ('refund_pending','processing','done')
       AND NOT EXISTS (SELECT 1 FROM public.merchant_settlement_items i WHERE i.order_id=_o.id) THEN
      PERFORM public.ledger_post(_o.merchant_id,'refund',-coalesce(_o.merchant_net,g),'refund:'||k,coalesce(_o.refunded_at,now()),_o.id,NULL,NULL,_o.order_number);
    END IF;
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.ledger_post_order FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ledger_trg_order() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN PERFORM public.ledger_post_order(NEW); RETURN NEW; END $$;
CREATE TRIGGER merchant_orders_ledger AFTER INSERT OR UPDATE OF status, payment_status, refund_status ON public.merchant_orders
FOR EACH ROW EXECUTE FUNCTION public.ledger_trg_order();

CREATE OR REPLACE FUNCTION public.ledger_post_adjustment(_a public.merchant_settlement_adjustments) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  -- carry_forward / round_off rows only move an existing balance between settlements
  IF _a.reason ILIKE 'carry_forward%' OR _a.reason ILIKE 'round_off%' THEN RETURN; END IF;
  PERFORM public.ledger_post(_a.store_id, CASE WHEN _a.reason ILIKE '%refund%' THEN 'refund' ELSE 'adjustment' END,
    _a.amount,'adj:'||_a.id,_a.created_at,_a.order_id,NULL,_a.id,_a.reason);
END $$;
REVOKE EXECUTE ON FUNCTION public.ledger_post_adjustment FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.ledger_trg_adj() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN PERFORM public.ledger_post_adjustment(NEW); RETURN NEW; END $$;
CREATE TRIGGER settlement_adj_ledger AFTER INSERT ON public.merchant_settlement_adjustments FOR EACH ROW EXECUTE FUNCTION public.ledger_trg_adj();

CREATE OR REPLACE FUNCTION public.ledger_post_settlement(_s public.merchant_settlements) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE k text := _s.id::text; r numeric;
BEGIN
  PERFORM public.ledger_post(_s.store_id,'instant_fee',-coalesce(_s.instant_fee,0),'ifee:'||k,_s.created_at,NULL,_s.id,NULL,_s.invoice_no);
  PERFORM public.ledger_post(_s.store_id,'instant_fee_gst',-coalesce(_s.instant_fee_gst,0),'ifeegst:'||k,_s.created_at,NULL,_s.id,NULL,_s.invoice_no);
  PERFORM public.ledger_post(_s.store_id,'payout',-coalesce(_s.net_amount,0),'payout:'||k,_s.created_at,NULL,_s.id,NULL,_s.invoice_no);
  SELECT a.amount INTO r FROM public.merchant_settlement_adjustments a WHERE a.reason='round_off carried forward from '||coalesce(_s.invoice_no,_s.id::text) AND a.store_id=_s.store_id LIMIT 1;
  IF coalesce(r,0) > 0 THEN
    PERFORM public.ledger_post(_s.store_id,'round_off_carried',0,'round:'||k,_s.created_at,NULL,_s.id,NULL,'Round-off carried forward',r);
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.ledger_post_settlement FROM PUBLIC, anon, authenticated;

-- settlement_build: normal payouts rounded down to ₹100, remainder carried forward; instant exact
CREATE OR REPLACE FUNCTION public.settlement_build(_store_id uuid, _cutoff timestamp with time zone, _type text, _run_date date)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _fee_gst numeric := 0; _sid uuid; _t record; _adj numeric; _fee numeric := 0; _pct numeric; _inv text[]; _net numeric; _pay numeric; _rem numeric := 0; _s public.merchant_settlements;
BEGIN
  SELECT count(*) c, min(o.delivered_at)::date f, max(o.delivered_at)::date t,
         coalesce(sum(coalesce(o.item_total,o.items_total)),0) g, coalesce(sum(o.commission_amount),0) cm,
         coalesce(sum(o.commission_gst),0) cg, coalesce(sum(o.tcs_amount),0) tc, coalesce(sum(o.tds_amount),0) td,
         coalesce(sum(o.merchant_net),0) n
    INTO _t
    FROM public.merchant_orders o
   WHERE o.merchant_id=_store_id AND o.status='delivered' AND o.delivered_at < _cutoff
     AND o.payment_status='paid' AND coalesce(o.refund_status,'none') NOT IN ('refund_pending','processing','done','failed')
     AND NOT EXISTS (SELECT 1 FROM public.merchant_settlement_items i WHERE i.order_id=o.id);
  SELECT coalesce(sum(a.amount),0) INTO _adj FROM public.merchant_settlement_adjustments a WHERE a.store_id=_store_id AND a.settlement_id IS NULL;
  IF _t.c = 0 AND _adj = 0 THEN RETURN NULL; END IF;
  _net := round(_t.n + _adj, 2);
  IF _type='instant' AND _net > 0 THEN
    SELECT coalesce(m.instant_settlement_fee_pct,0) INTO _pct FROM public.merchants m WHERE m.id=_store_id;
    _fee := round(_net * _pct / 100, 2);
    _fee_gst := round(_fee * public.tax_rate('instant_fee_gst') / 100, 2);
  END IF;
  IF _net < 0 THEN _pay := 0;
  ELSIF _type='instant' THEN _pay := round(_net-_fee-_fee_gst,2);
  ELSE _pay := floor(_net/100)*100; _rem := round(_net-_pay,2);
  END IF;
  _inv := public.settlement_next_invoice(coalesce(_run_date, (now() AT TIME ZONE 'Asia/Kolkata')::date));
  INSERT INTO public.merchant_settlements(store_id,type,period_from,period_to,gross_amount,commission_total,commission_gst_total,
     tcs_total,tds_total,instant_fee,instant_fee_gst,net_amount,status,adjustment_total,invoice_no,invoice_fy,run_date)
  VALUES (_store_id,_type,_t.f,_t.t,_t.g,_t.cm,_t.cg,_t.tc,_t.td,_fee,_fee_gst,_pay,
     CASE WHEN _pay <= 0 THEN 'carry_forward' WHEN _type='instant' THEN 'approved' ELSE 'draft' END,
     _adj,_inv[1],_inv[2],_run_date)
  RETURNING * INTO _s;
  _sid := _s.id;
  INSERT INTO public.merchant_settlement_items(settlement_id,order_id)
  SELECT _sid, o.id FROM public.merchant_orders o
   WHERE o.merchant_id=_store_id AND o.status='delivered' AND o.delivered_at < _cutoff
     AND o.payment_status='paid' AND coalesce(o.refund_status,'none') NOT IN ('refund_pending','processing','done','failed')
     AND NOT EXISTS (SELECT 1 FROM public.merchant_settlement_items i WHERE i.order_id=o.id);
  UPDATE public.merchant_settlement_adjustments a SET settlement_id=_sid WHERE a.store_id=_store_id AND a.settlement_id IS NULL;
  IF _net < 0 THEN
    INSERT INTO public.merchant_settlement_adjustments(store_id, order_id, amount, reason, settlement_id)
    VALUES (_store_id, NULL, _net, 'carry_forward from ' || _inv[1], NULL);
  ELSIF _rem > 0 THEN
    INSERT INTO public.merchant_settlement_adjustments(store_id, order_id, amount, reason, settlement_id)
    VALUES (_store_id, NULL, _rem, 'round_off carried forward from ' || _inv[1], NULL);
  END IF;
  PERFORM public.ledger_post_settlement(_s);
  RETURN _sid;
END $function$;

-- read access helper
CREATE OR REPLACE FUNCTION public.ledger_can_read(_store_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.merchant_access(_store_id) IS NOT NULL OR public.is_active_staff(auth.uid(), ARRAY['super_admin','ops_manager','finance']);
$$;

CREATE OR REPLACE FUNCTION public.merchant_ledger(_store_id uuid,_from date DEFAULT NULL,_to date DEFAULT NULL,_types text[] DEFAULT NULL,_limit int DEFAULT 50,_offset int DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE _rows jsonb; _total int; _bal numeric;
BEGIN
  IF NOT public.ledger_can_read(_store_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT coalesce(sum(amount),0) INTO _bal FROM public.merchant_ledger_entries WHERE merchant_id=_store_id;
  SELECT count(*) INTO _total FROM public.merchant_ledger_entries e WHERE e.merchant_id=_store_id
    AND (_from IS NULL OR (e.entry_at AT TIME ZONE 'Asia/Kolkata')::date >= _from)
    AND (_to IS NULL OR (e.entry_at AT TIME ZONE 'Asia/Kolkata')::date <= _to)
    AND (_types IS NULL OR e.entry_type = ANY(_types));
  SELECT coalesce(jsonb_agg(r ORDER BY r.entry_at DESC, r.created_at DESC),'[]') INTO _rows FROM (
    SELECT e.id,e.entry_type,e.amount,e.info_amount,e.order_id,o.order_number,e.settlement_id,s.invoice_no,s.status settlement_status,e.adjustment_id,e.note,e.entry_at,e.created_at,
      (SELECT sum(x.amount) FROM public.merchant_ledger_entries x WHERE x.merchant_id=e.merchant_id AND (x.entry_at,x.created_at,x.id) <= (e.entry_at,e.created_at,e.id)) running_balance
    FROM public.merchant_ledger_entries e
    LEFT JOIN public.merchant_orders o ON o.id=e.order_id
    LEFT JOIN public.merchant_settlements s ON s.id=e.settlement_id
    WHERE e.merchant_id=_store_id
      AND (_from IS NULL OR (e.entry_at AT TIME ZONE 'Asia/Kolkata')::date >= _from)
      AND (_to IS NULL OR (e.entry_at AT TIME ZONE 'Asia/Kolkata')::date <= _to)
      AND (_types IS NULL OR e.entry_type = ANY(_types))
    ORDER BY e.entry_at DESC, e.created_at DESC LIMIT least(coalesce(_limit,50),200) OFFSET greatest(coalesce(_offset,0),0)) r;
  RETURN jsonb_build_object('rows',_rows,'total',_total,'balance',_bal);
END $$;

CREATE OR REPLACE FUNCTION public.merchant_settlement_summary(_store_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE _today date := (now() AT TIME ZONE 'Asia/Kolkata')::date; _wk date; _sales numeric; _ded numeric; _bal numeric; _next date; _dow int;
BEGIN
  IF NOT public.ledger_can_read(_store_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  _wk := date_trunc('week', _today)::date;
  SELECT coalesce(sum(amount) FILTER (WHERE entry_type='sale'),0),
         coalesce(-sum(amount) FILTER (WHERE entry_type IN ('commission','commission_gst','tcs','tds','refund','instant_fee','instant_fee_gst')),0)
    INTO _sales,_ded FROM public.merchant_ledger_entries
   WHERE merchant_id=_store_id AND (entry_at AT TIME ZONE 'Asia/Kolkata')::date >= _wk;
  SELECT coalesce(sum(amount),0) INTO _bal FROM public.merchant_ledger_entries WHERE merchant_id=_store_id;
  _dow := extract(dow FROM _today)::int; -- 0 Sun .. 3 Wed .. 6 Sat
  _next := _today + CASE WHEN _dow < 3 THEN 3-_dow WHEN _dow < 6 THEN 6-_dow ELSE 4 END;
  IF _dow IN (3,6) THEN _next := _today + CASE WHEN _dow=3 THEN 3 ELSE 4 END; END IF;
  RETURN jsonb_build_object('week_start',_wk,'week_sales',_sales,'week_deductions',_ded,
    'you_will_receive',greatest(_bal,0),'balance',_bal,'next_payout_date',_next,
    'next_payout_estimate',CASE WHEN _bal>=100 THEN floor(_bal/100)*100 ELSE 0 END,
    'carry_forward_estimate',CASE WHEN _bal>=100 THEN round(_bal-floor(_bal/100)*100,2) ELSE greatest(_bal,0) END);
END $$;

CREATE OR REPLACE FUNCTION public.merchant_settlements_list(_store_id uuid,_limit int DEFAULT 20,_offset int DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.ledger_can_read(_store_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN jsonb_build_object('total',(SELECT count(*) FROM public.merchant_settlements WHERE store_id=_store_id),
   'rows',(SELECT coalesce(jsonb_agg(to_jsonb(s) || jsonb_build_object('order_count',(SELECT count(*) FROM public.merchant_settlement_items i WHERE i.settlement_id=s.id),
      'round_off_carried',(SELECT info_amount FROM public.merchant_ledger_entries l WHERE l.settlement_id=s.id AND l.entry_type='round_off_carried' LIMIT 1)) ORDER BY s.created_at DESC),'[]')
     FROM (SELECT * FROM public.merchant_settlements WHERE store_id=_store_id ORDER BY created_at DESC LIMIT least(coalesce(_limit,20),100) OFFSET greatest(coalesce(_offset,0),0)) s));
END $$;

CREATE OR REPLACE FUNCTION public.merchant_settlement_statement(_settlement_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE _s public.merchant_settlements;
BEGIN
  SELECT * INTO _s FROM public.merchant_settlements WHERE id=_settlement_id;
  IF _s.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.ledger_can_read(_s.store_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN jsonb_build_object('settlement',to_jsonb(_s),
    'merchant',(SELECT jsonb_build_object('name',store_name,'gstin',gstin,'pan',pan,'address',address) FROM public.merchants WHERE id=_s.store_id),
    'orders',(SELECT coalesce(jsonb_agg(jsonb_build_object('order_id',o.id,'order_number',o.order_number,'delivered_at',o.delivered_at,
       'items_total',coalesce(o.item_total,o.items_total),'commission',o.commission_amount,'commission_gst',o.commission_gst,'tcs',o.tcs_amount,'tds',o.tds_amount,'net',o.merchant_net) ORDER BY o.delivered_at),'[]')
       FROM public.merchant_settlement_items i JOIN public.merchant_orders o ON o.id=i.order_id WHERE i.settlement_id=_s.id),
    'adjustments',(SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]') FROM public.merchant_settlement_adjustments a WHERE a.settlement_id=_s.id),
    'round_off_carried',(SELECT info_amount FROM public.merchant_ledger_entries l WHERE l.settlement_id=_s.id AND l.entry_type='round_off_carried' LIMIT 1));
END $$;

CREATE OR REPLACE FUNCTION public.merchant_commission_invoices(_store_id uuid,_limit int DEFAULT 50,_offset int DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.ledger_can_read(_store_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('settlement_id',id,'invoice_no',invoice_no,'invoice_fy',invoice_fy,'date',coalesce(run_date,created_at::date),
     'commission',commission_total,'commission_gst',commission_gst_total,'instant_fee',instant_fee,'instant_fee_gst',instant_fee_gst) ORDER BY created_at DESC),'[]')
    FROM (SELECT * FROM public.merchant_settlements WHERE store_id=_store_id AND invoice_no IS NOT NULL
          AND (commission_total>0 OR instant_fee>0) ORDER BY created_at DESC LIMIT least(coalesce(_limit,50),200) OFFSET greatest(coalesce(_offset,0),0)) s);
END $$;

GRANT EXECUTE ON FUNCTION public.merchant_ledger, public.merchant_settlement_summary, public.merchant_settlements_list, public.merchant_settlement_statement, public.merchant_commission_invoices TO authenticated;

-- backfill
DO $$ DECLARE o public.merchant_orders; a public.merchant_settlement_adjustments; s public.merchant_settlements; BEGIN
  FOR o IN SELECT * FROM public.merchant_orders WHERE status='delivered' AND payment_status='paid' LOOP PERFORM public.ledger_post_order(o); END LOOP;
  FOR a IN SELECT * FROM public.merchant_settlement_adjustments LOOP PERFORM public.ledger_post_adjustment(a); END LOOP;
  FOR s IN SELECT * FROM public.merchant_settlements LOOP PERFORM public.ledger_post_settlement(s); END LOOP;
END $$;