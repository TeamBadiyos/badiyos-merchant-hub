CREATE OR REPLACE FUNCTION public.business_get_trip_otps(_courier_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _mid uuid := public.business_require_delivery();
  _o public.courier_orders%rowtype;
  _batch record;
  _trip_no integer;
begin
  select * into _o from public.courier_orders where id=_courier_order_id;
  if _o.id is null or _o.source is distinct from 'business' or _o.business_merchant_id is distinct from _mid then
    raise exception 'Forbidden' using errcode='42501'; end if;

  select b.id, b.created_at, b.zone_id, z.name as zone_name,
         coalesce(sum(bo.packet_count), 0)::integer as parcel_count
    into _batch
    from public.business_batches b
    left join public.zones z on z.id = b.zone_id
    left join public.business_orders bo on bo.batch_id = b.id
   where b.courier_order_id = _courier_order_id
     and b.merchant_id = _mid
   group by b.id, b.created_at, b.zone_id, z.name;

  if _batch.id is not null then
    select numbered.trip_no into _trip_no
      from (
        select b2.id, row_number() over (order by b2.id)::integer as trip_no
          from public.business_batches b2
         where b2.merchant_id = _mid
           and b2.created_at = _batch.created_at
      ) numbered
     where numbered.id = _batch.id;
  end if;

  return jsonb_build_object(
    'order_id',_o.id,
    'order_code',_o.order_code,
    'status',_o.status,
    'run_label',case when _batch.created_at is null then null else to_char(_batch.created_at at time zone 'Asia/Kolkata', 'HH24:MI') || ' run' end,
    'trip_no',_trip_no,
    'zone_name',_batch.zone_name,
    'parcel_count',coalesce(_batch.parcel_count, 0),
    'stops', coalesce((select jsonb_agg(jsonb_build_object(
      'stop_id',s.id,'stop_type',s.stop_type,'sequence',s.sequence,'address',s.address,
      'receiver_name', coalesce((select r.name from public.business_orders bo join public.business_receivers r on r.id=bo.receiver_id
                                  where bo.drop_stop_id=s.id limit 1), s.contact_name),
      'contact_name',s.contact_name,'contact_phone',s.contact_phone,'status',s.status,
      'reference_nos',(select jsonb_agg(bo.reference_no order by bo.created_at) from public.business_orders bo where bo.drop_stop_id=s.id and bo.reference_no is not null),
      'parcel_count',coalesce((select sum(bo.packet_count) from public.business_orders bo where bo.drop_stop_id=s.id), 0),
      'otp',public.courier_stop_visible_otp(s.id)) order by s.sequence)
      from public.courier_order_stops s where s.order_id=_o.id),'[]'::jsonb));
end $function$;