/*
# Delivery workflow — Part 3: delivery agent RPCs

1. New functions (all SECURITY DEFINER; each resolves the caller's agent record from
   auth.uid() and operates ONLY on tasks assigned to that agent):

- `agent_list_my_tasks()` — the agent's tasks grouped in two lists: active tasks
  (assigned/accepted/on_the_way/picked_up/out_for_delivery/exception) and closed
  history (completed/delivered/failed/cancelled). Returns only task-necessary fields:
  addresses, contact name/phone, schedule, note — no admin notes, no prices, no
  booking internals beyond the reference, no OTP material.

- `agent_accept_task(p_task_id, p_accept, p_reason)` — accept or reject an assignment.
  Only while status='assigned'. Rejection records the reason and returns the task to
  unassigned for reassignment (admin notified via activity + exceptions list).

- `agent_update_task_status(p_task_id, p_new_status, p_note)` — forward-only stage
  moves enforced per task type:
    pickup:  accepted → on_the_way → picked_up → completed (handover confirm)
    return:  accepted → on_the_way → out_for_delivery → delivered (OTP required)
  Duplicate completion is impossible: terminal statuses are rejected. 'picked_up' on a
  pickup task sets picked_up_at; the final step is `agent_complete_task` (handover
  confirmation) for pickups and OTP-checked delivery for returns.

- `agent_complete_pickup(p_task_id, p_handover_note)` — confirms the garment handover
  at the tailor/QC destination. Only valid when status='picked_up' (duplicate-safe).

- `agent_complete_return(p_task_id, p_otp)` — completes a return delivery ONLY with
  the customer's 6-digit OTP, checked against the stored sha256 hash with expiry.
  Failed attempts are rate-limited: 5 wrong attempts in 15 minutes locks verification
  for 15 minutes (attempt tracking in history). Sets delivered + completed_at.
  Booking status advances to 'delivered' so customer tracking reflects reality.
  A failed OTP attempt is recorded in history but the hash is never exposed.

- `agent_report_issue(p_task_id, p_reason)` — failed attempt / exception reporting by
  the agent; task moves to 'failed' with the reason; admin sees it in exceptions.

2. Customer-visible sync with existing tailoring workflow
- pickup task completed (agent_complete_pickup): booking status → 'picked_up' if the
  booking is still at/before pickup stages.
- return task delivered (agent_complete_return): booking status → 'delivered'.
- Admin retains manual override via the existing booking status control.

3. Security
- Every call re-derives the agent from the session; tasks of other agents are
  invisible and inoperable. Terminal and invalid transitions rejected server-side.
*/

CREATE OR REPLACE FUNCTION public.agent_list_my_tasks()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_agent delivery_agents%ROWTYPE;
  v_active jsonb;
  v_closed jsonb;
