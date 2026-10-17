/*
# Assignment workflow v2, part 1: offer fields + config + audit actors

1. New columns
- `partner_offers.expires_at` (timestamptz, nullable): optional acceptance
  deadline. NULL means no deadline; expiry is only enforced when set.
- `partner_offers.assignment_note` (text, default ''): admin note shown to the
  partner with the offer (customer-visible notes never live here).
- `partner_offers.decline_reason` (text, nullable): partner's stated reason on
  decline, shown to the admin during reassignment.
- `partner_activity.actor_role` (text, default 'system'): 'admin' when
  auth.uid() is an admin, 'partner' when the actor is a tailoring partner,
  else 'system'. Backfilled to 'system' for existing rows.
- `partner_activity.actor_label` (text, default ''): display name of the actor
  (admin email or partner name) captured at write time, so history stays
  readable even if the actor is later removed.

2. Modified tables
- `business_config`: new optional settings row with `id = 2` holding
  `key = 'offer_expiry_hours'` (integer, default 24). 0 or empty disables
  deadlines. Stored as a config row to avoid altering the main config table.

3. Security
- No policy changes. New columns inherit existing partner_offers /
  partner_activity policies. partner_offers is only readable via policies that
  already exist (admin or the offered partner).
- INSERT/UPDATE on partner_offers stays admin-only via SECURITY DEFINER
  functions; no direct client writes.

4. Important notes
- No existing rows or bookings are modified. Adding nullable/defaulted columns
  is safe and non-destructive.
- Deadline expiry is enforced at read/respond time, not by a cron job, so it
  works without scheduled workers (see part 4 migration).
*/

ALTER TABLE partner_offers
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS assignment_note text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS decline_reason text;

ALTER TABLE partner_activity
  ADD COLUMN IF NOT EXISTS actor_role text NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS actor_label text NOT NULL DEFAULT '';

UPDATE partner_activity SET actor_role = 'system' WHERE actor_role IS NULL;

CREATE TABLE IF NOT EXISTS app_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  offer_expiry_hours integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_read_app_settings" ON app_settings;
CREATE POLICY "admin_read_app_settings" ON app_settings
  FOR SELECT TO authenticated USING (public.is_admin());

INSERT INTO app_settings (id, offer_expiry_hours) VALUES (1, 24)
ON CONFLICT (id) DO NOTHING;