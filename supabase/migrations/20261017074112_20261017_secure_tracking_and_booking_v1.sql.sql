/*
# Secure guest tracking, tamper-proof pricing, restricted customer updates

1. Problems fixed
- Guest tracking failed: RLS blocked guests from reading their booking.
- Guests could not write booking_status_history (booking flow errored after save).
- Prices came from the browser and were stored as-is (tamper risk).
- Authenticated customers could update admin-only fields on their own booking.

2. New Tables
- `booking_access` — one row per booking holding a guest tracking token
  - `booking_id` (uuid, primary key, references bookings, on delete cascade)
  - `token` (text, unique, not null)
  - `created_at`

3. New Functions (SECURITY DEFINER, search_path pinned)
- `track_booking(p_ref, p_last4)` — guest/owner tracking; verifies phone last-4
  server-side, returns booking + items + non-internal history as JSON.
- `create_booking(p_payload)` — the only way to create a booking: prices are
  read from `services` server-side, totals computed server-side, reference and
  token generated server-side, booking + items + history + access inserted atomically.
- `customer_cancel_booking(p_booking_id)` — the only customer update path:
  cancels their own booking while status is still early.

4. Security changes
- booking_access: RLS enabled, no policies (functions/service-role only).
- bookings: insert policy removed (function-only); update policy restricted to
  admin only; read policy unchanged (admin or owner).
- booking_items: insert policy removed (function-only).
- booking_status_history: insert restricted to admin (function writes via definer).
- EXECUTE on generate_booking_reference revoked from anon/authenticated.
- Existing bookings backfilled with tracking tokens.
*/

