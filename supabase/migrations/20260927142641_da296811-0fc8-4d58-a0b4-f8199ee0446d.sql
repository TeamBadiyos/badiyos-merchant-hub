CREATE OR REPLACE FUNCTION public.business_get_trip_otps(_courier_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare _mid uuid := public.business_require_delivery(); _o public.courier_orders%rowtype; _b public.business_batches%rowtype; _rider_name text; _rider_phone text; _run_created_at timestamptz;
  _picked boolean; _can_cancel boolean; _fee numeric := 0; _amt numeric; _business_name text;
begin
  select * into _o from public.courier_orders where id=_courier_order_id;
  if _o.id is null or _o.source is distinct from 'business' or _o.business_merchant_id is distinct from _mid then
    raise exception 'Forbidden' using errcode='42501'; end if;
  select * into _b from public.business_batches where courier_order_id=_o.id limit 1;
  if _b.dispatch_run_id is not null then
    select created_at into _run_created_at from public.business_dispatch_runs where id=_b.dispatch_run_id;
  end if;
  select business_name into _business_name from public.business_profiles where merchant_id=_mid;
  if _o.assigned_expert_id is not null then
    select name, phone into _rider_name, _rider_phone from public.experts where id=_o.assigned_expert_id;
  end if;
  _amt := coalesce(_o.total_amount,0);
  _picked := exists (select 1 from public.courier_order_stops s where s.order_id=_o.id and s.stop_type='pickup' and s.completed_at is not null);
  _can_cancel := _b.id is not null and _b.status = 'dispatched' and not _picked
    and _o.status in ('REQUESTED','SEARCHING','DRIVER_ASSIGNED','ARRIVED_PICKUP');
  if _can_cancel and _o.status = 'ARRIVED_PICKUP' then
    _fee := (select f.fee_total from public.courier_cancel_fee_for(_o.id) f);
  end if;
  return jsonb_build_object('order_id',_o.id,'order_code',_o.order_code,'status',_o.status,
    'batch_id',_b.id,'batch_status',_b.status,'dispatch_run_id',_b.dispatch_run_id,
    'dispatch_date',case when _run_created_at is null then null else to_char(_run_created_at at time zone 'Asia/Kolkata', 'DD Mon YYYY') end,
    'business_name',_business_name,
    'trip_amount',_amt,'can_cancel',_can_cancel,
    'cancel_fee_preview',_fee,'refund_preview',round(greatest(0,_amt-_fee),2),
    'run_label',case when _run_created_at is null then null else to_char(_run_created_at at time zone 'Asia/Kolkata', 'HH24:MI') end,
    'trip_no',_b.trip_no,'trip_label',_b.trip_label,
    'parcel_count',coalesce((select sum(bo.packet_count) from public.business_orders bo where bo.batch_id=_b.id),0),
    'rider_available',_o.assigned_expert_id is not null,
    'rider_name',_rider_name,'rider_phone',_rider_phone,
    'stops', coalesce((select jsonb_agg(jsonb_build_object(
      'stop_id',s.id,'stop_type',s.stop_type,'sequence',s.sequence,'address',s.address,
      'drop_label',case when s.stop_type='drop' then (
        select dl.item->>'label'
          from jsonb_array_elements(coalesce(_b.drop_labels,'[]'::jsonb)) with ordinality dl(item, ordinal)
          where (dl.item->>'receiver_id')::uuid = (
            select bo.receiver_id from public.business_orders bo where bo.drop_stop_id=s.id limit 1)
          limit 1) else null end,
      'receiver_name', coalesce((select r.name from public.business_orders bo join public.business_receivers r on r.id=bo.receiver_id
                                  where bo.drop_stop_id=s.id limit 1), s.contact_name),
      'contact_name',s.contact_name,'contact_phone',s.contact_phone,'status',s.status,
      'reference_nos',(select jsonb_agg(bo.reference_no order by bo.created_at) from public.business_orders bo where bo.drop_stop_id=s.id and bo.reference_no is not null),
      'parcel_count',coalesce((select sum(bo.packet_count) from public.business_orders bo where bo.drop_stop_id=s.id),0),
      'packets', coalesce((select jsonb_agg(jsonb_build_object('code',p.code,'packet_no',p.packet_no,'packet_total',p.packet_total,
                  'trip_no',_b.trip_no,'drop_label',p.drop_label,'scanned_pickup_at',p.scanned_pickup_at,'scanned_drop_at',p.scanned_drop_at)
                  order by p.packet_no) from public.business_trip_packets p where p.drop_stop_id=s.id),'[]'::jsonb),
      'otp',public.courier_stop_visible_otp(s.id)) order by s.sequence)
      from public.courier_order_stops s where s.order_id=_o.id),'[]'::jsonb));
end $function$;