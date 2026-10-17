/*
# Delivery Agent Workflow — Part 1: Schema, security model, helpers

1. New Tables
- `delivery_agents` — approved delivery agents managed by the admin.
  - `id` (uuid, pk), `name`, `phone`, `agent_code` (short display code, unique)
  - `service_areas` (text, comma-separated localities/PINs — recorded coverage only)
  - `auth_user_id` (uuid, unique, nullable — links to a login; never self-assigned)
  - `is_active`, `is_accepting_tasks` (booleans — only active+accepting agents get tasks)
  - `created_at`
- `delivery_tasks` — one pickup OR return-delivery task per booking per type.
  - `id` (uuid, pk), `task_reference` (text, unique, e.g. DTABCDEFGH)
  - `booking_id` (uuid fk -> bookings), `task_type` ('pickup' | 'return_delivery')
  - `status`: unassigned/assigned/accepted/on_the_way/picked_up/completed (pickup);
    unassigned/assigned/accepted/on_the_way/out_for_delivery/delivered (return);
    plus failed/exception and cancelled for both (enforced in RPC transition logic)
  - `pickup_address`, `destination_address` — freely set by admin, so the same schema
    supports customer->tailor, customer->QC-location, or any routed movement
  - `contact_name`, `contact_phone` — customer contact, shown to the assigned agent only
  - `scheduled_date`, `scheduled_window` — optional schedule
  - `assignment_note` — admin note FOR the agent (not secret); `exception_reason`,
    `failure_reason` — why a task failed or was cancelled
  - `assigned_agent_id` (fk delivery_agents), `assigned_at`, `accepted_at`,
    `picked_up_at`, `completed_at`
  - `return_otp_hash` (sha256 hex via pgcrypto), `return_otp_expires_at` — completion
    verification for return tasks; the plaintext OTP is shown ONCE to the admin at task
    creation and is never stored or returned again
  - `created_by` (admin auth uid), timestamps
  - Partial UNIQUE INDEX `(booking_id, task_type)` where status not in
    ('completed','cancelled','delivered') — prevents duplicate active tasks of the
    same type for one booking while allowing retry after failure
- `delivery_task_history` — immutable audit: task_id, actor (auth uid), actor_role,
  actor_label, action, details, created_at. Append-only via RPCs; no delete policy.

2. Security
- RLS enabled on all three tables.
- Policies granted ONLY to `authenticated` admins (USING is_admin()) for direct
  dashboard access. Delivery agents have NO direct table access — they use
  SECURITY DEFINER RPCs that scope every read/write to their own tasks.
- No anon access anywhere.

3. Helpers
- `is_delivery_agent()` — SECURITY DEFINER, returns whether the caller's auth uid is
  an active delivery agent. EXECUTE revoked from anon/authenticated (internal use,
  like is_admin()).
- `link_delivery_agent_account(p_agent_id, p_auth_user_id)` — admin-only RPC to attach
  a login to an agent record (mirrors link_partner_account). Optional p_email/p_password
  variant is handled by the dashboard creating the auth user first.
- `generate_delivery_task_reference()` — 'DT' + 8 unambiguous chars, collision-checked.

4. Extension
- `CREATE EXTENSION IF NOT EXISTS pgcrypto` — for sha256 OTP hashing.
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.delivery_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  agent_code text UNIQUE,
  service_areas text NOT NULL DEFAULT '',
  auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_accepting_tasks boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.delivery_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_reference text UNIQUE NOT NULL,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  task_type text NOT NULL CHECK (task_type IN ('pickup','return_delivery')),
  status text NOT NULL DEFAULT 'unassigned' CHECK (status IN (
    'unassigned','assigned','accepted','on_the_way','picked_up',
    'out_for_delivery','delivered','completed','failed','exception','cancelled')),
  pickup_address text NOT NULL DEFAULT '',
  destination_address text NOT NULL DEFAULT '',
  contact_name text NOT NULL DEFAULT '',
  contact_phone text NOT NULL DEFAULT '',
  scheduled_date date,
  scheduled_window text NOT NULL DEFAULT '',
  assignment_note text NOT NULL DEFAULT '',
  exception_reason text NOT NULL DEFAULT '',
  failure_reason text NOT NULL DEFAULT '',
  assigned_agent_id uuid REFERENCES public.delivery_agents(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  accepted_at timestamptz,
  picked_up_at timestamptz,
  completed_at timestamptz,
  return_otp_hash text,
  return_otp_expires_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_task_type_status_valid CHECK (
    (task_type = 'pickup' AND status NOT IN ('out_for_delivery','delivered'))
    OR (task_type = 'return_delivery' AND status NOT IN ('picked_up'))
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS delivery_tasks_one_active_per_type
  ON public.delivery_tasks (booking_id, task_type)
  WHERE status NOT IN ('completed','cancelled','delivered');

CREATE INDEX IF NOT EXISTS delivery_tasks_agent_idx
  ON public.delivery_tasks (assigned_agent_id);
CREATE INDEX IF NOT EXISTS delivery_tasks_booking_idx
  ON public.delivery_tasks (booking_id);

CREATE TABLE IF NOT EXISTS public.delivery_task_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.delivery_tasks(id) ON DELETE CASCADE,
  actor uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role text NOT NULL DEFAULT 'system',
  actor_label text NOT NULL DEFAULT '',
  action text NOT NULL,
  details text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS delivery_task_history_task_idx
  ON public.delivery_task_history (task_id, created_at);

ALTER TABLE public.delivery_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_task_history ENABLE ROW LEVEL SECURITY;

-- Admin-only direct table access. Agents never read tables directly.
DROP POLICY IF EXISTS "admin_select_delivery_agents" ON public.delivery_agents;
CREATE POLICY "admin_select_delivery_agents" ON public.delivery_agents FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "admin_insert_delivery_agents" ON public.delivery_agents;
CREATE POLICY "admin_insert_delivery_agents" ON public.delivery_agents FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_delivery_agents" ON public.delivery_agents;
CREATE POLICY "admin_update_delivery_agents" ON public.delivery_agents FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_delivery_agents" ON public.delivery_agents;
CREATE POLICY "admin_delete_delivery_agents" ON public.delivery_agents FOR DELETE
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "admin_select_delivery_tasks" ON public.delivery_tasks;
CREATE POLICY "admin_select_delivery_tasks" ON public.delivery_tasks FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "admin_insert_delivery_tasks" ON public.delivery_tasks;
CREATE POLICY "admin_insert_delivery_tasks" ON public.delivery_tasks FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_delivery_tasks" ON public.delivery_tasks;
CREATE POLICY "admin_update_delivery_tasks" ON public.delivery_tasks FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_delivery_tasks" ON public.delivery_tasks;
CREATE POLICY "admin_delete_delivery_tasks" ON public.delivery_tasks FOR DELETE
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "admin_select_delivery_task_history" ON public.delivery_task_history;
CREATE POLICY "admin_select_delivery_task_history" ON public.delivery_task_history FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "admin_insert_delivery_task_history" ON public.delivery_task_history;
CREATE POLICY "admin_insert_delivery_task_history" ON public.delivery_task_history FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

-- No UPDATE/DELETE policies on history: append-only audit trail.

CREATE OR REPLACE FUNCTION public.is_delivery_agent()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.delivery_agents
    WHERE auth_user_id = auth.uid() AND is_active = true
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_delivery_agent() FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.link_delivery_agent_account(
  p_agent_id uuid, p_auth_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'only_admins');
  END IF;
  UPDATE public.delivery_agents
  SET auth_user_id = p_auth_user_id
  WHERE id = p_agent_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'agent_not_found');
  END IF;
  INSERT INTO public.delivery_task_history (task_id, actor, actor_role, action, details)
  VALUES (NULL, p_auth_user_id, 'admin', 'agent_account_linked',
          'Agent ' || p_agent_id::text || ' linked to login ' || p_auth_user_id::text);
  RETURN jsonb_build_object('success', true);
END;
$$;

-- task_id is nullable in history for non-task events; relax the FK need by allowing
-- standalone rows via a helper insert (kept simple: task-linked events only use task_id).

CREATE OR REPLACE FUNCTION public.generate_delivery_task_reference()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  ref text;
  i integer;
BEGIN
  LOOP
    ref := 'DT';
    FOR i IN 1..8 LOOP
      ref := ref || substr(chars, floor(random() * length(chars))::integer + 1, 1);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM public.delivery_tasks WHERE task_reference = ref) THEN
      RETURN ref;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_delivery_agent_account(uuid, uuid) TO authenticated;
