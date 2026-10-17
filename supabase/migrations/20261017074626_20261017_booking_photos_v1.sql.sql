/*
# Booking garment reference photos (private storage)

1. New Tables
- `booking_photos` — metadata for garment reference photos attached to a booking.
  Columns: id, booking_id (FK bookings, cascade), storage_path (path in the
  private `booking-photos` bucket), original_name, file_size, uploaded_by
  (nullable auth.users FK), created_at.

2. Storage
- Creates the PRIVATE storage bucket `booking-photos` (idempotent).
- No public access: reads/writes go through signed URLs minted by the
  `booking-photo-access` Edge Function after authorization checks, or via
  service role for admins.

3. Security
- RLS enabled on booking_photos.
- SELECT: admin or booking owner.
- INSERT: anon + authenticated, WITH CHECK enforces 5 MB max size, image
  extension (jpg/jpeg/png/webp), and path under the booking's own folder.
- UPDATE/DELETE: admin only.
- Trigger `trg_validate_booking_photo` blocks signed-in users from attaching
  photos to bookings they do not own.
*/

CREATE TABLE IF NOT EXISTS public.booking_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  original_name text NOT NULL DEFAULT '',
  file_size integer NOT NULL DEFAULT 0,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.booking_photos ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public)
VALUES ('booking-photos', 'booking-photos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "select_booking_photos" ON public.booking_photos;
CREATE POLICY "select_booking_photos" ON public.booking_photos
  FOR SELECT TO anon, authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_photos.booking_id AND b.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_booking_photos" ON public.booking_photos;
CREATE POLICY "insert_booking_photos" ON public.booking_photos
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    file_size <= 5242880
    AND lower(storage_path) ~ '\.(jpg|jpeg|png|webp)$'
    AND storage_path LIKE booking_id::text || '/%'
  );

DROP POLICY IF EXISTS "admin_update_booking_photos" ON public.booking_photos;
CREATE POLICY "admin_update_booking_photos" ON public.booking_photos
  FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_booking_photos" ON public.booking_photos;
CREATE POLICY "admin_delete_booking_photos" ON public.booking_photos
  FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.validate_booking_photo_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b_user_id uuid;
BEGIN
  SELECT user_id INTO b_user_id FROM bookings WHERE id = NEW.booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;
  IF auth.uid() IS NOT NULL AND (b_user_id IS NULL OR b_user_id <> auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized for this booking';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_booking_photo ON public.booking_photos;
CREATE TRIGGER trg_validate_booking_photo
BEFORE INSERT ON public.booking_photos
FOR EACH ROW EXECUTE FUNCTION public.validate_booking_photo_insert();