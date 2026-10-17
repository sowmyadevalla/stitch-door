/*
# Booking validation hardening + admin update policy fix

1. Plain-English explanation
- Fixes three real user-testing bugs at the database level:
  (a) Admins could not save the confirmed price — the bookings table had NO
      UPDATE policy (an earlier migration dropped the old one without adding a
      replacement), so every admin save silently failed.
  (b) Customers could submit an appointment slot already in the past.
  (c) Customers could submit an address outside the serviceable PIN codes.
- Also hardens contact message phone validation server-side.

2. Modified tables / functions
- `bookings`: NEW UPDATE policy — only admins get direct UPDATE. Customers
  still cannot change prices or statuses; their cancellation goes through the
  existing SECURITY DEFINER customer_cancel_booking function, unaffected.
- `create_booking(p_payload)`: re-issued with new server-side checks
  (section 3). Existing signature and return shape unchanged.
- `contact_messages`: NOT VALID CHECK requiring at least 10 digits in the
  phone. NOT VALID means existing rows (one junk test row exists) are not
  touched, but every new insert is validated.

3. New server-side validations in create_booking
- Past slot rejection: preferred_pickup_date + preferred_pickup_window are
  validated against the business timezone Asia/Kolkata. The window string
  ("9 AM – 11 AM" etc.) is parsed to its END hour; a slot is rejected if the
  window's end time (IST) has already passed on today's date, or if the date
  is before today's IST date. Future dates and later windows today are valid.
- PIN code serviceability: rejected unless the PIN exists in
  serviceable_areas with is_active = true.
- Phone: same 10-digit [6-9] rule as before (unchanged, re-asserted).

4. Security changes
- NEW: "admin_update_bookings" policy on bookings (FOR UPDATE, TO
  authenticated, USING/WITH CHECK is_admin()). No other policy changes.
- bookings RLS stays enabled; anon still cannot read or update bookings.

5. Important notes
- The admin UI was failing ONLY because of the missing policy. This migration
  is the root-cause fix; the UI is also improved separately to reload the
  saved value after save.
- No data is modified or deleted; all existing bookings, prices, references,
  and the existing contact message row are preserved. Idempotent.
*/

-- ============ 1. bookings UPDATE policy (fixes admin price save) ============
DROP POLICY IF EXISTS "admin_update_bookings" ON public.bookings;
CREATE POLICY "admin_update_bookings"
  ON public.bookings
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============ 2. helper: pickup window end hour in Asia/Kolkata ============
CREATE OR REPLACE FUNCTION public.pickup_window_end_ist(p_window text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_norm text;
  v_parts text[];
  v_end text;
  v_hour int;
  v_pm boolean;
BEGIN
  IF p_window IS NULL THEN
    RETURN NULL;
  END IF;
  v_norm := regexp_replace(p_window, '\s*[–—-]\s*', '-', 'g');
  v_parts := split(v_norm, '-');
  IF array_length(v_parts, 1) <> 2 THEN
    RETURN NULL;
  END IF;
  v_end := upper(trim(v_parts[2]));
  v_hour := (regexp_match(v_end, '^(\d{1,2})'))[1]::int;
  v_pm := v_end LIKE '%PM%';
  IF v_pm AND v_hour <> 12 THEN
    v_hour := v_hour + 12;
  END IF;
  IF NOT v_pm AND v_hour = 12 THEN
    v_hour := 0;
  END IF;
  RETURN v_hour;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- ============ 3. create_booking with slot + pincode validation ============
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

  -- Service-area check: PIN must be an active serviceable area
  IF NOT EXISTS (
    SELECT 1 FROM public.serviceable_areas
    WHERE pin_code = v_pin AND is_active = true
  ) THEN
    RETURN jsonb_build_object('error', 'unservable_pincode');
  END IF;

  -- Date format check
  IF v_date IS NULL OR v_date !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RETURN jsonb_build_object('error', 'invalid_slot');
  END IF;

  -- Past-slot rejection in business timezone (Asia/Kolkata)
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
    payment_status, payment_method
  ) VALUES (
    v_ref, v_user_id, v_name, v_phone, COALESCE(v_email, ''),
    v_addr, v_locality, v_pin,
    v_date::date,
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

-- ============ 4. contact phone CHECK (new rows only) ============
ALTER TABLE public.contact_messages
  DROP CONSTRAINT IF EXISTS contact_messages_phone_valid;

ALTER TABLE public.contact_messages
  ADD CONSTRAINT contact_messages_phone_valid
  CHECK (length(regexp_replace(phone, '\D', '', 'g')) >= 10) NOT VALID;
