CREATE POLICY "reward_programs_merchant_read" ON public.reward_programs
FOR SELECT TO authenticated
USING (
  actor_type = 'merchant'
  AND EXISTS (SELECT 1 FROM public.merchants m WHERE m.auth_user_id = auth.uid())
);

GRANT SELECT ON public.reward_programs TO authenticated;
GRANT SELECT ON public.reward_trigger_types TO authenticated;
GRANT SELECT ON public.reward_ledger TO authenticated;