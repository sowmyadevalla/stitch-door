/*
# create_booking: idempotent retry support (companion to dedupe migration)

1. Plain-English explanation
- Re-issues create_booking so that when the client passes a
  client_request_id that was already used, the function returns the ORIGINAL
  booking (reference + tracking token) instead of creating a duplicate row.

2. Function changes
- `create_booking(p_payload)`: at the top, if p_payload->>'client_request_id'
  is a valid uuid and a bookings row exists with it, return that booking's
  booking_id, booking_reference, tracking_token, estimated_total, plus
  'duplicate': true so the client knows it matched an earlier submission.
  All other validation logic unchanged from booking_validation_v2.

3. Security
- SECURITY DEFINER unchanged; returns only ref/token for that booking, which
  the caller already received on the first attempt (stored locally). No
  cross-customer exposure: a client_request_id is a random UUID generated
  per-submission by the original customer's browser.
*/

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
  v_now_ist timestamptz;
  v_pickup_ts timestamptz;
  v_client_req uuid;
  v_existing bookings%ROWTYPE;
BEGIN
  -- Idempotent retry: same client_request_id returns the original booking
  BEGIN
    v_client_req := (p_payload->>'client_request_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_client_req := NULL;
  END;

  IF v_client_req IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.bookings
      WHERE client_request_id = v_client_req
      LIMIT 1;
    IF FOUND THEN
      SELECT token INTO v_token FROM public.booking_access
        WHERE booking_id = v_existing.id LIMIT 1;
      RETURN jsonb_build_object(
        'booking_id', v_existing.id,
        'booking_reference', v_existing.booking_reference,
        'tracking_token', v_token,
        'estimated_total', v_existing.estimated_total,
        'duplicate', true
      );
    END IF;
  END IF;

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

  IF NOT EXISTS (
    SELECT 1 FROM public.serviceable_areas
    WHERE pin_code = v_pin AND is_active = true
  ) THEN
    RETURN jsonb_build_object('error', 'unservable_pincode');
  END IF;

  IF v_date IS NULL OR v_date !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RETURN jsonb_build_object('error', 'invalid_slot');
  END IF;

  v_now_ist := now() AT TIME ZONE 'Asia/Kolkata';
  v_pickup_ts := (v_date::date + make_interval(hours => COALESCE(
    public.pickup_window_end_ist(v_window), 19
  ))) AT TIME ZONE 'Asia/Kolkata';
  IF v_pickup_ts < v_now_ist THEN
    RETURN jsonb_build_object('error', 'invalid_slot');
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
    payment_status, payment_method, client_request_id
  ) VALUES (
    v_ref, v_user_id, v_name, v_phone, COALESCE(v_email, ''),
    v_addr, v_locality, v_pin,
    v_date::date,
    v_window,
    COALESCE(v_instructions, ''), 'request_received', v_total, v_fee,
    'pending', 'manual', v_client_req
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
