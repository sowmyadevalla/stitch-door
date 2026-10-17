/*
# Partner workflow v1, part 2e: lock down partner_activity_list

The function is safe to call (it filters on is_admin() internally), but the
client only ever calls it from the admin dashboard, so EXECUTE is revoked from
anon and authenticated to keep the callable surface minimal. Admins connect via
their own session role and keep access.
*/

REVOKE EXECUTE ON FUNCTION public.partner_activity_list() FROM anon, authenticated;