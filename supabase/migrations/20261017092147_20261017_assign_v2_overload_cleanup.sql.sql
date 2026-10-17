/*
# Assignment workflow v2, part 7: cleanup overloads + partner role locks

- Drops the old partner_respond_offer(uuid, boolean) overload; the replacement
  (uuid, boolean, text) keeps the third argument optional, so existing 2-arg
  calls continue to work against the new function. Removes the duplicate
  definition so there is exactly one code path.
- Revokes EXECUTE from anon on partner_respond_offer and partner_update_stage:
  both act on behalf of a signed-in partner, so anon must never reach them.
  authenticated keeps access.
*/

DROP FUNCTION IF EXISTS public.partner_respond_offer(uuid, boolean);

REVOKE EXECUTE ON FUNCTION public.partner_respond_offer(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_respond_offer(uuid, boolean, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.partner_update_stage(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_update_stage(uuid, text, text) TO authenticated;