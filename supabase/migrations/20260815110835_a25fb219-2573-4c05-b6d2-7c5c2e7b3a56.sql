ALTER TABLE public.products ADD COLUMN IF NOT EXISTS gst_rate numeric DEFAULT 0;

CREATE OR REPLACE FUNCTION public.merchant_create_offline_sale(_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _merchant_id uuid;
  _gst boolean;
  _item jsonb;
  _p record;
  _qty integer;
  _rate numeric;
  _line numeric;
  _subtotal numeric := 0;
  _taxable numeric := 0;
  _tax numeric := 0;
  _discount numeric := greatest(coalesce((_payload->>'discount_amount')::numeric, 0), 0);
  _ratio numeric;
  _total numeric;
  _mode_credit boolean;
  _paid numeric;
  _due numeric;
  _status text;
  _sale_id uuid;
  _invoice text;
  _items jsonb := coalesce(_payload->'items', '[]'::jsonb);
BEGIN
  _merchant_id := current_merchant_id();
  IF _merchant_id IS NULL THEN RAISE EXCEPTION 'not_a_merchant'; END IF;
  IF jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'empty_cart'; END IF;

  SELECT coalesce(is_gst_registered, false) INTO _gst FROM merchants WHERE id = _merchant_id;
  SELECT is_credit_type INTO _mode_credit FROM payment_modes
    WHERE id = (_payload->>'payment_mode_id')::uuid AND is_active;
  IF _mode_credit IS NULL THEN RAISE EXCEPTION 'invalid_payment_mode'; END IF;

  -- subtotal from live product prices
  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _qty := (_item->>'quantity')::integer;
    IF _qty IS NULL OR _qty <= 0 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;
    SELECT * INTO _p FROM products
      WHERE id = (_item->>'product_id')::uuid AND merchant_id = _merchant_id;
    IF NOT found THEN RAISE EXCEPTION 'product_not_found'; END IF;
    _subtotal := _subtotal + (_p.price * _qty);
  END LOOP;

  IF _discount > _subtotal THEN _discount := _subtotal; END IF;
  _ratio := CASE WHEN _subtotal > 0 THEN (_subtotal - _discount) / _subtotal ELSE 0 END;

  _invoice := generate_offline_invoice_number(_merchant_id);

  INSERT INTO offline_sales (
    merchant_id, invoice_number, customer_name, customer_phone,
    subtotal, discount_amount, cgst_amount, sgst_amount, total_amount,
    payment_mode_id, payment_status, amount_due
  ) VALUES (
    _merchant_id, _invoice,
    nullif(trim(coalesce(_payload->>'customer_name','')), ''),
    nullif(trim(coalesce(_payload->>'customer_phone','')), ''),
    _subtotal, _discount, 0, 0, 0,
    (_payload->>'payment_mode_id')::uuid, 'paid', 0
  ) RETURNING id INTO _sale_id;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _qty := (_item->>'quantity')::integer;
    SELECT * INTO _p FROM products
      WHERE id = (_item->>'product_id')::uuid AND merchant_id = _merchant_id;
    _rate := CASE WHEN _gst THEN coalesce((_item->>'gst_rate')::numeric, _p.gst_rate, 0) ELSE 0 END;
    _line := round(_p.price * _qty * _ratio, 2);
    _taxable := _taxable + _line;
    _tax := _tax + round(_line * _rate / 100, 2);

    INSERT INTO offline_sale_items (
      sale_id, product_id, product_name_snapshot, hsn_sac_snapshot,
      price_snapshot, quantity, gst_rate
    ) VALUES (
      _sale_id, _p.id, _p.name, _p.hsn_sac_code, _p.price, _qty, _rate
    );

    UPDATE products SET stock_quantity = greatest(stock_quantity - _qty, 0) WHERE id = _p.id;
  END LOOP;

  _total := round(_taxable + _tax, 2);
  _paid := least(greatest(coalesce((_payload->>'amount_paid')::numeric, _total), 0), _total);
  IF NOT coalesce(_mode_credit, false) THEN _paid := _total; END IF;
  _due := round(_total - _paid, 2);
  _status := CASE WHEN _due <= 0 THEN 'paid' WHEN _paid <= 0 THEN 'due' ELSE 'partial' END;

  IF coalesce(_mode_credit, false) AND _due > 0
     AND (nullif(trim(coalesce(_payload->>'customer_name','')), '') IS NULL
       OR nullif(trim(coalesce(_payload->>'customer_phone','')), '') IS NULL) THEN
    RAISE EXCEPTION 'customer_required_for_credit';
  END IF;

  UPDATE offline_sales SET
    cgst_amount = round(_tax / 2, 2),
    sgst_amount = round(_tax - round(_tax / 2, 2), 2),
    total_amount = _total,
    payment_status = _status,
    amount_due = greatest(_due, 0)
  WHERE id = _sale_id;

  RETURN _sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.merchant_create_offline_sale(jsonb) TO authenticated;