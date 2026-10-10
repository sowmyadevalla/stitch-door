/*
# StitchDoor — Tables & Functions (v1, Part 1)

Creates all tables and the is_admin() + booking reference helper functions.

1. New Tables
- admin_profiles, business_config, serviceable_areas, tailoring_partners, services, bookings, booking_items, booking_status_history
2. Functions
- is_admin(): SECURITY DEFINER, checks admin_profiles for current user
- generate_booking_reference(): generates unique SD-prefixed 8-char reference
3. No RLS policies yet (next migration)
*/

CREATE TABLE IF NOT EXISTS public.admin_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_admin boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.business_config (
  id integer PRIMARY KEY DEFAULT 1,
  brand_name text NOT NULL DEFAULT 'StitchDoor',
  tagline text NOT NULL DEFAULT 'Tailoring, without the trip.',
  whatsapp_number text NOT NULL DEFAULT '',
  contact_email text NOT NULL DEFAULT '',
  business_hours text NOT NULL DEFAULT 'Mon–Sat, 9 AM – 7 PM',
  pickup_delivery_fee numeric NOT NULL DEFAULT 0,
  free_delivery_threshold numeric,
  cancellation_policy text NOT NULL DEFAULT 'Free cancellation before pickup. After pickup, charges may apply based on work completed.',
  privacy_policy_text text NOT NULL DEFAULT '',
  terms_text text NOT NULL DEFAULT '',
  facebook_url text NOT NULL DEFAULT '',
  instagram_url text NOT NULL DEFAULT '',
  twitter_url text NOT NULL DEFAULT '',
  service_area_note text NOT NULL DEFAULT 'Launching in selected areas of Hyderabad.',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS public.serviceable_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_code text NOT NULL,
  locality text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tailoring_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  locality text NOT NULL DEFAULT '',
  specialties text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  description text NOT NULL DEFAULT '',
  image_url text NOT NULL DEFAULT '',
  starting_price numeric NOT NULL DEFAULT 0,
  estimated_turnaround text NOT NULL DEFAULT '',
  is_available boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  customization_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_reference text UNIQUE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_email text NOT NULL DEFAULT '',
  pickup_address text NOT NULL,
  locality text NOT NULL DEFAULT '',
  pin_code text NOT NULL,
  preferred_pickup_date date,
  preferred_pickup_window text NOT NULL DEFAULT '',
  additional_instructions text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'request_received',
  estimated_total numeric NOT NULL DEFAULT 0,
  confirmed_amount numeric,
  pickup_delivery_fee numeric NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'pending',
  payment_method text NOT NULL DEFAULT 'manual',
  assigned_partner_id uuid REFERENCES public.tailoring_partners(id) ON DELETE SET NULL,
  admin_notes text NOT NULL DEFAULT '',
  cancellation_reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.booking_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  service_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  garment_notes text NOT NULL DEFAULT '',
  unit_price numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.booking_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  status text NOT NULL,
  note text NOT NULL DEFAULT '',
  is_internal boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bookings_reference ON public.bookings(booking_reference);
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON public.bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON public.bookings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_booking_items_booking_id ON public.booking_items(booking_id);
CREATE INDEX IF NOT EXISTS idx_status_history_booking_id ON public.booking_status_history(booking_id);

-- Enable RLS on all tables
ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.serviceable_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tailoring_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_status_history ENABLE ROW LEVEL SECURITY;

-- Default config row
INSERT INTO public.business_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- is_admin function
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_profiles
    WHERE id = auth.uid() AND is_admin = true
  );
$$;

-- generate_booking_reference function
CREATE OR REPLACE FUNCTION public.generate_booking_reference()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  ref text;
  i integer;
BEGIN
  LOOP
    ref := 'SD';
    FOR i IN 1..8 LOOP
      ref := ref || substr(chars, floor(random() * length(chars))::integer + 1, 1);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM public.bookings WHERE booking_reference = ref) THEN
      RETURN ref;
    END IF;
  END LOOP;
END;
$$;
