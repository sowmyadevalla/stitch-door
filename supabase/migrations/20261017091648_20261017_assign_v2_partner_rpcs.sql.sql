/*
# Assignment workflow v2, part 5: partner RPCs + remove raw booking exposure

PRIVACY FIX: partners previously read `bookings` rows directly through a
row-level policy. That row includes internal admin fields (admin_notes,
cancellation_reason, customer email, confirmed amounts) that partners must
never see. The SELECT policy on bookings for partners is removed, and partners
now read a sanitized shape through SECURITY DEFINER functions instead:

- partner_list_my_offers(): the partner's PENDING offers (revives expiry check
  first) joined with booking data limited to: reference, customer name, phone,
  pickup address/locality/PIN, preferred date/window, items, assignment note
  and deadline. No admin notes, no email, no amounts.
- partner_list_my_orders(): bookings assigned to the partner in active
  statuses, same sanitized shape plus items and current status.
- partner_booking_detail(p_booking_id): single-order sanitized view, still
  strictly limited to bookings assigned to (or offered to) the caller.

The partner_read_assigned_bookings policy on bookings and the
partner_read_booking_items policy on booking_items are DROPPED. Customer and
admin access paths are unchanged (read_bookings / admin policies remain).

partner_update_stage keeps its existing guard: forward-only transitions on
own assigned bookings, customer-visible history rows, internal audit rows.
*/

CREATE OR REPLACE FUNCTION public.partner_list_my_offers()
RETURNS TABLE (
  offer_id uuid,
  booking_id uuid,
  booking_reference text,
  customer_name text,
  customer_phone text,
  pickup_address text,
  locality text,
  pin_code text,
  preferred_pickup_date date,
  preferred_pickup_window text,
  additional_instructions text,
  assignment_note text,
  expires_at timestamptz,
  offered_at timestamptz,
  items jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  my_partner_id uuid;
BEGIN
  SELECT id INTO my_partner_id FROM tailoring_partners WHERE auth_user_id = auth.uid() AND is_active = true;
  IF my_partner_id IS NULL THEN RETURN; END IF;
  PERFORM public.partner_offer_expiry_check();

  RETURN QUERY
  SELECT po.id, b.id, b.booking_reference, b.customer_name, b.customer_phone,
         b.pickup_address, b.locality, b.pin_code,
         b.preferred_pickup_date, b.preferred_pickup_window,
         b.additional_instructions, po.assignment_note, po.expires_at, po.offered_at,
         COALESCE(jsonb_agg(jsonb_build_object('service_name', bi.service_name, 'quantity', bi.quantity, 'garment_notes', bi.garment_notes) ORDER BY bi.id)
           FILTER (WHERE bi.id IS NOT NULL), '[]'::jsonb)
  FROM partner_offers po
  JOIN bookings b ON b.id = po.booking_id
  LEFT JOIN booking_items bi ON bi.booking_id = b.id
  WHERE po.partner_id = my_partner_id AND po.status = 'pending'
  GROUP BY po.id, b.id
  ORDER BY po.offered_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.partner_list_my_orders()
RETURNS TABLE (
  booking_id uuid,
  booking_reference text,
  status text,
  customer_name text,
  customer_phone text,
  pickup_address text,
  locality text,
  pin_code text,
  preferred_pickup_date date,
  preferred_pickup_window text,
  additional_instructions text,
  items jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  my_partner_id uuid;
BEGIN
  SELECT id INTO my_partner_id FROM tailoring_partners WHERE auth_user_id = auth.uid() AND is_active = true;
  IF my_partner_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT b.id, b.booking_reference, b.status, b.customer_name, b.customer_phone,
         b.pickup_address, b.locality, b.pin_code,
         b.preferred_pickup_date, b.preferred_pickup_window, b.additional_instructions,
         COALESCE(jsonb_agg(jsonb_build_object('service_name', bi.service_name, 'quantity', bi.quantity, 'garment_notes', bi.garment_notes) ORDER BY bi.id)
           FILTER (WHERE bi.id IS NOT NULL), '[]'::jsonb)
  FROM bookings b
  LEFT JOIN booking_items bi ON bi.booking_id = b.id
  WHERE b.assigned_partner_id = my_partner_id
    AND b.status IN ('price_confirmed','pickup_scheduled','picked_up','at_tailoring_partner','quality_check','ready_for_delivery')
  GROUP BY b.id
  ORDER BY b.updated_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.partner_booking_detail(p_booking_id uuid)
RETURNS TABLE (
  booking_id uuid,
  booking_reference text,
  status text,
  customer_name text,
  customer_phone text,
  pickup_address text,
  locality text,
  pin_code text,
  preferred_pickup_date date,
  preferred_pickup_window text,
  additional_instructions text,
  items jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  my_partner_id uuid;
  v_assigned boolean;
  v_offered boolean;
BEGIN
  SELECT id INTO my_partner_id FROM tailoring_partners WHERE auth_user_id = auth.uid() AND is_active = true;
  IF my_partner_id IS NULL THEN RETURN; END IF;

  SELECT (assigned_partner_id = my_partner_id), EXISTS (
    SELECT 1 FROM partner_offers po WHERE po.booking_id = p_booking_id AND po.partner_id = my_partner_id
  ) INTO v_assigned, v_offered
  FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND OR (NOT v_assigned AND NOT v_offered) THEN RETURN; END IF;

  RETURN QUERY
  SELECT b.id, b.booking_reference, b.status, b.customer_name, b.customer_phone,
         b.pickup_address, b.locality, b.pin_code,
         b.preferred_pickup_date, b.preferred_pickup_window, b.additional_instructions,
         COALESCE(jsonb_agg(jsonb_build_object('service_name', bi.service_name, 'quantity', bi.quantity, 'garment_notes', bi.garment_notes) ORDER BY bi.id)
           FILTER (WHERE bi.id IS NOT NULL), '[]'::jsonb)
  FROM bookings b
  LEFT JOIN booking_items bi ON bi.booking_id = b.id
  WHERE b.id = p_booking_id
  GROUP BY b.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.partner_list_my_offers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_list_my_offers() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_list_my_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_list_my_orders() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_booking_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_booking_detail(uuid) TO authenticated;

DROP POLICY IF EXISTS "partner_read_assigned_bookings" ON bookings;
DROP POLICY IF EXISTS "partner_read_booking_items" ON booking_items;