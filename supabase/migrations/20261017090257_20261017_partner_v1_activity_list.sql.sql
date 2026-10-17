/*
# Partner workflow v1, part 2d: admin activity feed

- partner_activity_list(): ADMIN only. Returns the latest 50 audit rows from
  partner_activity so the admin review screen can show an audit trail.
  EXECUTE revoked from anon/authenticated (admins are detected via is_admin()
  inside the function; the revoke simply keeps the surface tidy).
*/

CREATE OR REPLACE FUNCTION public.partner_activity_list()
RETURNS TABLE (
  id uuid,
  actor uuid,
  action text,
  details text,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pa.id, pa.actor, pa.action, pa.details, pa.created_at
  FROM partner_activity pa
  WHERE public.is_admin()
  ORDER BY pa.created_at DESC
  LIMIT 50;
$$;