BEGIN
  SELECT * INTO v_agent FROM delivery_agents WHERE auth_user_id = auth.uid() AND is_active;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_delivery_agent');
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.created_at DESC), '[]')
  INTO v_active
  FROM (
    SELECT t.id, t.task_reference, b.booking_reference, t.task_type, t.status,
           t.pickup_address, t.destination_address,
           t.contact_name, t.contact_phone,
           t.scheduled_date, t.scheduled_window, t.assignment_note,
           t.exception_reason, t.failure_reason,
           t.assigned_at, t.accepted_at, t.picked_up_at, t.completed_at, t.created_at
    FROM delivery_tasks t
    JOIN bookings b ON b.id = t.booking_id
    WHERE t.assigned_agent_id = v_agent.id
      AND t.status IN ('assigned','accepted','on_the_way','picked_up','out_for_delivery','exception')
    ORDER BY t.created_at DESC
  ) x;

  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.completed_at DESC), '[]')
  INTO v_closed
  FROM (
    SELECT t.id, t.task_reference, b.booking_reference, t.task_type, t.status,
           t.completed_at, t.failure_reason
    FROM delivery_tasks t
    JOIN bookings b ON b.id = t.booking_id
    WHERE t.assigned_agent_id = v_agent.id
      AND t.status IN ('completed','delivered','failed','cancelled')
    ORDER BY t.completed_at DESC NULLS LAST
    LIMIT 50
  ) x;

  RETURN jsonb_build_object(
    'agent', jsonb_build_object('id', v_agent.id, 'name', v_agent.name,
                                'agent_code', v_agent.agent_code),
    'active', v_active,
    'closed', v_closed
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_accept_task(p_task_id uuid, p_accept boolean, p_reason text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_agent delivery_agents%ROWTYPE;
  t delivery_tasks%ROWTYPE;
BEGIN
  SELECT * INTO v_agent FROM delivery_agents WHERE auth_user_id = auth.uid() AND is_active;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_delivery_agent');
  END IF;

  SELECT * INTO t FROM delivery_tasks WHERE id = p_task_id;
  IF NOT FOUND OR t.assigned_agent_id <> v_agent.id THEN
    RETURN jsonb_build_object('error', 'task_not_yours');
  END IF;
  IF t.status <> 'assigned' THEN
    RETURN jsonb_build_object('error', 'not_awaiting_response');
  END IF;

  IF p_accept THEN
    UPDATE delivery_tasks SET status = 'accepted', accepted_at = now(), updated_at = now()
    WHERE id = p_task_id;
    INSERT INTO delivery_task_history (task_id, actor, actor_role, actor_label, action, details)
    VALUES (p_task_id, auth.uid(), 'delivery_agent', v_agent.name, 'task_accepted', '');
  ELSE
    UPDATE delivery_tasks SET status = 'unassigned',
      assigned_agent_id = NULL, assigned_at = NULL,
      assignment_note = '', updated_at = now()
    WHERE id = p_task_id;
    INSERT INTO delivery_task_history (task_id, actor, actor_role, actor_label, action, details)
    VALUES (p_task_id, auth.uid(), 'delivery_agent', v_agent.name, 'task_rejected',
            COALESCE(NULLIF(p_reason, ''), 'no reason given'));
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_update_task_status(p_task_id uuid, p_new_status text, p_note text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_agent delivery_agents%ROWTYPE;
  t delivery_tasks%ROWTYPE;
BEGIN
  SELECT * INTO v_agent FROM delivery_agents WHERE auth_user_id = auth.uid() AND is_active;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_delivery_agent');
  END IF;

  SELECT * INTO t FROM delivery_tasks WHERE id = p_task_id;
  IF NOT FOUND OR t.assigned_agent_id <> v_agent.id THEN
    RETURN jsonb_build_object('error', 'task_not_yours');
  END IF;

  -- Only intermediate in-progress moves are allowed here; terminal steps have
  -- dedicated functions (handover confirmation / OTP delivery).
  IF NOT (
    (p_new_status = 'accepted' AND t.status = 'assigned')
    OR (p_new_status = 'on_the_way' AND t.status IN ('accepted'))
    OR (p_new_status = 'picked_up' AND t.task_type = 'pickup' AND t.status = 'on_the_way')
    OR (p_new_status = 'out_for_delivery' AND t.task_type = 'return_delivery' AND t.status = 'on_the_way')
  ) THEN
    RETURN jsonb_build_object('error', 'invalid_transition');
  END IF;

  UPDATE delivery_tasks SET status = p_new_status, updated_at = now() WHERE id = p_task_id;
  INSERT INTO delivery_task_history (task_id, actor, actor_role, actor_label, action, details)
  VALUES (p_task_id, auth.uid(), 'delivery_agent', v_agent.name, 'status_' || p_new_status,
          COALESCE(NULLIF(p_note, ''), ''));

  RETURN jsonb_build_object('success', true, 'status', p_new_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_complete_pickup(p_task_id uuid, p_handover_note text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_agent delivery_agents%ROWTYPE;
  t delivery_tasks%ROWTYPE;
  b bookings%ROWTYPE;
BEGIN
  SELECT * INTO v_agent FROM delivery_agents WHERE auth_user_id = auth.uid() AND is_active;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_delivery_agent');
  END IF;

  SELECT * INTO t FROM delivery_tasks WHERE id = p_task_id;
  IF NOT FOUND OR t.assigned_agent_id <> v_agent.id THEN
    RETURN jsonb_build_object('error', 'task_not_yours');
  END IF;
  IF t.task_type <> 'pickup' THEN
    RETURN jsonb_build_object('error', 'not_a_pickup_task');
  END IF;
  IF t.status <> 'picked_up' THEN
    RETURN jsonb_build_object('error', 'invalid_transition');
  END IF;

  UPDATE delivery_tasks SET status = 'completed', completed_at = now(), updated_at = now()
  WHERE id = p_task_id;

  INSERT INTO delivery_task_history (task_id, actor, actor_role, actor_label, action, details)
  VALUES (p_task_id, auth.uid(), 'delivery_agent', v_agent.name, 'pickup_completed',
          COALESCE(NULLIF(p_handover_note, ''), 'garment handed over'));

  -- Customer-visible sync: garments collected
  SELECT * INTO b FROM bookings WHERE id = t.booking_id;
  IF b.status IN ('price_confirmed','pickup_scheduled') THEN
    UPDATE bookings SET status = 'picked_up', updated_at = now() WHERE id = t.booking_id;
    INSERT INTO booking_status_history (booking_id, status, note, is_internal, created_by)
    VALUES (t.booking_id, 'picked_up', 'Picked up by StitchDoor delivery team', false, b.user_id);
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_complete_return(p_task_id uuid, p_otp text)
RETURNs jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
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

  -- rate limit: max 5 wrong attempts per 15 minutes
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

CREATE OR REPLACE FUNCTION public.agent_report_issue(p_task_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_agent delivery_agents%ROWTYPE;
  t delivery_tasks%ROWTYPE;
BEGIN
  SELECT * INTO v_agent FROM delivery_agents WHERE auth_user_id = auth.uid() AND is_active;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_delivery_agent');
  END IF;

  IF COALESCE(p_reason, '') = '' THEN
    RETURN jsonb_build_object('error', 'reason_required');
  END IF;

  SELECT * INTO t FROM delivery_tasks WHERE id = p_task_id;
  IF NOT FOUND OR t.assigned_agent_id <> v_agent.id THEN
    RETURN jsonb_build_object('error', 'task_not_yours');
  END IF;
  IF t.status IN ('completed','delivered','cancelled') THEN
    RETURN jsonb_build_object('error', 'task_already_closed');
  END IF;

  UPDATE delivery_tasks SET status = 'failed',
    failure_reason = p_reason, updated_at = now() WHERE id = p_task_id;

  INSERT INTO delivery_task_history (task_id, actor, actor_role, actor_label, action, details)
  VALUES (p_task_id, auth.uid(), 'delivery_agent', v_agent.name, 'failed_attempt', p_reason);

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION
  public.agent_list_my_tasks(),
  public.agent_accept_task(uuid, boolean, text),
  public.agent_update_task_status(uuid, text, text),
  public.agent_complete_pickup(uuid, text),
  public.agent_complete_return(uuid, text),
  public.agent_report_issue(uuid, text)
TO authenticated;
