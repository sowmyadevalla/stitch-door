/*
# StitchDoor — RLS Policies (v1, Part 2)

Applies row-level security policies to all tables.

1. admin_profiles: self-read + admin full access
2. business_config: public read, admin update
3. serviceable_areas: public read, admin CRUD
4. tailoring_partners: admin CRUD only
5. services: public read, admin CRUD
6. bookings: public insert, owner+admin read, owner+admin update, admin delete
7. booking_items: owner+admin read, public insert, admin update/delete
8. booking_status_history: owner (non-internal) + admin read, admin insert
*/

-- admin_profiles
DROP POLICY IF EXISTS "admin_read_admin_profiles" ON public.admin_profiles;
CREATE POLICY "admin_read_admin_profiles" ON public.admin_profiles
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "admin_insert_admin_profiles" ON public.admin_profiles;
CREATE POLICY "admin_insert_admin_profiles" ON public.admin_profiles
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_admin_profiles" ON public.admin_profiles;
CREATE POLICY "admin_update_admin_profiles" ON public.admin_profiles
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_admin_profiles" ON public.admin_profiles;
CREATE POLICY "admin_delete_admin_profiles" ON public.admin_profiles
  FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "self_read_admin_profile" ON public.admin_profiles;
CREATE POLICY "self_read_admin_profile" ON public.admin_profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

-- business_config
DROP POLICY IF EXISTS "public_read_business_config" ON public.business_config;
CREATE POLICY "public_read_business_config" ON public.business_config
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_update_business_config" ON public.business_config;
CREATE POLICY "admin_update_business_config" ON public.business_config
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- serviceable_areas
DROP POLICY IF EXISTS "public_read_serviceable_areas" ON public.serviceable_areas;
CREATE POLICY "public_read_serviceable_areas" ON public.serviceable_areas
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_serviceable_areas" ON public.serviceable_areas;
CREATE POLICY "admin_insert_serviceable_areas" ON public.serviceable_areas
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_serviceable_areas" ON public.serviceable_areas;
CREATE POLICY "admin_update_serviceable_areas" ON public.serviceable_areas
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_serviceable_areas" ON public.serviceable_areas;
CREATE POLICY "admin_delete_serviceable_areas" ON public.serviceable_areas
  FOR DELETE TO authenticated USING (public.is_admin());

-- tailoring_partners
DROP POLICY IF EXISTS "admin_read_partners" ON public.tailoring_partners;
CREATE POLICY "admin_read_partners" ON public.tailoring_partners
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "admin_insert_partners" ON public.tailoring_partners;
CREATE POLICY "admin_insert_partners" ON public.tailoring_partners
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_partners" ON public.tailoring_partners;
CREATE POLICY "admin_update_partners" ON public.tailoring_partners
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_partners" ON public.tailoring_partners;
CREATE POLICY "admin_delete_partners" ON public.tailoring_partners
  FOR DELETE TO authenticated USING (public.is_admin());

-- services
DROP POLICY IF EXISTS "public_read_services" ON public.services;
CREATE POLICY "public_read_services" ON public.services
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_services" ON public.services;
CREATE POLICY "admin_insert_services" ON public.services
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_services" ON public.services;
CREATE POLICY "admin_update_services" ON public.services
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_services" ON public.services;
CREATE POLICY "admin_delete_services" ON public.services
  FOR DELETE TO authenticated USING (public.is_admin());

-- bookings
DROP POLICY IF EXISTS "public_insert_bookings" ON public.bookings;
CREATE POLICY "public_insert_bookings" ON public.bookings
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "read_bookings" ON public.bookings;
CREATE POLICY "read_bookings" ON public.bookings
  FOR SELECT TO anon, authenticated
  USING (
    public.is_admin()
    OR (auth.uid() IS NOT NULL AND auth.uid() = user_id)
  );

DROP POLICY IF EXISTS "update_bookings" ON public.bookings;
CREATE POLICY "update_bookings" ON public.bookings
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR auth.uid() = user_id
  )
  WITH CHECK (
    public.is_admin()
    OR auth.uid() = user_id
  );

DROP POLICY IF EXISTS "admin_delete_bookings" ON public.bookings;
CREATE POLICY "admin_delete_bookings" ON public.bookings
  FOR DELETE TO authenticated USING (public.is_admin());

-- booking_items
DROP POLICY IF EXISTS "read_booking_items" ON public.booking_items;
CREATE POLICY "read_booking_items" ON public.booking_items
  FOR SELECT TO anon, authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id
      AND b.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_booking_items" ON public.booking_items;
CREATE POLICY "insert_booking_items" ON public.booking_items
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "admin_update_booking_items" ON public.booking_items;
CREATE POLICY "admin_update_booking_items" ON public.booking_items
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_booking_items" ON public.booking_items;
CREATE POLICY "admin_delete_booking_items" ON public.booking_items
  FOR DELETE TO authenticated USING (public.is_admin());

-- booking_status_history
DROP POLICY IF EXISTS "read_status_history" ON public.booking_status_history;
CREATE POLICY "read_status_history" ON public.booking_status_history
  FOR SELECT TO anon, authenticated
  USING (
    public.is_admin()
    OR (
      NOT is_internal
      AND EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.id = booking_id
        AND b.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "admin_insert_status_history" ON public.booking_status_history;
CREATE POLICY "admin_insert_status_history" ON public.booking_status_history
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
