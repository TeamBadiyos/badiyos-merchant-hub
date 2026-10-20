create or replace function public.notify_merchant_new_order()
returns trigger language plpgsql security definer set search_path to 'public', 'extensions' as $function$
declare
  _base text := 'https://project--981f7dd4-309e-4614-b96b-67bc34bd1fdd.lovable.app';
  _secret text; _store text; _city uuid; _svc text; _secs int;
begin
  begin
    if new.merchant_id is null then return new; end if;
    select value into _secret from public.edge_runtime_config where key = 'push_trigger_secret';
    if _secret is null or _secret = '' then return new; end if;

    if tg_op = 'INSERT' then
      if new.status is distinct from 'pending' then return new; end if;
      select store_name, city_id, case when service_type = 'food' then 'food' else 'store' end
        into _store, _city, _svc from public.merchants where id = new.merchant_id;
      _secs := greatest(30, extract(epoch from (
        coalesce(new.placed_at, new.paid_at, new.created_at)
        + make_interval(mins => public.city_accept_timeout(coalesce(new.city_id, _city), _svc)) - now()))::int);
      perform net.http_post(
        url := _base || '/api/public/merchant-send-push',
        headers := jsonb_build_object('content-type','application/json','x-trigger-secret', _secret),
        body := jsonb_build_object('order_id', new.id, 'merchant_id', new.merchant_id, 'alert_type', 'new_order',
          'title', 'New order ' || coalesce(new.order_number, ''),
          'body', 'New order at ' || coalesce(_store, 'your store') || ' — tap to accept.',
          'amount', new.total_amount, 'timeout_seconds', _secs));
    elsif old.status in ('pending','placed','paid') and new.status is distinct from old.status then
      perform net.http_post(
        url := _base || '/api/public/merchant-send-push',
        headers := jsonb_build_object('content-type','application/json','x-trigger-secret', _secret),
        body := jsonb_build_object('order_id', new.id, 'merchant_id', new.merchant_id,
          'alert_type', case when new.status = 'cancelled' then 'order_cancelled' else 'order_taken' end,
          'title', 'Order update', 'body', 'Order ' || coalesce(new.order_number, '') || ' is ' || new.status,
          'timeout_seconds', 60));
    end if;
  exception when others then
    raise warning '[notify_merchant_new_order] failed for order %: %', new.id, sqlerrm;
  end;
  return new;
end; $function$;

revoke all on function public.notify_merchant_new_order() from public, anon, authenticated;

drop trigger if exists trg_notify_merchant_order_closed on public.merchant_orders;
create trigger trg_notify_merchant_order_closed
after update of status on public.merchant_orders
for each row when (old.status in ('pending','placed','paid') and new.status is distinct from old.status)
execute function public.notify_merchant_new_order();