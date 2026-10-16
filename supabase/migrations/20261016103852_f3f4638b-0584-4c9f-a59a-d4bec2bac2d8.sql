
-- Part 5: visit source, busy mode, merchant referrals, insights, support attachments
ALTER TABLE public.merchant_store_visits ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'browse';
ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS busy_until timestamptz,
  ADD COLUMN IF NOT EXISTS merchant_referral_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by_merchant_id uuid REFERENCES public.merchants(id);

DROP FUNCTION IF EXISTS public.record_merchant_store_visit(uuid, text);
CREATE FUNCTION public.record_merchant_store_visit(_merchant_id uuid, _session_id text DEFAULT NULL, _source text DEFAULT 'browse')
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _src text := CASE WHEN _source IN ('browse','search','link','banner') THEN _source ELSE 'browse' END;
BEGIN
  IF _uid IS NULL AND coalesce(_session_id,'') = '' THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM merchants WHERE id=_merchant_id) THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM merchant_store_visits v WHERE v.merchant_id=_merchant_id
     AND v.visited_at > now() - interval '15 minutes'
     AND ((_uid IS NOT NULL AND v.user_id=_uid) OR (_uid IS NULL AND v.session_id=_session_id))) THEN
    RETURN false;
  END IF;
  INSERT INTO merchant_store_visits(merchant_id,user_id,session_id,source) VALUES (_merchant_id,_uid,left(_session_id,100),_src);
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION public.record_merchant_store_visit(uuid,text,text) TO anon, authenticated;

