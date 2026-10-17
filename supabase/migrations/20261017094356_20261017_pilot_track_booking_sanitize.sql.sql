/*
# Pilot readiness fix: sanitize customer tracking response

track_booking previously returned the ENTIRE bookings row to guests who passed
the reference + last-4-phone check. That exposed internal admin fields
(admin_notes), the customer's email, and internal bookkeeping (user_id,
payment_method) to anyone who could guess/obtain a reference plus 4 digits.

The fix returns only the fields the customer tracking page actually displays:
reference, status, pickup prefs, totals, payment status, timestamps, and the
cancellation reason (intentionally customer-visible on cancelled orders).
admin_notes, customer_email, user_id, payment_method, assigned_partner_id are
no longer returned.

Items and history were already appropriate (history filtered to is_internal =
false) and are unchanged.
*/

CREATE OR REPLACE FUNCTION public.track_booking(p_ref text, p_last4 text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
b bookings%ROWTYPE;
last4_norm text;
items jsonb;
history jsonb;
BEGIN
SELECT * INTO b FROM bookings WHERE booking_reference = upper(trim(p_ref));
IF NOT FOUND THEN
RETURN jsonb_build_object('error', 'not_found');
END IF;

last4_norm := regexp_replace(coalesce(p_last4, ''), '\D', '', 'g');
IF length(last4_norm) = 0 THEN
RETURN jsonb_build_object('error', 'phone_required');
END IF;

IF right(regexp_replace(b.customer_phone, '\D', '', 'g'), 4) <> last4_norm THEN
RETURN jsonb_build_object('error', 'phone_mismatch');
END IF;

SELECT COALESCE(jsonb_agg(to_jsonb(it) ORDER BY it.created_at), '[]'::jsonb)
INTO items
FROM booking_items it WHERE it.booking_id = b.id;

SELECT COALESCE(jsonb_agg(to_jsonb(h) ORDER BY h.created_at), '[]'::jsonb)
INTO history
FROM booking_status_history h
WHERE h.booking_id = b.id AND h.is_internal = false;

RETURN jsonb_build_object(
'booking', jsonb_build_object(
  'booking_reference', b.booking_reference,
  'status', b.status,
  'created_at', b.created_at,
  'updated_at', b.updated_at,
  'preferred_pickup_date', b.preferred_pickup_date,
  'preferred_pickup_window', b.preferred_pickup_window,
  'additional_instructions', b.additional_instructions,
  'pickup_address', b.pickup_address,
  'locality', b.locality,
  'pin_code', b.pin_code,
  'estimated_total', b.estimated_total,
  'confirmed_amount', b.confirmed_amount,
  'payment_status', b.payment_status,
  'cancellation_reason', b.cancellation_reason
),
'items', items,
'history', history
);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.track_booking(text, text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.track_booking(text, text) TO anon, authenticated;