ALTER TABLE public.wallet_ledger DROP CONSTRAINT IF EXISTS wallet_ledger_owner_type_check;
ALTER TABLE public.wallet_ledger ADD CONSTRAINT wallet_ledger_owner_type_check
  CHECK (owner_type = ANY (ARRAY['expert'::text, 'area_partner'::text, 'merchant'::text]));

GRANT SELECT ON public.wallet_ledger TO authenticated;
GRANT ALL ON public.wallet_ledger TO service_role;

CREATE POLICY "Merchants can view own wallet_ledger"
ON public.wallet_ledger FOR SELECT TO authenticated
USING (owner_type = 'merchant' AND owner_id = public.current_merchant_id());

CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_merchant_order_reason_idx
  ON public.wallet_ledger (owner_id, reason)
  WHERE owner_type = 'merchant';

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS low_stock_threshold integer NOT NULL DEFAULT 5;

CREATE OR REPLACE FUNCTION public.merchant_orders_ledger_on_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _net numeric;
BEGIN
  IF NEW.status = 'completed' AND COALESCE(OLD.status, '') <> 'completed' THEN
    _net := COALESCE(NEW.total_amount, 0) - COALESCE(NEW.commission_amount, 0);
    INSERT INTO public.wallet_ledger (owner_type, owner_id, amount, type, reason)
    VALUES ('merchant', NEW.merchant_id, ABS(_net), CASE WHEN _net < 0 THEN 'debit' ELSE 'credit' END,
            'order:' || NEW.id::text)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS merchant_orders_ledger_on_complete ON public.merchant_orders;
CREATE TRIGGER merchant_orders_ledger_on_complete
AFTER UPDATE OF status ON public.merchant_orders
FOR EACH ROW EXECUTE FUNCTION public.merchant_orders_ledger_on_complete();