-- Insights for the signed-in shop
CREATE OR REPLACE FUNCTION public.merchant_insights(_days integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _mid uuid := current_merchant_id(); _today date := (now() AT TIME ZONE 'Asia/Kolkata')::date; _from timestamptz; r jsonb;
BEGIN
  IF _mid IS NULL THEN RAISE EXCEPTION 'not_merchant'; END IF;
  _days := greatest(1, least(coalesce(_days,1), 90));
  _from := ((_today - (_days-1))::timestamp AT TIME ZONE 'Asia/Kolkata');
  WITH v AS (SELECT * FROM merchant_store_visits WHERE merchant_id=_mid AND visited_at >= _from),
  o AS (SELECT * FROM merchant_orders WHERE merchant_id=_mid AND created_at >= _from AND status NOT IN ('cancelled','rejected')),
  cust AS (SELECT user_id, count(*) n FROM merchant_orders WHERE merchant_id=_mid AND user_id IN (SELECT user_id FROM o) AND status NOT IN ('cancelled','rejected') GROUP BY 1)
  SELECT jsonb_build_object(
    'visits', (SELECT count(*) FROM v),
    'unique', (SELECT count(DISTINCT coalesce(user_id::text, session_id)) FROM v),
    'orders', (SELECT count(*) FROM o),
    'sources', (SELECT jsonb_build_object(
        'browse', count(*) FILTER (WHERE source='browse'), 'search', count(*) FILTER (WHERE source='search'),
        'link', count(*) FILTER (WHERE source='link'), 'banner', count(*) FILTER (WHERE source='banner')) FROM v),
    'link_orders', (SELECT count(*) FROM o WHERE o.user_id IN (SELECT user_id FROM v WHERE source='link' AND user_id IS NOT NULL)),
    'top_items', (SELECT coalesce(jsonb_agg(t ORDER BY (t->>'qty')::numeric DESC),'[]') FROM (
        SELECT jsonb_build_object('name', i.product_name_snapshot, 'qty', sum(i.quantity)) t
        FROM merchant_order_items i JOIN o ON o.id=i.order_id GROUP BY i.product_name_snapshot ORDER BY sum(i.quantity) DESC LIMIT 5) x),
    'customers', (SELECT count(*) FROM cust),
    'repeat_customers', (SELECT count(*) FROM cust WHERE n > 1),
    'rating_avg', (SELECT round(avg(rating)::numeric,1) FROM store_ratings WHERE store_id=_mid),
    'rating_count', (SELECT count(*) FROM store_ratings WHERE store_id=_mid),
    'reviews', (SELECT coalesce(jsonb_agg(x ORDER BY x->>'at' DESC),'[]') FROM (
        SELECT jsonb_build_object('rating',rating,'comment',comment,'at',created_at) x FROM store_ratings
        WHERE store_id=_mid ORDER BY created_at DESC LIMIT 5) y),
    'hours', (SELECT coalesce(jsonb_agg(jsonb_build_object('h',h,'n',(SELECT count(*) FROM o WHERE extract(hour FROM o.created_at AT TIME ZONE 'Asia/Kolkata')=h)) ORDER BY h),'[]')
        FROM generate_series(0,23) h)
  ) INTO r;
  RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.merchant_insights(integer) TO authenticated;

-- Busy mode
CREATE OR REPLACE FUNCTION public.merchant_set_busy(_minutes integer)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _mid uuid := current_merchant_id(); _until timestamptz;
BEGIN
  IF _mid IS NULL THEN RAISE EXCEPTION 'not_merchant'; END IF;
  IF coalesce(_minutes,0) <= 0 THEN
    UPDATE merchants SET busy_until=NULL, is_accepting_orders=true WHERE id=_mid AND busy_until IS NOT NULL;
    RETURN NULL;
  END IF;
  IF _minutes NOT IN (15,30,60) THEN RAISE EXCEPTION 'invalid_minutes'; END IF;
  _until := now() + make_interval(mins => _minutes);
  UPDATE merchants SET busy_until=_until, is_accepting_orders=false WHERE id=_mid;
  RETURN _until;
END $$;
GRANT EXECUTE ON FUNCTION public.merchant_set_busy(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.merchant_busy_release() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH u AS (UPDATE merchants SET busy_until=NULL, is_accepting_orders=true WHERE busy_until IS NOT NULL AND busy_until <= now() RETURNING 1)
  SELECT count(*)::int FROM u;
$$;
REVOKE EXECUTE ON FUNCTION public.merchant_busy_release() FROM public, anon, authenticated;

-- Release expired busy mode on the existing minute tick (no new job)
CREATE OR REPLACE FUNCTION public.cron_minute_tick()
 RETURNS void LANGUAGE plpgsql SET search_path TO 'public' AS $function$
begin
  begin perform public.send_completion_reminders();     exception when others then raise warning 'reminders: %', sqlerrm; end;
  begin perform public.system_check_no_accept_alerts(); exception when others then raise warning 'no-accept: %', sqlerrm; end;
  begin perform public.booking_dispatch_release_due();  exception when others then raise warning 'release: %', sqlerrm; end;
  begin perform public.booking_journey_sweeper();       exception when others then raise warning 'journey: %', sqlerrm; end;
  begin perform public.store_sweeper();                 exception when others then raise warning 'store sweeper: %', sqlerrm; end;
  begin perform public.merchant_busy_release();         exception when others then raise warning 'busy release: %', sqlerrm; end;
end $function$;

-- Merchant referrals
CREATE TABLE IF NOT EXISTS public.merchant_referral_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  reward_amount numeric NOT NULL DEFAULT 0,
  rules text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.merchant_referral_config(id) VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE public.merchant_referral_config ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.merchant_referral_config TO authenticated;
GRANT ALL ON public.merchant_referral_config TO service_role;
CREATE POLICY "Anyone signed in reads merchant referral config" ON public.merchant_referral_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage merchant referral config" ON public.merchant_referral_config FOR ALL TO authenticated
  USING (is_active_staff(auth.uid(), ARRAY['super_admin','ops_manager'])) WITH CHECK (is_active_staff(auth.uid(), ARRAY['super_admin','ops_manager']));

CREATE TABLE IF NOT EXISTS public.merchant_referral_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  phone text NOT NULL,
  name text,
  reward_earned_at timestamptz,
  reward_amount numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, phone)
);
ALTER TABLE public.merchant_referral_invites ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.merchant_referral_invites TO authenticated;
GRANT ALL ON public.merchant_referral_invites TO service_role;
CREATE POLICY "Owner reads own invites" ON public.merchant_referral_invites FOR SELECT TO authenticated USING (merchant_id = current_merchant_id());
CREATE POLICY "Admins manage invites" ON public.merchant_referral_invites FOR ALL TO authenticated
  USING (is_active_staff(auth.uid(), ARRAY['super_admin','ops_manager'])) WITH CHECK (is_active_staff(auth.uid(), ARRAY['super_admin','ops_manager']));

