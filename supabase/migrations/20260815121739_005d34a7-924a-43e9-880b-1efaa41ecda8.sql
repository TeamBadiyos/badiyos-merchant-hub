-- Lock in service_role-only EXECUTE on the shared pre-login PIN check.
-- User App and Partner App now route this check through server-side functions,
-- and this Merchant Portal uses the merchantHasPin server function, so no
-- browser role needs EXECUTE any more.
revoke all on function public.has_login_pin(text) from public, anon, authenticated;
grant execute on function public.has_login_pin(text) to service_role;

-- Merchant-side equivalent, kept consistent.
revoke all on function public.merchant_has_login_pin(text) from public, anon, authenticated;
grant execute on function public.merchant_has_login_pin(text) to service_role;