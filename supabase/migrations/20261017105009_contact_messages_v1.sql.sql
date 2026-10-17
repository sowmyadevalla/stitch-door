/*
# Contact messages: store contact-form submissions

1. Plain-English explanation
- The "Send a Message" form on the Contact page previously did not save anything.
  This migration adds a `contact_messages` table so every submission is stored,
  and business admins can read and triage them from the admin dashboard.

2. New Tables
- `contact_messages`
  - `id` (uuid, primary key, auto-generated)
  - `name` (text, not null) — sender's name
  - `phone` (text, not null) — sender's phone number for follow-up
  - `message` (text, not null) — the message body
  - `status` (text, not null, default 'new') — 'new' or 'handled'; set by admins
  - `created_at` (timestamptz, default now())
  - `handled_at` (timestamptz, nullable) — when an admin marked it handled

3. Security
- RLS enabled on `contact_messages`.
- anon + authenticated can INSERT (anyone can send a message; length limits
  enforced via CHECK constraints to prevent abuse).
- Only admins (`public.is_admin()`, same pattern as the rest of the schema)
  can SELECT, UPDATE, or DELETE. No one can read messages without the admin
  session — visitors' contact details stay private.

4. Important notes
- No user_id: messages are sent by anonymous visitors by design.
- The table starts empty; the admin dashboard will show a "no messages" state.
*/

CREATE TABLE IF NOT EXISTS public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) <= 120),
  phone text NOT NULL CHECK (char_length(phone) <= 32),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 5000),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'handled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  handled_at timestamptz
);

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone_can_submit_contact_message" ON public.contact_messages;
CREATE POLICY "anyone_can_submit_contact_message"
ON public.contact_messages FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "admins_can_read_contact_messages" ON public.contact_messages;
CREATE POLICY "admins_can_read_contact_messages"
ON public.contact_messages FOR SELECT
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "admins_can_update_contact_messages" ON public.contact_messages;
CREATE POLICY "admins_can_update_contact_messages"
ON public.contact_messages FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admins_can_delete_contact_messages" ON public.contact_messages;
CREATE POLICY "admins_can_delete_contact_messages"
ON public.contact_messages FOR DELETE
TO authenticated
USING (public.is_admin());
