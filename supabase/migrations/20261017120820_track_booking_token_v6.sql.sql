/*
# Token-based order tracking (no phone digits needed)

1. Plain-English explanation
- Customers who booked on this device can track orders with ONE tap — no
  order ID retyping, no last-4 phone digits. The browser stores a secret
  tracking token (issued at booking time); the server now accepts that token
  as full identity proof.
- Guests without the token (e.g. different device) still verify with the
  booking reference + last 4 digits of phone, unchanged.

2. Function changes
- `track_booking(p_ref, p_last4)` → now `track_booking(p_ref, p_last4,
  p_token)`. If p_token matches the row in booking_access for that booking,
  access is granted without phone verification. Otherwise the existing
  last-4-phone check applies exactly as before.
- The sanitized booking payload (no phone/email/user_id) is unchanged.
- Signature change REVOKEs/RE-GRANTs EXECUTE to anon + authenticated, same
  as before.

3. Security
- Token is a 64-char hex secret issued only to the customer at booking time;
  guessing it is infeasible. Tokens are never returned by any public
  endpoint (verified: track_booking returns sanitized booking data only).
- Wrong/guessed token falls through to phone verification, so no new access
  is granted without proof of identity.
- No policy or table changes. No data modified.
*/

CREATE OR REPLACE FUNCTION public.track_booking(p_ref text, p_last4 text, p_token text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
b bookings%ROWTYPE;
last4_norm text;
token_norm text;
token_valid boolean := false;
items jsonb;
history jsonb;
BEGIN
SELECT * INTO b FROM bookings WHERE booking_reference = upper(trim(p_ref));
IF NOT FOUND THEN
RETURN jsonb_build_object('error', 'not_found');
END IF;

-- Proof of identity 1: tracking token (issued to the customer at booking)
token_norm := COALESCE(p_token, '');
IF token_norm <> '' THEN
  SELECT EXISTS (
    SELECT 1 FROM public.booking_access
    WHERE booking_id = b.id AND token = token_norm
  ) INTO token_valid;
END IF;

-- Proof of identity 2: last 4 digits of the booking's phone number
IF NOT token_valid THEN
  last4_norm := regexp_replace(coalesce(p_last4, ''), '\D', '', 'g');
  IF length(last4_norm) = 0 THEN
    RETURN jsonb_build_object('error', 'phone_required');
  END IF;

  IF right(regexp_replace(b.customer_phone, '\D', '', 'g'), 4) <> last4_norm THEN
    RETURN jsonb_build_object('error', 'phone_mismatch');
  END IF;
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

REVOKE EXECUTE ON FUNCTION public.track_booking(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.track_booking(text, text, text) TO anon, authenticated;
