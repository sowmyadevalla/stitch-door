/*
# Assignment workflow v2, part 6: admin setting for offer deadline

- admin_set_offer_expiry(p_hours integer): ADMIN only. Stores the acceptance
  deadline (in hours) used when creating offers. 0 or empty disables deadlines;
  capped at 720 hours (30 days) to prevent nonsense values.
- app_settings stays admin-read-only via RLS; updates go through this function
  so the client never writes configuration rows directly.
*/

CREATE OR REPLACE FUNCTION public.admin_set_offer_expiry(p_hours integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'only_admins');
  END IF;
  IF p_hours IS NULL OR p_hours < 0 OR p_hours > 720 THEN
    RETURN jsonb_build_object('error', 'invalid_hours');
  END IF;
  INSERT INTO app_settings (id, offer_expiry_hours, updated_at)
  VALUES (1, p_hours, now())
  ON CONFLICT (id) DO UPDATE SET offer_expiry_hours = p_hours, updated_at = now();
  RETURN jsonb_build_object('success', true, 'offer_expiry_hours', p_hours);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_offer_expiry(integer) FROM PUBLIC, anon, authenticated;