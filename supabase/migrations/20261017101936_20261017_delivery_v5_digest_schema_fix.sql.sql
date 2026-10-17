/*
# Delivery workflow fix: hash OTPs with extensions.digest

The pgcrypto extension is installed in the `extensions` schema on this database, so
`digest(...)` must be schema-qualified. Updates the OTP hashing in:
- `admin_create_delivery_task` (stores sha256 hex of the one-time code)
- `agent_complete_return` (verifies the customer code against the stored hash)

No data, policy, or behavior changes otherwise.
*/

CREATE OR REPLACE FUNCTION public.admin_create_delivery_task(
  p_booking_id uuid,
  p_task_type text,
  p_pickup_address text DEFAULT '',
  p_destination_address text DEFAULT '',
  p_scheduled_date date DEFAULT NULL,
  p_scheduled_window text DEFAULT '',
  p_note text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_admin uuid := auth.uid();
  b bookings%ROWTYPE;
  v_task_id uuid;
  v_ref text;
  v_otp text;
BEGIN
  IF v_admin IS NULL OR NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'only_admins');
  END IF;
  IF p_task_type NOT IN ('pickup','return_delivery') THEN
    RETURN jsonb_build_object('error', 'invalid_task_type');
  END IF;

  SELECT * INTO b FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'booking_not_found');
  END IF;
  IF b.status = 'cancelled' THEN
    RETURN jsonb_build_object('error', 'booking_cancelled');
  END IF;

  IF EXISTS (
    SELECT 1 FROM delivery_tasks
    WHERE booking_id = p_booking_id AND task_type = p_task_type
      AND status NOT IN ('completed','cancelled','delivered')
  ) THEN
    RETURN jsonb_build_object('error', 'duplicate_active_task');
  END IF;

  v_ref := public.generate_delivery_task_reference();

  IF p_task_type = 'return_delivery' THEN
    v_otp := lpad((floor(random() * 1000000))::integer::text, 6, '0');
  END IF;

  INSERT INTO delivery_tasks (
    task_reference, booking_id, task_type, status,
    pickup_address, destination_address,
    contact_name, contact_phone,
    scheduled_date, scheduled_window, assignment_note,
    return_otp_hash, return_otp_expires_at,
    created_by
  ) VALUES (
    v_ref, p_booking_id, p_task_type, 'unassigned',
    COALESCE(NULLIF(p_pickup_address, ''),
      CASE WHEN p_task_type = 'pickup'
        THEN b.pickup_address || ', ' || b.locality || ' ' || b.pin_code
        ELSE '' END),
    COALESCE(NULLIF(p_destination_address, ''),
      CASE WHEN p_task_type = 'pickup' THEN '' ELSE b.pickup_address || ', ' || b.locality || ' ' || b.pin_code END),
    b.customer_name, b.customer_phone,
    p_scheduled_date, p_scheduled_window, p_note,
    CASE WHEN v_otp IS NOT NULL THEN encode(digest(v_otp, 'sha256'), 'hex') END,
    CASE WHEN v_otp IS NOT NULL THEN now() + interval '7 days' END,
    v_admin
  )
  RETURNING id INTO v_task_id;

  INSERT INTO delivery_task_history (task_id, actor, actor_role, actor_label, action, details)
  VALUES (v_task_id, v_admin, 'admin', 'Admin', 'task_created',
          p_task_type || ' task for booking ' || b.booking_reference);

  RETURN jsonb_build_object(
    'success', true, 'task_id', v_task_id, 'task_reference', v_ref,
    'otp', v_otp  -- plaintext shown ONCE to the admin; only the hash is stored
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_complete_return(p_task_id uuid, p_otp text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_agent delivery_agents%ROWTYPE;
  t delivery_tasks%ROWTYPE;
  b bookings%ROWTYPE;
  v_recent_failures integer;
BEGIN
  SELECT * INTO v_agent FROM delivery_agents WHERE auth_user_id = auth.uid() AND is_active;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_delivery_agent');
  END IF;

  SELECT * INTO t FROM delivery_tasks WHERE id = p_task_id;
  IF NOT FOUND OR t.assigned_agent_id <> v_agent.id THEN
    RETURN jsonb_build_object('error', 'task_not_yours');
  END IF;
  IF t.task_type <> 'return_delivery' THEN
    RETURN jsonb_build_object('error', 'not_a_return_task');
  END IF;
  IF t.status <> 'out_for_delivery' THEN
    RETURN jsonb_build_object('error', 'invalid_transition');
  END IF;

  SELECT count(*) INTO v_recent_failures
  FROM delivery_task_history
  WHERE task_id = p_task_id AND action = 'otp_failed'
    AND created_at > now() - interval '15 minutes';
  IF v_recent_failures >= 5 THEN
    RETURN jsonb_build_object('error', 'too_many_attempts');
  END IF;

  IF t.return_otp_hash IS NULL OR t.return_otp_expires_at IS NULL
     OR t.return_otp_expires_at < now()
     OR encode(digest(COALESCE(p_otp, ''), 'sha256'), 'hex') <> t.return_otp_hash THEN
    INSERT INTO delivery_task_history (task_id, actor, actor_role, actor_label, action, details)
    VALUES (p_task_id, auth.uid(), 'delivery_agent', v_agent.name, 'otp_failed', 'wrong or expired code');
    RETURN jsonb_build_object('error', 'otp_invalid');
  END IF;

  UPDATE delivery_tasks SET status = 'delivered', completed_at = now(),
    return_otp_hash = NULL, return_otp_expires_at = NULL, updated_at = now()
  WHERE id = p_task_id;

  INSERT INTO delivery_task_history (task_id, actor, actor_role, actor_label, action, details)
  VALUES (p_task_id, auth.uid(), 'delivery_agent', v_agent.name, 'return_delivered', 'customer verified by code');

  SELECT * INTO b FROM bookings WHERE id = t.booking_id;
  IF b.status NOT IN ('cancelled') THEN
    UPDATE bookings SET status = 'delivered', updated_at = now() WHERE id = t.booking_id;
    INSERT INTO booking_status_history (booking_id, status, note, is_internal, created_by)
    VALUES (t.booking_id, 'delivered', 'Delivered and verified with the customer', false, b.user_id);
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;
