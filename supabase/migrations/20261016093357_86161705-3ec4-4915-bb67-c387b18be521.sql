CREATE OR REPLACE FUNCTION public.merchant_get_order_rider(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
declare _mid uuid; _o record; _e record; _dist numeric;
begin
  _mid := public.current_merchant_id();
  if _mid is null then return null; end if;
  select mo.status, c.assigned_expert_id, m.latitude, m.longitude into _o
    from public.merchant_orders mo
    join public.courier_orders c on c.id = mo.courier_order_id
    join public.merchants m on m.id = mo.merchant_id
   where mo.id = _order_id and mo.merchant_id = _mid;
  if _o.assigned_expert_id is null or _o.status not in ('expert_assigned','ready','picked_up') then return null; end if;
  select name, phone, current_lat, current_lng, location_updated_at into _e from public.experts where id = _o.assigned_expert_id;
  if _e.current_lat is not null and _o.latitude is not null then
    _dist := public.business_haversine_m(_e.current_lat::numeric, _e.current_lng::numeric, _o.latitude::numeric, _o.longitude::numeric);
  end if;
  return jsonb_build_object('name', _e.name, 'phone', _e.phone,
    'distance_m', round(_dist), 'location_updated_at', _e.location_updated_at);
end $$;

CREATE OR REPLACE FUNCTION public.merchant_order_accept_deadlines(_order_ids uuid[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_object_agg(o.id,
    coalesce(o.placed_at, o.paid_at, o.created_at) + make_interval(mins => public.city_accept_timeout(coalesce(o.city_id, m.city_id),
      case when m.service_type = 'food' then 'food' else 'store' end))), '{}'::jsonb)
  FROM public.merchant_orders o JOIN public.merchants m ON m.id = o.merchant_id
  WHERE o.id = ANY(_order_ids) AND o.merchant_id = public.current_merchant_id();
$$;
REVOKE ALL ON FUNCTION public.merchant_order_accept_deadlines(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.merchant_order_accept_deadlines(uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION public.merchant_get_order_rider(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.merchant_get_order_rider(uuid) TO authenticated;