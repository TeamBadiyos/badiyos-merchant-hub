CREATE OR REPLACE FUNCTION public.business_get_trip_otps(_courier_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare _mid uuid := public.business_require_delivery(); _o public.courier_orders%rowtype; _b public.business_batches%rowtype; _r record;
begin
  select * into _o from public.courier_orders where id=_courier_order_id;
  if _o.id is null or _o.source is distinct from 'business' or _o.business_merchant_id is distinct from _mid then
    raise exception 'Forbidden' using errcode='42501'; end if;
  select * into _b from public.business_batches where courier_order_id=_o.id limit 1;
  if _o.assigned_expert_id is not null then
    select name, phone into _r from public.experts where id=_o.assigned_expert_id;
  end if;
  return jsonb_build_object('order_id',_o.id,'order_code',_o.order_code,'status',_o.status,
    'trip_no',_b.trip_no,'trip_label',_b.trip_label,
    'parcel_count',coalesce((select sum(bo.packet_count) from public.business_orders bo where bo.batch_id=_b.id),0),
    'rider_available',_o.assigned_expert_id is not null,
    'rider_name',_r.name,'rider_phone',_r.phone,
    'stops', coalesce((select jsonb_agg(jsonb_build_object(
      'stop_id',s.id,'stop_type',s.stop_type,'sequence',s.sequence,'address',s.address,
      'drop_label', case when s.stop_type='drop' then 'C' || (s.sequence - 1) end,
      'receiver_name', coalesce((select r.name from public.business_orders bo join public.business_receivers r on r.id=bo.receiver_id
                                  where bo.drop_stop_id=s.id limit 1), s.contact_name),
      'contact_name',s.contact_name,'contact_phone',s.contact_phone,'status',s.status,
      'reference_nos',(select jsonb_agg(bo.reference_no order by bo.created_at) from public.business_orders bo where bo.drop_stop_id=s.id and bo.reference_no is not null),
      'parcel_count',coalesce((select sum(bo.packet_count) from public.business_orders bo where bo.drop_stop_id=s.id),0),
      'otp',public.courier_stop_visible_otp(s.id)) order by s.sequence)
      from public.courier_order_stops s where s.order_id=_o.id),'[]'::jsonb));
end $function$;