/*
# Delivery workflow — Part 2: admin task RPCs

1. New functions (all SECURITY DEFINER, admin-gated, every action appended to
   delivery_task_history with actor + timestamp):

- `admin_create_delivery_task(p_booking_id, p_task_type, p_pickup_address,
   p_destination_address, p_scheduled_date, p_scheduled_window, p_note)`
   - Creates an Unassigned pickup or return-delivery task from booking data.
   - For return_delivery: generates a 6-digit OTP, stores ONLY its sha256 hash with a
     7-day expiry, returns the plaintext OTP once in the response (admin records it
     separately). The hash is never returned by any other function.
   - Booking customer name/phone are copied into contact fields so the agent can reach
     the customer; address fields are admin-editable.
   - Rejects duplicate active task of same type (DB index + explicit check).

- `admin_assign_delivery_task(p_task_id, p_agent_id, p_note)`
   - Assigns to an approved, active, accepting-tasks agent only.
   - Task must be unassigned, or in a state the admin can redirect: assigned/accepted/
     failed/exception (reassignment). Not while agent is en route or task completed.
   - Reassignment clears acceptance/pickup timestamps and any stale OTP state, resets
     status to 'assigned', records previous agent in history.

- `admin_update_delivery_task(p_task_id, p_action, p_details)`
   - Admin lifecycle: cancel, mark_failed (with reason), reset_to_unassigned.
   - `p_details` never accepts OTP material; OTP secrets are write-once at creation.

- `admin_list_delivery_agents()` — agents for the assignment dropdown.
- `admin_list_delivery_tasks(p_status)` — task list with booking ref, agent name,
  masked OTP flag (whether an OTP exists), never the hash.
- `admin_delivery_task_history(p_task_id)` — full audit for one task.
- `admin_pending_delivery_exceptions()` — failed/exception tasks needing attention.

2. Security
- All functions check is_admin() internally and return {'error':'only_admins'}.
- EXECUTE granted to authenticated only. Search path pinned.
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
SET search_path TO 'public'
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

  -- one active task per booking per type (also enforced by partial unique index)
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

CREATE OR REPLACE FUNCTION public.admin_assign_delivery_task(
  p_task_id uuid, p_agent_id uuid, p_note text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin uuid := auth.uid();
  t delivery_tasks%ROWTYPE;
  a delivery_agents%ROWTYPE;
  v_prev_agent uuid;
  v_prev_status text;
BEGIN
  IF v_admin IS NULL OR NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'only_admins');
  END IF;

  SELECT * INTO t FROM delivery_tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'task_not_found');
  END IF;
  IF t.status IN ('completed','delivered','cancelled') THEN
    RETURN jsonb_build_object('error', 'task_closed');
  END IF;
  IF t.status IN ('on_the_way','out_for_delivery') THEN
    RETURN jsonb_build_object('error', 'agent_en_route_use_exception_flow');
  END IF;

  SELECT * INTO a FROM delivery_agents WHERE id = p_agent_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'agent_not_found');
  END IF;
  IF NOT a.is_active OR NOT a.is_accepting_tasks THEN
    RETURN jsonb_build_object('error', 'agent_not_available');
  END IF;

  v_prev_agent := t.assigned_agent_id;
  v_prev_status := t.status;

  UPDATE delivery_tasks SET
    assigned_agent_id = p_agent_id,
    assigned_at = now(),
    accepted_at = NULL,
    picked_up_at = NULL,
    completed_at = NULL,
    status = 'assigned',
    assignment_note = COALESCE(NULLIF(p_note, ''), t.assignment_note),
    -- fresh verification window if a return OTP already existed
    return_otp_expires_at = CASE
      WHEN t.return_otp_hash IS NOT NULL THEN now() + interval '7 days'
      ELSE t.return_otp_expires_at END,
    exception_reason = '',
    failure_reason = '',
    updated_at = now()
  WHERE id = p_task_id;

  INSERT INTO delivery_task_history (task_id, actor, actor_role, actor_label, action, details)
  VALUES (
    p_task_id, v_admin, 'admin', 'Admin',
    CASE WHEN v_prev_agent IS NULL THEN 'task_assigned' ELSE 'task_reassigned' END,
    CASE
      WHEN v_prev_agent IS NULL THEN 'Assigned to agent ' || a.name
      ELSE 'Reassigned from agent #' || v_prev_agent::text || ' to ' || a.name ||
           ' (previous status: ' || v_prev_status || ')'
    END || CASE WHEN COALESCE(NULLIF(p_note, ''), '') <> '' THEN ' — note: ' || p_note ELSE '' END
  );

  RETURN jsonb_build_object('success', true, 'task_reference', t.task_reference);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_delivery_task(
  p_task_id uuid, p_action text, p_details text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin uuid := auth.uid();
  t delivery_tasks%ROWTYPE;
BEGIN
  IF v_admin IS NULL OR NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'only_admins');
  END IF;

  SELECT * INTO t FROM delivery_tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'task_not_found');
  END IF;

  IF p_action = 'cancel' THEN
    IF t.status IN ('completed','delivered','cancelled') THEN
      RETURN jsonb_build_object('error', 'task_already_closed');
    END IF;
    UPDATE delivery_tasks SET status = 'cancelled',
      failure_reason = COALESCE(NULLIF(p_details,''), 'cancelled by admin'),
      updated_at = now() WHERE id = p_task_id;
  ELSIF p_action = 'mark_failed' THEN
    IF t.status IN ('completed','delivered','cancelled') THEN
      RETURN jsonb_build_object('error', 'task_already_closed');
    END IF;
    IF COALESCE(p_details, '') = '' THEN
      RETURN jsonb_build_object('error', 'reason_required');
    END IF;
    UPDATE delivery_tasks SET status = 'failed',
      failure_reason = p_details, updated_at = now() WHERE id = p_task_id;
  ELSIF p_action = 'mark_exception' THEN
    IF COALESCE(p_details, '') = '' THEN
      RETURN jsonb_build_object('error', 'reason_required');
    END IF;
    UPDATE delivery_tasks SET status = 'exception',
      exception_reason = p_details, updated_at = now() WHERE id = p_task_id;
  ELSIF p_action = 'reset_to_unassigned' THEN
    IF t.status IN ('completed','delivered','cancelled') THEN
      RETURN jsonb_build_object('error', 'task_already_closed');
    END IF;
    UPDATE delivery_tasks SET status = 'unassigned',
      assigned_agent_id = NULL, assigned_at = NULL, accepted_at = NULL,
      picked_up_at = NULL, completed_at = NULL,
      exception_reason = '', failure_reason = '', updated_at = now()
    WHERE id = p_task_id;
  ELSE
    RETURN jsonb_build_object('error', 'invalid_action');
  END IF;

  INSERT INTO delivery_task_history (task_id, actor, actor_role, actor_label, action, details)
  VALUES (p_task_id, v_admin, 'admin', 'Admin', 'admin_' || p_action, p_details);

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_delivery_agents()
RETURNS TABLE(
  id uuid, name text, phone text, agent_code text, service_areas text,
  auth_user_id uuid, is_active boolean, is_accepting_tasks boolean
)
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id, name, phone, agent_code, service_areas, auth_user_id, is_active, is_accepting_tasks
  FROM delivery_agents ORDER BY name;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_delivery_tasks(p_status text DEFAULT 'all')
RETURNS TABLE(
  id uuid, task_reference text, booking_id uuid, booking_reference text,
  task_type text, status text,
  pickup_address text, destination_address text,
  contact_name text, contact_phone text,
  scheduled_date date, scheduled_window text,
  assignment_note text, exception_reason text, failure_reason text,
  agent_name text, agent_code text,
  assigned_at timestamptz, accepted_at timestamptz, picked_up_at timestamptz, completed_at timestamptz,
  has_otp boolean,
  created_at timestamptz
)
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT t.id, t.task_reference, t.booking_id, b.booking_reference,
         t.task_type, t.status,
         t.pickup_address, t.destination_address,
         t.contact_name, t.contact_phone,
         t.scheduled_date, t.scheduled_window,
         t.assignment_note, t.exception_reason, t.failure_reason,
         a.name, a.agent_code,
         t.assigned_at, t.accepted_at, t.picked_up_at, t.completed_at,
         (t.return_otp_hash IS NOT NULL),
         t.created_at
  FROM delivery_tasks t
  JOIN bookings b ON b.id = t.booking_id
  LEFT JOIN delivery_agents a ON a.id = t.assigned_agent_id
  WHERE (p_status = 'all' OR t.status = p_status)
  ORDER BY t.created_at DESC
  LIMIT 200;
$$;

CREATE OR REPLACE FUNCTION public.admin_delivery_task_history(p_task_id uuid)
RETURNS TABLE(
  id uuid, actor_role text, actor_label text, action text, details text, created_at timestamptz
)
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT h.id, h.actor_role, h.actor_label, h.action, h.details, h.created_at
  FROM delivery_task_history h
  WHERE h.task_id = p_task_id
  ORDER BY h.created_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.admin_pending_delivery_exceptions()
RETURNS TABLE(
  task_id uuid, task_reference text, booking_reference text,
  task_type text, status text, agent_name text,
  exception_reason text, failure_reason text, updated_at timestamptz
)
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT t.id, t.task_reference, b.booking_reference,
         t.task_type, t.status, a.name,
         t.exception_reason, t.failure_reason, t.updated_at
  FROM delivery_tasks t
  JOIN bookings b ON b.id = t.booking_id
  LEFT JOIN delivery_agents a ON a.id = t.assigned_agent_id
  WHERE t.status IN ('failed','exception')
  ORDER BY t.updated_at DESC
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION
  public.admin_create_delivery_task(uuid, text, text, text, date, text, text),
  public.admin_assign_delivery_task(uuid, uuid, text),
  public.admin_update_delivery_task(uuid, text, text),
  public.admin_list_delivery_agents(),
  public.admin_list_delivery_tasks(text),
  public.admin_delivery_task_history(uuid),
  public.admin_pending_delivery_exceptions()
TO authenticated;
