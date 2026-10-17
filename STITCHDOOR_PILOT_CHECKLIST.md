# StitchDoor Pilot Checklist

Use this checklist in the days before pilot launch. Every item below was verified against
the live database and codebase during final end-to-end testing unless marked otherwise.

Status key: [ ] = not done, [x] = done, [-] = intentionally skipped/deferred.

---

## 1. Admin account verification

- [ ] Sign in as the admin email (the one in `admin_users`).
- [ ] Confirm the admin dashboard loads: open bookings, tailors, assignment panel all render.
- [ ] Confirm a non-admin account sees no admin link and gets `only_admins` errors if it
      calls admin functions directly (verified in tests: non-admin review of a tailor
      application is correctly rejected).
- [ ] Practice one assignment end-to-end from the admin panel (see section 7).

## 2. Business configuration (currently incomplete — launch blocker)

- [ ] Set real service prices: the price list is currently placeholder values. Verify every
      service price in the booking flow matches the real price card.
- [ ] Set real pickup/delivery fee: currently `0`. If you charge for delivery, set it —
      it is added to the subtotal automatically by `create_booking`.
- [ ] Set WhatsApp contact number: currently empty in `business_config`. Customers cannot
      reach you on WhatsApp until this is filled.
- [ ] Set contact email: currently empty in `business_config`.
- [ ] Double-check the minimum order amount, if any.
- [ ] Confirm opening hours and supported service areas match reality.

## 3. Supported PIN codes (service coverage)

- [ ] Confirm the list of supported PIN codes covers your real delivery area.
- [ ] Confirm unsupported PIN codes are rejected gracefully at booking with a clear message.
- [ ] Confirm the PIN code is shown to the customer at booking confirmation.

## 4. Tailor onboarding (currently zero tailoring_partners in DB — launch blocker)

- [ ] Create the real tailor partner records (name, PIN coverage, capabilities/services).
- [ ] Give each partner their login credentials or have them register; approve their
      applications from the admin dashboard (registration → admin approval flow is
      verified working, including duplicate-application rejection).
- [ ] Confirm each partner can sign in, see their dashboard, and see their assigned orders.
- [ ] Confirm each partner CANNOT see other partners' orders (verified: partner isolation
      is enforced — partners only see bookings assigned to them).

## 5. Email notification setup and verification (launch blocker)

- [ ] Create a Resend account and add a verified sending domain.
- [ ] Add `RESEND_API_KEY` as an Edge Function secret in the Supabase dashboard
      (Edge Functions → Secrets). No code change is needed; the functions read the secret
      at runtime.
- [ ] Send one real test: place a booking as a customer and confirm the admin notification
      email arrives; assign the booking and confirm the partner notification email arrives.
- [ ] Verify failure behavior is honest: without the key, booking still succeeds and the
      audit row records the skip (verified in testing — notifications never block bookings,
      but confirm this once with the key present too, e.g. wrong-key error visible).

## 6. Privacy and photo checks (verified working, re-verify after any changes)

- [x] Guest booking tracking returns only whitelisted fields (no admin notes, customer
      email, or internal IDs) — fixed and verified this session.
- [x] Photo uploads require ownership (session) or a valid tracking token; size, count,
      and file-type limits enforced server-side.
- [x] No partner policies on bookings/photos allow cross-partner reads.
- [ ] After launch config changes, spot-check a guest tracking link once with a real
      booking reference and correct/incorrect phone digits.

## 7. Booking-to-delivery rehearsal (supervised end-to-end, do this before pilot)

- [ ] Place a real booking as a customer (use the SD-TEST naming convention for anything
      you plan to delete afterwards; never delete production data).
- [ ] Admin sees it in the dashboard in real time (toast + browser notification).
- [ ] Admin assigns it to a partner; partner gets notified and accepts.
- [ ] Partner advances stages: picked_up → in_progress → ready → out_for_delivery →
      delivered (each step verifies stage transitions work in order).
- [ ] Customer sees status change on the tracking page throughout.
- [ ] Admin marks booking delivered; confirm final state on both dashboards.

## 7b. Delivery agent workflow (new — verified server-side this session; do the UI rehearsal)

- [ ] Add your first real delivery agent in Admin → Delivery → Delivery Team
      (name, phone, service areas), then use "Set up login" to create their
      email + temporary password.
- [ ] Agent signs in at /agent-login, lands on their Delivery Dashboard.
- [ ] Create a pickup task from a booking; assign it; agent accepts; agent advances
      on the way → collected → confirm handover. Booking auto-advances to
      "Picked Up" (only from price_confirmed/pickup_scheduled).
- [ ] Create a return-delivery task; a 6-digit customer code is shown ONCE to you at
      creation — share it with the customer by phone/WhatsApp. Assign, agent advances
      out for delivery (booking shows "Ready for Delivery" to the customer), agent
      enters the code at the door; booking becomes Delivered.
- [ ] Rehearse the exception paths: agent "Report Issue", admin "Flag issue" /
      "Mark failed" / reassign / "Return to unassigned" / cancel (reason required).
- [ ] Rehearse the lost-code path: a wrong code locks verification after 5 tries for
      15 minutes; reassigning the task refreshes the code window — agree your
      phone-support process for customers who lose the code.
- [ ] Agent email notification requires `RESEND_API_KEY` (section 5). Without it the
      assignment still succeeds and the dashboard states plainly that no email was sent.
- [ ] Confirm agents cannot see admin notes, prices, other agents' tasks, or bookings
      directly (verified in testing; spot-check once with a real agent account).

## 8. Outstanding issues and launch blockers

Blockers (must be done before pilot):
- Real service prices + delivery fee set (section 2).
- WhatsApp number and contact email set (section 2).
- At least one approved, signed-in tailor partner (section 4).
- `RESEND_API_KEY` configured and one real email verified (section 5).
- One supervised booking-to-delivery rehearsal completed (section 7).
- At least one real delivery agent created with a login; agent rehearsal done (section 7b).

Known limitations (acceptable for pilot, revisit after):
- Assignment is admin-controlled by design; there is no auto-assignment.
- Delivery dispatch is manual by design: no rider app tracking, no maps, no courier
  integrations. Tasks are coordinated by phone by the admin.
- Delivery fees are NOT invented: no delivery charge is created by the delivery
  workflow; keep using the existing configurable pickup/delivery fee and confirm
  real costs before charging.
- Offer expiry governs acceptance only — an already-accepted order stays accepted
  (verified correct behavior).
- Browser notifications for new bookings require the admin to have granted browser
  permission; they are best-effort on top of the in-app toast.
- Pre-existing lint warnings (`no-explicit-any`) in the admin dashboard code; build
  and typecheck pass regardless.

## 9. Data safety rules for the pilot

- Never delete production bookings or partner records.
- Test records use names/referrals prefixed `SD-TEST` and partner codes `SDTEST*`;
  delete only rows matching those prefixes.
- Do not publish/deploy to production or reset the database without explicit approval.
