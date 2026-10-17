/*
# Partner workflow v1, part 1: tables + policies

1. New Tables
- tailor_applications: public tailor applications with status workflow
  (pending, under_review, more_info_required, approved, rejected), review notes,
  reviewer + timestamp, application reference.
- partner_offers: booking assignment offers to partners
  (pending, accepted, rejected, expired).
- partner_activity: audit log of important admin/partner actions.

2. Modified Tables
- tailoring_partners: adds auth_user_id (unique, links a Supabase Auth user),
  is_accepting_orders, partner_code. Existing rows untouched.

3. Security
- RLS enabled on all three new tables.
- Applications: SELECT for admins only (ID numbers stay private).
- Offers: SELECT for admins and the offered partner only.
- Audit log: SELECT for admins only.
- Partners: self-read on their own tailoring_partners row; read access to ONLY
  bookings/items/history assigned to them.
*/

ALTER TABLE public.tailoring_partners
  ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.tailoring_partners
  ADD COLUMN IF NOT EXISTS is_accepting_orders boolean NOT NULL DEFAULT true;
ALTER TABLE public.tailoring_partners
  ADD COLUMN IF NOT EXISTS partner_code text UNIQUE;

DROP POLICY IF EXISTS "partner_self_read" ON public.tailoring_partners;
CREATE POLICY "partner_self_read" ON public.tailoring_partners
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.tailor_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_reference text UNIQUE NOT NULL
    DEFAULT ('TA' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8))),
  full_name text NOT NULL,
  mobile text NOT NULL,
  email text NOT NULL DEFAULT '',
  locality text NOT NULL DEFAULT '',
  service_areas text NOT NULL DEFAULT '',
  experience_years text NOT NULL DEFAULT '',
  services_offered text NOT NULL DEFAULT '',
  equipment text NOT NULL DEFAULT '',
  expected_rates text NOT NULL DEFAULT '',
  portfolio_urls text NOT NULL DEFAULT '',
  verification_id_type text NOT NULL DEFAULT '',
  verification_id_number text NOT NULL DEFAULT '',
  notes_from_tailor text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  review_notes text NOT NULL DEFAULT '',
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tailor_applications ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.partner_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.tailoring_partners(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  offered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  offered_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (booking_id, partner_id)
);

ALTER TABLE public.partner_offers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.partner_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  details text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_applications" ON public.tailor_applications;
CREATE POLICY "admin_read_applications" ON public.tailor_applications
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "read_partner_offers" ON public.partner_offers;
CREATE POLICY "read_partner_offers" ON public.partner_offers
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.tailoring_partners tp
      WHERE tp.id = partner_offers.partner_id AND tp.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "admin_read_activity" ON public.partner_activity;
CREATE POLICY "admin_read_activity" ON public.partner_activity
  FOR SELECT TO authenticated USING (public.is_admin());

-- Partners read only their assigned bookings (and only while order is active)
DROP POLICY IF EXISTS "partner_read_assigned_bookings" ON public.bookings;
CREATE POLICY "partner_read_assigned_bookings" ON public.bookings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tailoring_partners tp
      WHERE tp.auth_user_id = auth.uid()
        AND tp.id = bookings.assigned_partner_id
        AND bookings.status IN ('price_confirmed','pickup_scheduled','picked_up','at_tailoring_partner','quality_check','ready_for_delivery')
    )
  );

DROP POLICY IF EXISTS "partner_read_booking_items" ON public.booking_items;
CREATE POLICY "partner_read_booking_items" ON public.booking_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.tailoring_partners tp ON tp.auth_user_id = auth.uid()
      WHERE b.id = booking_items.booking_id AND b.assigned_partner_id = tp.id
    )
  );

DROP POLICY IF EXISTS "partner_read_booking_history" ON public.booking_status_history;
CREATE POLICY "partner_read_booking_history" ON public.booking_status_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.tailoring_partners tp ON tp.auth_user_id = auth.uid()
      WHERE b.id = booking_status_history.booking_id AND b.assigned_partner_id = tp.id
    )
  );