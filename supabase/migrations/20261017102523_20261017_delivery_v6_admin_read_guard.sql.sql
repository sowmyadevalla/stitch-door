/*
# Delivery workflow security fix: guard admin read functions with is_admin()

1. Security fix
- `admin_list_delivery_agents`, `admin_list_delivery_tasks`,
  `admin_delivery_task_history`, and `admin_pending_delivery_exceptions` were
  SECURITY DEFINER SQL functions without an internal is_admin() check, so any
  authenticated user could read all delivery tasks, customer contact details, and
  history via RPC. They now return zero rows unless the caller is an admin
  (is_admin() added to the WHERE clause).
- Mutating admin functions already had the guard; unchanged.

2. No data or behavior changes for legitimate admin users.
*/

CREATE OR REPLACE FUNCTION public.admin_list_delivery_agents()
RETURNS TABLE(
  id uuid, name text, phone text, agent_code text, service_areas text,
  auth_user_id uuid, is_active boolean, is_accepting_tasks boolean
)
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id, name, phone, agent_code, service_areas, auth_user_id, is_active, is_accepting_tasks
  FROM delivery_agents
  WHERE public.is_admin()
  ORDER BY name;
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
  WHERE public.is_admin()
    AND (p_status = 'all' OR t.status = p_status)
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
  WHERE public.is_admin() AND h.task_id = p_task_id
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
  WHERE public.is_admin()
    AND t.status IN ('failed','exception')
  ORDER BY t.updated_at DESC
  LIMIT 50;
$$;
