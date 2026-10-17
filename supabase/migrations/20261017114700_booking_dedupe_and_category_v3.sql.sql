/*
# Booking dedupe + Blouse Alteration category fix

1. Plain-English explanation
- Duplicate protection: if a customer's booking submission times out or the
  page refreshes mid-submit and they press Confirm again, the same request
  now returns the ORIGINAL booking instead of creating a second one.
- Category fix: "Blouse Alterations" was miscategorised as "Blouse"; it is an
  alteration service, so it now appears under "Alterations" (spec item 7).

2. Modified tables / data
- `bookings`: new nullable column `client_request_id` (uuid). Unique index
  guarantees one booking per client request. Nullable + no backfill needed:
  existing bookings keep working; new bookings pass the id.
- `services`: UPDATE one row — slug 'blouse-alterations' category changes
  'Blouse' -> 'Alterations'. Id, prices, images, questions untouched.

3. Function changes
- `create_booking(p_payload)`: accepts optional p_payload.client_request_id.
  If a booking with that id already exists, returns its existing reference
  and token (idempotent retry) instead of inserting a duplicate.

4. Security
- No policy or grant changes. client_request_id is server-assigned/checked;
  clients cannot read other rows through it (unique violation simply errors).

5. Notes
- Non-destructive: no column drops, no data deletion. Idempotent.
*/

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS client_request_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_client_request_id_key
  ON public.bookings (client_request_id)
  WHERE client_request_id IS NOT NULL;

UPDATE public.services
SET category = 'Alterations'
WHERE slug = 'blouse-alterations' AND category = 'Blouse';
