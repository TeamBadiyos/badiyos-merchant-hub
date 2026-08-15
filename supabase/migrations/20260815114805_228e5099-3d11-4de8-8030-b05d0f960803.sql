-- Push notification trigger for new merchant orders.
-- Mirrors notify_expert_broadcast / notify_expert_assigned: reads the shared
-- push_trigger_secret from edge_runtime_config and posts to the merchant push
-- sender with the same data-only payload contract as expert-send-push.
create or replace function public.notify_merchant_new_order()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  _base text := 'https://project--981f7dd4-309e-4614-b96b-67bc34bd1fdd.lovable.app';
  _secret text;
  _store text;
begin
  begin
    if new.status is distinct from 'pending' then return new; end if;
    if new.merchant_id is null then return new; end if;

    select value into _secret from public.edge_runtime_config where key = 'push_trigger_secret';
    if _secret is null or _secret = '' then return new; end if;

    select store_name into _store from public.merchants where id = new.merchant_id;

    perform net.http_post(
      url := _base || '/api/public/merchant-send-push',
      headers := jsonb_build_object(
        'content-type','application/json',
        'x-trigger-secret', _secret
      ),
      body := jsonb_build_object(
        'order_id', new.id,
        'merchant_id', new.merchant_id,
        'alert_type', 'new_order',
        'title', 'New order ' || coalesce(new.order_number, ''),
        'body', 'New order at ' || coalesce(_store, 'your store') || ' — tap to accept.',
        'amount', new.total_amount,
        'timeout_seconds', 45
      )
    );
  exception when others then
    raise warning '[notify_merchant_new_order] failed for order %: %', new.id, sqlerrm;
  end;
  return new;
end;
$function$;

revoke all on function public.notify_merchant_new_order() from public, anon, authenticated;

drop trigger if exists trg_notify_merchant_new_order on public.merchant_orders;
create trigger trg_notify_merchant_new_order
after insert on public.merchant_orders
for each row
when (new.status = 'pending')
execute function public.notify_merchant_new_order();