-- ============ booking_access table ============
CREATE TABLE IF NOT EXISTS public.booking_access (
  booking_id uuid PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.booking_access ENABLE ROW LEVEL SECURITY;

INSERT INTO public.booking_access (booking_id, token)
SELECT b.id, public.generate_booking_reference() || substr(md5(random()::text), 1, 12)
FROM public.bookings b
WHERE NOT EXISTS (SELECT 1 FROM public.booking_access ba WHERE ba.booking_id = b.id)
ON CONFLICT (booking_id) DO NOTHING;

-- ============ tracking function ============
CREATE OR REPLACE FUNCTION public.track_booking(p_ref text, p_last4 text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
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
    'booking', to_jsonb(b),
    'items', items,
    'history', history
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.track_booking(text, text) TO anon, authenticated;

-- ============ create_booking function ============
CREATE OR REPLACE FUNCTION public.create_booking(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_cfg business_config%ROWTYPE;
  v_item jsonb;
  v_service services%ROWTYPE;
  v_qty integer;
  v_subtotal numeric := 0;
  v_fee numeric;
  v_total numeric;
  v_ref text;
  v_token text;
  v_booking_id uuid;
  v_items_json jsonb := '[]'::jsonb;
  v_name text;
  v_phone_raw text;
  v_phone text;
  v_email text;
  v_addr text;
  v_locality text;
  v_pin text;
  v_date text;
  v_window text;
  v_instructions text;
BEGIN
  v_name         := NULLIF(trim(p_payload->>'customer_name'), '');
  v_phone_raw    := NULLIF(trim(p_payload->>'customer_phone'), '');
  v_email        := NULLIF(trim(p_payload->>'customer_email'), '');
  v_addr         := NULLIF(trim(p_payload->>'pickup_address'), '');
  v_locality     := NULLIF(trim(p_payload->>'locality'), '');
  v_pin          := NULLIF(trim(p_payload->>'pin_code'), '');
  v_date         := NULLIF(p_payload->>'preferred_pickup_date', '');
  v_window       := NULLIF(trim(p_payload->>'preferred_pickup_window'), '');
  v_instructions := NULLIF(trim(COALESCE(p_payload->>'additional_instructions', '')), '');

  IF v_name IS NULL OR v_phone_raw IS NULL OR v_addr IS NULL
     OR v_locality IS NULL OR v_pin IS NULL OR v_window IS NULL THEN
    RETURN jsonb_build_object('error', 'missing_fields');
  END IF;

  v_phone := regexp_replace(v_phone_raw, '\D', '', 'g');
  IF length(v_phone) <> 10 OR v_phone !~ '^[6-9]' THEN
    RETURN jsonb_build_object('error', 'invalid_phone');
  END IF;
  IF v_pin !~ '^[1-9][0-9]{5}$' THEN
    RETURN jsonb_build_object('error', 'invalid_pincode');
  END IF;

  SELECT * INTO v_cfg FROM business_config WHERE id = 1;

  FOR v_item IN SELECT * FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p_payload->'items') = 'array' THEN p_payload->'items' ELSE '[]'::jsonb END)
  LOOP
    v_qty := LEAST(GREATEST(COALESCE((v_item->>'quantity')::int, 1), 1), 50);

    SELECT * INTO v_service FROM services
      WHERE id::text = (v_item->>'service_id') AND is_available = true;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'invalid_service');
    END IF;

    v_subtotal := v_subtotal + v_service.starting_price * v_qty;
    v_items_json := v_items_json || jsonb_build_object(
      'service_id', v_service.id,
      'service_name', v_service.name,
      'quantity', v_qty,
      'garment_notes', trim(concat_ws(E'\n',
        COALESCE(v_item->>'garment_notes', ''),
        COALESCE(v_item->>'answers_text', ''))),
      'unit_price', v_service.starting_price,
      'line_total', v_service.starting_price * v_qty
    );
  END LOOP;

  IF jsonb_array_length(v_items_json) = 0 THEN
    RETURN jsonb_build_object('error', 'empty_items');
  END IF;

  v_fee := COALESCE(v_cfg.pickup_delivery_fee, 0);
  v_total := v_subtotal + v_fee;

  v_ref := public.generate_booking_reference();
  v_token := encode(digest(v_ref || clock_timestamp()::text || random()::text, 'sha256'), 'hex');

  INSERT INTO bookings (
    booking_reference, user_id, customer_name, customer_phone, customer_email,
    pickup_address, locality, pin_code, preferred_pickup_date, preferred_pickup_window,
    additional_instructions, status, estimated_total, pickup_delivery_fee,
    payment_status, payment_method
  ) VALUES (
    v_ref, v_user_id, v_name, v_phone, COALESCE(v_email, ''),
    v_addr, v_locality, v_pin,
    CASE WHEN v_date IS NULL OR v_date = '' THEN NULL ELSE v_date::date END,
    v_window,
    COALESCE(v_instructions, ''), 'request_received', v_total, v_fee,
    'pending', 'manual'
  )
  RETURNING id INTO v_booking_id;

  INSERT INTO booking_items (booking_id, service_id, service_name, quantity, garment_notes, unit_price, line_total)
  SELECT v_booking_id,
         (it->>'service_id')::uuid,
         it->>'service_name',
         (it->>'quantity')::int,
         it->>'garment_notes',
         (it->>'unit_price')::numeric,
         (it->>'line_total')::numeric
  FROM jsonb_array_elements(v_items_json) AS it;

  INSERT INTO booking_status_history (booking_id, status, note, is_internal, created_by)
  VALUES (v_booking_id, 'request_received', 'Booking request submitted.', false, v_user_id);

  INSERT INTO booking_access (booking_id, token) VALUES (v_booking_id, v_token);

  RETURN jsonb_build_object(
    'booking_id', v_booking_id,
    'booking_reference', v_ref,
    'tracking_token', v_token,
    'estimated_total', v_total,
    'subtotal', v_subtotal,
    'delivery_fee', v_fee
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', 'server_error', 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_booking(jsonb) TO anon, authenticated;

-- ============ customer cancellation ============
CREATE OR REPLACE FUNCTION public.customer_cancel_booking(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b bookings%ROWTYPE;
BEGIN
  SELECT * INTO b FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  IF auth.uid() IS NULL OR b.user_id IS NULL OR b.user_id <> auth.uid() THEN
    RETURN jsonb_build_object('error', 'not_authorized');
  END IF;

  IF b.status NOT IN ('request_received', 'awaiting_confirmation', 'price_confirmed') THEN
    RETURN jsonb_build_object('error', 'cannot_cancel');
  END IF;

  UPDATE bookings
    SET status = 'cancelled',
        cancellation_reason = 'Cancelled by customer.',
        updated_at = now()
    WHERE id = p_booking_id;

  INSERT INTO booking_status_history (booking_id, status, note, is_internal, created_by)
  VALUES (p_booking_id, 'cancelled', 'Cancelled by customer.', false, auth.uid());

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.customer_cancel_booking(uuid) TO authenticated;

-- ============ tighten table policies ============
DROP POLICY IF EXISTS "public_insert_bookings" ON public.bookings;
DROP POLICY IF EXISTS "update_bookings" ON public.bookings;

DROP POLICY IF EXISTS "insert_booking_items" ON public.booking_items;

DROP POLICY IF EXISTS "admin_insert_status_history" ON public.booking_status_history;
CREATE POLICY "admin_insert_status_history" ON public.booking_status_history
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

REVOKE EXECUTE ON FUNCTION public.generate_booking_reference() FROM anon, authenticated;