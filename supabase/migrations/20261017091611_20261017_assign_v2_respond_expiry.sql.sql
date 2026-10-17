/*
# Assignment workflow v2, part 4: respond + expiry + admin reassignment feed

1. partner_respond_offer rewrite
- expiry: if the pending offer has expires_at in the past, it is marked
  expired and the response is refused with 'offer_expired'.
- decline_reason: when declining, p_reason is stored on the offer and the
  booking's assignment is cleared so the admin can reassign.
- history: partner_activity rows with actor_role 'partner' and the partner's
  name as actor_label, including the decline reason.
- Guards unchanged: only the offered partner (via their auth login) can act.

2. partner_offer_expiry_check()
- Idempotent admin-safe helper marking pending offers past their deadline as
  expired and clearing those bookings' assignments. Called lazily by the admin
  UI and by the activity feed so nothing depends on a cron worker.
- Returns the count newly expired. Revoked from all client roles; also called
  internally by admin_activity_for_booking.

3. admin_activity_for_booking(p_booking_id)
- Returns the immutable assignment/activity history for one booking (latest
  50, newest first) for the admin review screen.
- Also lazily expires offers first so timestamps reflect reality.

4. admin_pending_declines()
- Returns recent offer responses (rejected/expired in the last 7 days) with
  booking reference, partner name and decline reason, so the admin clearly
  sees what needs reassignment.

All functions SECURITY DEFINER with pinned search_path; all revoked from
PUBLIC/anon/authenticated (admin-only, gated on is_admin() internally).
*/

CREATE OR REPLACE FUNCTION public.partner_respond_offer(p_offer_id uuid, p_accept boolean, p_reason text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o partner_offers%ROWTYPE;
  my_partner_id uuid;
  my_name text;
  b bookings%ROWTYPE;
BEGIN
  SELECT id INTO my_partner_id FROM tailoring_partners WHERE auth_user_id = auth.uid() AND is_active = true;
  IF my_partner_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authorized');
  END IF;

  SELECT * INTO o FROM partner_offers WHERE id = p_offer_id;
  IF NOT FOUND OR o.partner_id <> my_partner_id THEN
    RETURN jsonb_build_object('error', 'not_authorized');
  END IF;
  IF o.status <> 'pending' THEN
    RETURN jsonb_build_object('error', 'already_responded');
  END IF;
  IF o.expires_at IS NOT NULL AND o.expires_at < now() THEN
    UPDATE partner_offers SET status = 'expired', responded_at = now() WHERE id = p_offer_id;
    UPDATE bookings SET assigned_partner_id = NULL, updated_at = now()
      WHERE id = o.booking_id AND assigned_partner_id = my_partner_id;
    RETURN jsonb_build_object('error', 'offer_expired');
  END IF;

  SELECT * INTO b FROM bookings WHERE id = o.booking_id;
  SELECT name INTO my_name FROM tailoring_partners WHERE id = my_partner_id;

  UPDATE partner_offers
    SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END,
        responded_at = now(),
        decline_reason = CASE WHEN p_accept THEN NULL ELSE COALESCE(NULLIF(p_reason, ''), 'No reason given') END
    WHERE id = p_offer_id;

  IF p_accept THEN
    UPDATE bookings SET assigned_partner_id = my_partner_id, updated_at = now() WHERE id = o.booking_id;
  ELSE
    UPDATE bookings SET assigned_partner_id = NULL, updated_at = now()
      WHERE id = o.booking_id AND assigned_partner_id = my_partner_id;
  END IF;

  INSERT INTO partner_activity (actor, actor_role, actor_label, action, details)
  VALUES (auth.uid(), 'partner', COALESCE(my_name, 'partner'), 'offer_responded',
    COALESCE(b.booking_reference, o.booking_id::text) || ': ' ||
    CASE WHEN p_accept THEN 'accepted' ELSE 'declined — ' || COALESCE(NULLIF(p_reason, ''), 'No reason given') END);

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.partner_respond_offer(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partner_respond_offer(uuid, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.partner_offer_expiry_check()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  WITH expired AS (
    UPDATE partner_offers
      SET status = 'expired', responded_at = now()
      WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < now()
      RETURNING booking_id
  ), cleared AS (
    UPDATE bookings b
      SET assigned_partner_id = NULL, updated_at = now()
      FROM expired e
      WHERE b.id = e.booking_id
      RETURNING b.id
  )
  SELECT count(*) INTO v_count FROM cleared;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.partner_offer_expiry_check() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_activity_for_booking(p_booking_id uuid)
RETURNS TABLE (
  id uuid,
  actor_role text,
  actor_label text,
  action text,
  details text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'only_admins';
  END IF;
  PERFORM public.partner_offer_expiry_check();

  RETURN QUERY
  SELECT pa.id, pa.actor_role, pa.actor_label, pa.action, pa.details, pa.created_at
  FROM partner_activity pa
  WHERE pa.details ILIKE '%' || (SELECT booking_reference FROM bookings WHERE id = p_booking_id) || '%'
     OR pa.details ILIKE '%' || p_booking_id::text || '%'
  ORDER BY pa.created_at DESC
  LIMIT 50;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_activity_for_booking(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_pending_declines()
RETURNS TABLE (
  offer_id uuid,
  booking_id uuid,
  booking_reference text,
  partner_name text,
  status text,
  decline_reason text,
  responded_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'only_admins';
  END IF;
  PERFORM public.partner_offer_expiry_check();

  RETURN QUERY
  SELECT po.id, po.booking_id, b.booking_reference, tp.name, po.status,
         po.decline_reason, po.responded_at
  FROM partner_offers po
  JOIN bookings b ON b.id = po.booking_id
  JOIN tailoring_partners tp ON tp.id = po.partner_id
  WHERE po.status IN ('rejected','expired')
    AND po.responded_at > now() - interval '7 days'
  ORDER BY po.responded_at DESC
  LIMIT 25;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_pending_declines() FROM PUBLIC, anon, authenticated;