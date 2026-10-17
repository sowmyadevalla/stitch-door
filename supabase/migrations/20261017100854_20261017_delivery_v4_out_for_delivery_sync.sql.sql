/*
# Delivery workflow — customer-visible sync for "out for delivery"

1. Modified function
- `agent_update_task_status`: when a return-delivery agent marks the task
  out_for_delivery, the booking status advances to ready_for_delivery (if not already
  past it), so the customer's tracking page shows the correct state with the existing
  "Almost home" hint. No other statuses or pricing logic touched.

2. Security
- No policy changes.
*/

CREATE OR REPLACE FUNCTION public.agent_update_task_status(p_task_id uuid, p_new_status text, p_note text DEFAULT '')
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

  -- Customer-visible sync: return garment on the way back to the customer
  IF p_new_status = 'out_for_delivery' THEN
    SELECT * INTO b FROM bookings WHERE id = t.booking_id;
    IF b.status IN ('quality_check','ready_for_delivery') THEN
      UPDATE bookings SET status = 'ready_for_delivery', updated_at = now() WHERE id = t.booking_id;
      INSERT INTO booking_status_history (booking_id, status, note, is_internal, created_by)
      VALUES (t.booking_id, 'ready_for_delivery', 'Your order is on the way back to you', false, b.user_id);
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'status', p_new_status);
END;
$$;
