-- Derived "currently open" = approved AND manual toggle ON AND inside weekly hours AND no closed override today (IST)
CREATE OR REPLACE FUNCTION public.merchant_is_currently_open(_merchant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m record;
  _now timestamptz := now();
  _local timestamp := (now() AT TIME ZONE 'Asia/Kolkata');
  _date date := (_now AT TIME ZONE 'Asia/Kolkata')::date;
  _dow int := EXTRACT(dow FROM (_now AT TIME ZONE 'Asia/Kolkata'))::int;
  _t time := (_now AT TIME ZONE 'Asia/Kolkata')::time;
  _h record;
BEGIN
  SELECT id, status, is_accepting_orders INTO _m
  FROM public.merchants WHERE id = _merchant_id;

  IF _m.id IS NULL OR _m.status <> 'approved' OR _m.is_accepting_orders IS NOT TRUE THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.merchant_schedule_overrides o
    WHERE o.merchant_id = _merchant_id AND o.override_date = _date AND o.is_closed
  ) THEN
    RETURN false;
  END IF;

  SELECT open_time, close_time, is_closed INTO _h
  FROM public.merchant_store_hours
  WHERE merchant_id = _merchant_id AND day_of_week = _dow
  LIMIT 1;

  -- No weekly timings configured yet: fall back to the manual toggle only.
  IF _h IS NULL THEN
    RETURN true;
  END IF;

  IF _h.is_closed OR _h.open_time IS NULL OR _h.close_time IS NULL THEN
    RETURN false;
  END IF;

  RETURN _t >= _h.open_time AND _t < _h.close_time;
END;
$$;

REVOKE ALL ON FUNCTION public.merchant_is_currently_open(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merchant_is_currently_open(uuid) TO anon, authenticated, service_role;

-- Merchant-side manual toggle
CREATE OR REPLACE FUNCTION public.merchant_set_accepting_orders(_accepting boolean)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _mid uuid := public.current_merchant_id();
BEGIN
  IF _mid IS NULL THEN
    RAISE EXCEPTION 'not a merchant';
  END IF;

  UPDATE public.merchants
  SET is_accepting_orders = COALESCE(_accepting, false), updated_at = now()
  WHERE id = _mid;

  RETURN public.merchant_is_currently_open(_mid);
END;
$$;

REVOKE ALL ON FUNCTION public.merchant_set_accepting_orders(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merchant_set_accepting_orders(boolean) TO authenticated, service_role;