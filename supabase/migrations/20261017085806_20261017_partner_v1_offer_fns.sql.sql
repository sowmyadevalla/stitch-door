/*
# Partner workflow v1, part 2c: assignment + partner actions

- admin_assign_booking(uuid, uuid, text): ADMIN. Sets assigned_partner_id,
  expires any pending offers for the booking, creates a new pending offer.
- partner_respond_offer(uuid, boolean): PARTNER. Only own pending offers.
  Accept keeps/sets the assignment; reject clears it so the admin can reassign.
- partner_update_stage(uuid, text, text): PARTNER. Only on own assigned bookings;
  only forward transitions picked_up -> at_tailoring_partner -> quality_check ->
  ready_for_delivery; writes customer-visible history + audit row.

All three revoke EXECUTE from anon/authenticated.
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
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'only_admins');
  END IF;

  SELECT * INTO v_partner FROM tailoring_partners WHERE id = p_partner_id AND is_active = true;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'invalid_partner'); END IF;

  SELECT * INTO b FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF b.status IN ('cancelled','delivered') THEN
    RETURN jsonb_build_object('error', 'invalid_status');
  END IF;

  UPDATE bookings SET assigned_partner_id = p_partner_id, updated_at = now() WHERE id = p_booking_id;

  UPDATE partner_offers SET status = 'expired', responded_at = now()
    WHERE booking_id = p_booking_id AND status = 'pending';

  INSERT INTO partner_offers (booking_id, partner_id, status, offered_by)
  VALUES (p_booking_id, p_partner_id, 'pending', auth.uid());

  INSERT INTO partner_activity (actor, action, details)
  VALUES (auth.uid(), 'order_assigned', b.booking_reference || ' offered to partner');

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_assign_booking(uuid, uuid, text) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.partner_respond_offer(p_offer_id uuid, p_accept boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o partner_offers%ROWTYPE;
  my_partner_id uuid;
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

  UPDATE partner_offers
    SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END,
        responded_at = now()
    WHERE id = p_offer_id;

  IF p_accept THEN
    UPDATE bookings SET assigned_partner_id = my_partner_id, updated_at = now() WHERE id = o.booking_id;
  ELSE
    UPDATE bookings SET assigned_partner_id = NULL, updated_at = now()
      WHERE id = o.booking_id AND assigned_partner_id = my_partner_id;
  END IF;

  INSERT INTO partner_activity (actor, action, details)
  VALUES (auth.uid(), 'offer_responded', CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END);

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.partner_respond_offer(uuid, boolean) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.partner_update_stage(p_booking_id uuid, p_new_status text, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  my_partner_id uuid;
  b bookings%ROWTYPE;
  v_allowed text[] := ARRAY['picked_up','at_tailoring_partner','quality_check','ready_for_delivery'];
  v_transitions jsonb := jsonb_build_object(
    'picked_up', 'at_tailoring_partner',
    'at_tailoring_partner', 'quality_check',
    'quality_check', 'ready_for_delivery'
  );
  v_expected text;
BEGIN
  SELECT id INTO my_partner_id FROM tailoring_partners WHERE auth_user_id = auth.uid() AND is_active = true;
  IF my_partner_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authorized');
  END IF;

  SELECT * INTO b FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND OR b.assigned_partner_id IS DISTINCT FROM my_partner_id THEN
    RETURN jsonb_build_object('error', 'not_authorized');
  END IF;

  IF NOT (p_new_status = ANY(v_allowed)) THEN
    RETURN jsonb_build_object('error', 'invalid_status');
  END IF;

  v_expected := v_transitions->>b.status;
  IF v_expected IS NULL OR v_expected <> p_new_status THEN
    RETURN jsonb_build_object('error', 'invalid_transition',
      'message', 'From "' || b.status || '" you can only move to "' || COALESCE(v_expected, '(none)') || '".');
  END IF;

  UPDATE bookings SET status = p_new_status, updated_at = now() WHERE id = p_booking_id;

  INSERT INTO booking_status_history (booking_id, status, note, is_internal, created_by)
  VALUES (p_booking_id, p_new_status, COALESCE(NULLIF(p_note, ''), 'Updated by tailoring partner.'), false, auth.uid());

  INSERT INTO partner_activity (actor, action, details)
  VALUES (auth.uid(), 'stage_updated', b.booking_reference || ' -> ' || p_new_status);

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.partner_update_stage(uuid, text, text) FROM anon, authenticated;