/*
# Revoke public EXECUTE on is_admin() function

The is_admin() function is used internally by RLS policies and should not be callable
directly via the REST API. Revoke EXECUTE from anon and authenticated roles.
The function is still usable within RLS policy evaluation because policies run with
invoker privileges and the function is SECURITY DEFINER.
*/

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon, authenticated;