CREATE OR REPLACE FUNCTION public.merchant_referral_code() RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _mid uuid := current_merchant_id(); _c text;
BEGIN
  IF _mid IS NULL THEN RAISE EXCEPTION 'not_merchant'; END IF;
  SELECT merchant_referral_code INTO _c FROM merchants WHERE id=_mid;
  WHILE _c IS NULL LOOP
    _c := 'BM' || upper(substr(md5(random()::text),1,6));
    BEGIN UPDATE merchants SET merchant_referral_code=_c WHERE id=_mid;
    EXCEPTION WHEN unique_violation THEN _c := NULL; END;
  END LOOP;
  RETURN _c;
END $$;
GRANT EXECUTE ON FUNCTION public.merchant_referral_code() TO authenticated;

CREATE OR REPLACE FUNCTION public.merchant_add_referral_invite(_phone text, _name text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _mid uuid := current_merchant_id(); _p text := right(regexp_replace(coalesce(_phone,''),'\D','','g'),10); _id uuid;
BEGIN
  IF _mid IS NULL THEN RAISE EXCEPTION 'not_merchant'; END IF;
  IF length(_p) <> 10 THEN RAISE EXCEPTION 'invalid_phone'; END IF;
  INSERT INTO merchant_referral_invites(merchant_id, phone, name) VALUES (_mid, _p, nullif(trim(_name),''))
  ON CONFLICT (merchant_id, phone) DO UPDATE SET name = coalesce(EXCLUDED.name, merchant_referral_invites.name)
  RETURNING id INTO _id;
  RETURN _id;
END $$;
GRANT EXECUTE ON FUNCTION public.merchant_add_referral_invite(text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.merchant_my_referrals() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _mid uuid := current_merchant_id();
BEGIN
  IF _mid IS NULL THEN RAISE EXCEPTION 'not_merchant'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(x ORDER BY x->>'at' DESC),'[]') FROM (
    SELECT jsonb_build_object('phone', i.phone, 'name', coalesce(m.store_name, i.name), 'at', i.created_at,
      'status', CASE WHEN i.reward_earned_at IS NOT NULL THEN 'reward' WHEN m.status='approved' THEN 'live'
                     WHEN m.id IS NOT NULL THEN 'signed_up' ELSE 'invited' END,
      'reward_amount', i.reward_amount) x
    FROM merchant_referral_invites i
    LEFT JOIN LATERAL (SELECT id, store_name, status FROM merchants mm WHERE right(regexp_replace(coalesce(mm.phone,''),'\D','','g'),10)=i.phone LIMIT 1) m ON true
    WHERE i.merchant_id=_mid
    UNION ALL
    SELECT jsonb_build_object('phone', m.phone, 'name', m.store_name, 'at', m.created_at,
      'status', CASE WHEN m.status='approved' THEN 'live' ELSE 'signed_up' END, 'reward_amount', null)
    FROM merchants m WHERE m.referred_by_merchant_id=_mid
      AND NOT EXISTS (SELECT 1 FROM merchant_referral_invites i WHERE i.merchant_id=_mid AND i.phone=right(regexp_replace(coalesce(m.phone,''),'\D','','g'),10))
  ) t);
END $$;
GRANT EXECUTE ON FUNCTION public.merchant_my_referrals() TO authenticated;

-- Ticket owners upload support attachments into their ticket folder
CREATE POLICY "Ticket owner uploads support attachments" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'support-attachments' AND EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id::text = (storage.foldername(name))[1] AND t.user_id = auth.uid()));
