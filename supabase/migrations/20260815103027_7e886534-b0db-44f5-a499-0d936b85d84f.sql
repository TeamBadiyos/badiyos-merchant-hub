-- 1. Merchant context: owner OR active linked staff
create or replace function public.current_merchant_id()
returns uuid language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    (select user_id from public.resolve_caller_identity(auth.uid()) where user_type = 'merchant' limit 1),
    (select ms.merchant_id from public.merchant_staff ms
      where ms.auth_user_id = auth.uid() and ms.status = 'active' limit 1)
  );
$$;

-- 2. Link a freshly authenticated staff phone to its invite
create or replace function public.merchant_claim_staff_invite()
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare _phone text; _mid uuid;
begin
  select right(regexp_replace(split_part(u.email, '@', 1), '\D', '', 'g'), 10)
    into _phone from auth.users u where u.id = auth.uid();
  if _phone is null or _phone = '' then return null; end if;

  update public.merchant_staff ms
     set auth_user_id = auth.uid()
   where regexp_replace(coalesce(ms.phone, ''), '\D', '', 'g') = _phone
     and ms.status = 'active'
     and (ms.auth_user_id is null or ms.auth_user_id = auth.uid())
  returning ms.merchant_id into _mid;

  return _mid;
end; $$;

-- 3. Session context for the portal
create or replace function public.merchant_my_context()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare _mid uuid; _owner boolean; _perms jsonb; _m public.merchants%rowtype; _name text;
begin
  _mid := public.current_merchant_id();
  if _mid is null then return jsonb_build_object('merchant_id', null); end if;

  select * into _m from public.merchants where id = _mid;
  _owner := (_m.auth_user_id is not null and _m.auth_user_id = auth.uid());

  if _owner then
    _perms := '["view_orders","manage_orders","manage_products","view_reports","manage_staff"]'::jsonb;
  else
    select coalesce(r.permissions, '[]'::jsonb), ms.name
      into _perms, _name
      from public.merchant_staff ms
      left join public.merchant_roles r on r.id = ms.role_id
     where ms.auth_user_id = auth.uid() and ms.merchant_id = _mid
     limit 1;
    _perms := coalesce(_perms, '[]'::jsonb);
    if jsonb_typeof(_perms) = 'object' then
      select coalesce(jsonb_agg(e.key), '[]'::jsonb) into _perms
        from jsonb_each(_perms) e where e.value = 'true'::jsonb;
    end if;
  end if;

  return jsonb_build_object(
    'merchant_id', _mid,
    'is_owner', _owner,
    'permissions', _perms,
    'status', _m.status,
    'store_name', _m.store_name,
    'staff_name', _name
  );
end; $$;

-- 4. Accept / reject a pending order
create or replace function public.merchant_decide_order(_order_id uuid, _decision text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare _merchant_id uuid; _ctx jsonb;
begin
  _merchant_id := public.current_merchant_id();
  if _merchant_id is null then raise exception 'not_a_merchant'; end if;

  _ctx := public.merchant_my_context();
  if not ((_ctx->>'is_owner')::boolean or _ctx->'permissions' ? 'manage_orders') then
    raise exception 'not_permitted';
  end if;

  if _decision not in ('accepted','rejected') then raise exception 'invalid_decision'; end if;

  update public.merchant_orders set status = _decision, updated_at = now()
    where id = _order_id and merchant_id = _merchant_id and status = 'pending';

  if not found then raise exception 'order_not_found_or_not_pending'; end if;
end; $$;

-- 5. Progress an accepted order
create or replace function public.merchant_advance_order(_order_id uuid, _new_status text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare _merchant_id uuid; _ctx jsonb; _current text; _expected text;
begin
  _merchant_id := public.current_merchant_id();
  if _merchant_id is null then raise exception 'not_a_merchant'; end if;

  _ctx := public.merchant_my_context();
  if not ((_ctx->>'is_owner')::boolean or _ctx->'permissions' ? 'manage_orders') then
    raise exception 'not_permitted';
  end if;

  _expected := case _new_status
    when 'preparing' then 'accepted'
    when 'ready' then 'preparing'
    when 'completed' then 'ready'
    else null end;
  if _expected is null then raise exception 'invalid_status'; end if;

  select status into _current from public.merchant_orders
   where id = _order_id and merchant_id = _merchant_id;
  if _current is null then raise exception 'order_not_found'; end if;
  if _current <> _expected then raise exception 'invalid_transition'; end if;

  update public.merchant_orders set status = _new_status, updated_at = now()
   where id = _order_id and merchant_id = _merchant_id;
end; $$;

-- 6. Delete rights for merchant-owned rows
grant delete on public.products to authenticated;
grant delete on public.merchant_roles to authenticated;
grant delete on public.merchant_staff to authenticated;

create policy "Merchants delete own products" on public.products
  for delete to authenticated using (merchant_id = public.current_merchant_id());
create policy "Merchants delete own roles" on public.merchant_roles
  for delete to authenticated using (merchant_id = public.current_merchant_id());
create policy "Merchants delete own staff" on public.merchant_staff
  for delete to authenticated using (merchant_id = public.current_merchant_id());

-- 7. Realtime for live order alerts
alter table public.merchant_orders replica identity full;
alter table public.merchant_order_items replica identity full;
alter publication supabase_realtime add table public.merchant_orders;
alter publication supabase_realtime add table public.merchant_order_items;