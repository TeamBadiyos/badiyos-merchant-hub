create or replace function public.business_get_trip_rider(_courier_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare _mid uuid; _o public.courier_orders%rowtype; _e record; _veh text; _loc jsonb := null; _stale int;
begin
  _mid := public.business_require_delivery();
  select * into _o from public.courier_orders where id = _courier_order_id;
  if _o.id is null or _o.source <> 'business' or _o.business_merchant_id is distinct from _mid then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  if _o.assigned_expert_id is null then
    return jsonb_build_object('available', false);
  end if;
  select name, phone, photo_url, current_lat, current_lng, location_updated_at into _e
    from public.experts where id = _o.assigned_expert_id;
  select name into _veh from public.courier_vehicle_types where id = _o.vehicle_type_id;
  if _o.status in ('DRIVER_ASSIGNED','ARRIVED_PICKUP','PICKED_UP','IN_TRANSIT')
     and _e.current_lat is not null and _e.current_lng is not null then
    _stale := public.courier_setting('courier_location_stale_seconds', 120)::int;
    _loc := jsonb_build_object('lat', _e.current_lat, 'lng', _e.current_lng,
      'location_updated_at', _e.location_updated_at,
      'stale', coalesce(_e.location_updated_at < now() - make_interval(secs => _stale), true));
  end if;
  return jsonb_build_object('available', true, 'name', _e.name, 'phone', _e.phone,
    'photo_url', _e.photo_url, 'vehicle', _veh, 'location', _loc);
end $$;
revoke all on function public.business_get_trip_rider(uuid) from public, anon;
grant execute on function public.business_get_trip_rider(uuid) to authenticated, service_role;