/*
# Assignment workflow v2, part 3: admin_assign_booking rewrite

Replaces the previous version. Improvements:
- REASSIGN-SAFE: if an offer for (booking, partner) already exists and is
  expired/rejected, it is revived to pending instead of hitting the
  UNIQUE(booking_id, partner_id) constraint. Only a genuinely PENDING or
  ACCEPTED offer for the same pair is rejected as a duplicate.
- SINGLE-ACTIVE-OFFER guarantee: any other pending offers for this booking are
  expired before creating/reviving the new one. Combined with the unique
  constraint, this prevents simultaneous assignments and duplicate offers.
- DEADLINE: sets expires_at = now() + app_settings.offer_expiry_hours when a
  positive expiry is configured; NULL when disabled (0/empty).
- GUARDS: only active, order-accepting partners can be assigned; booking must
  exist and not be cancelled/delivered.
- HISTORY: writes an immutable partner_activity row with actor role/label
  captured from the calling admin session, including the assignment note.
- Customer-visible booking status is NOT touched.

Error contract (jsonb): only_admins | invalid_partner | not_found |
invalid_status | duplicate_pending_offer | success
*/

CREATE OR REPLACE FUNCTION public.admin_assign_booking(p_booking_id uuid, p_partner_id uuid, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner tailoring_partners%ROWTYPE;
  b bookings%ROWTYPE;
  v_offer_id uuid;
  v_expiry_hours integer;
  v_expires_at timestamptz;
  v_admin_label text;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'only_admins');
  END IF;

  SELECT * INTO v_partner FROM tailoring_partners WHERE id = p_partner_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'invalid_partner'); END IF;
  IF NOT v_partner.is_active THEN RETURN jsonb_build_object('error', 'invalid_partner', 'message', 'Partner account is inactive.'); END IF;
  IF NOT v_partner.is_accepting_orders THEN RETURN jsonb_build_object('error', 'invalid_partner', 'message', 'Partner has paused new orders.'); END IF;

  SELECT * INTO b FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF b.status IN ('cancelled','delivered') THEN
    RETURN jsonb_build_object('error', 'invalid_status');
  END IF;

  -- One active assignment at a time: expire every other pending offer.
  UPDATE partner_offers SET status = 'expired', responded_at = now()
    WHERE booking_id = p_booking_id AND status = 'pending';

  -- Reuse an existing expired/rejected row for this pair, else create one.
  SELECT id INTO v_offer_id FROM partner_offers
    WHERE booking_id = p_booking_id AND partner_id = p_partner_id
    AND status IN ('expired','rejected')
    ORDER BY offered_at DESC LIMIT 1;

  SELECT COALESCE(offer_expiry_hours, 0) INTO v_expiry_hours FROM app_settings WHERE id = 1;
  v_expires_at := CASE WHEN v_expiry_hours > 0 THEN now() + (v_expiry_hours || ' hours')::interval END;

  IF v_offer_id IS NOT NULL THEN
    UPDATE partner_offers
      SET status = 'pending', offered_by = auth.uid(), offered_at = now(),
          responded_at = NULL, expires_at = v_expires_at,
          assignment_note = COALESCE(NULLIF(p_note, ''), '')
      WHERE id = v_offer_id;
  ELSE
    INSERT INTO partner_offers (booking_id, partner_id, status, offered_by, expires_at, assignment_note)
    VALUES (p_booking_id, p_partner_id, 'pending', auth.uid(), v_expires_at, COALESCE(NULLIF(p_note, ''), ''))
    RETURNING id INTO v_offer_id;
  END IF;

  SELECT email INTO v_admin_label FROM auth.users WHERE id = auth.uid();

  INSERT INTO partner_activity (actor, actor_role, actor_label, action, details)
  VALUES (auth.uid(), 'admin', COALESCE(v_admin_label, 'admin'), 'order_assigned',
    COALESCE(b.booking_reference, p_booking_id::text) || ' offered to ' || v_partner.name ||
    CASE WHEN v_expires_at IS NOT NULL THEN ' (expires ' || to_char(v_expires_at, 'DD Mon HH24:MI') || ')' ELSE '' END ||
    CASE WHEN COALESCE(p_note, '') <> '' THEN ' — ' || p_note ELSE '' END);

  RETURN jsonb_build_object('success', true, 'offer_id', v_offer_id, 'expires_at', v_expires_at);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_assign_booking(uuid, uuid, text) FROM PUBLIC, anon, authenticated;