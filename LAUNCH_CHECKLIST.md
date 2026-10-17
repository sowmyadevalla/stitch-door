# StitchDoor — Launch & Pilot Checklist

## What was completed in this finalization phase

### Security & booking fixes (applied via database migrations)
- Guest order tracking now works. It goes through a secure database function that
  verifies the last 4 digits of the customer's phone server-side before returning
  any data.
- Guest booking no longer errors after saving. Booking + items + status history
  are written together in one all-or-nothing server function, so partial bookings
  and duplicate submissions from retry are prevented.
- Prices can no longer be tampered with. The server looks up service prices from
  the database; browser-sent prices are ignored.
- Customers can no longer edit admin-only fields (payment status, confirmed
  amount, admin notes, order status) on their own bookings. Cancellation is the
  only customer-side change, restricted to early-stage orders.
- Admin check function is no longer callable by the public.

### Email notifications
- Booking confirmation + admin notification emails implemented via Resend with a
  professional StitchDoor-branded template.
- Emails never block or break a booking: failures are logged internally.
- To activate: create a free Resend account (resend.com), verify your domain
  (e.g. stitchdoor.in) or use their onboarding sender for testing, and add the
  API key as the `RESEND_API_KEY` secret in the Supabase dashboard (Edge
  Functions > Secrets). Then update the FROM address inside the notification
  function to your verified domain.
- Until then, every booking logs "email skipped" internally — bookings are unaffected.

### Garment reference photos
- Customers can attach up to 5 photos (JPG/PNG/WebP, max 5 MB each) in the
  Garment Details step. Upload is optional and failures never block a booking.
- Photos are stored in a PRIVATE storage bucket. No public URLs. Views use
  short-lived signed access granted only after an authorization check
  (booking owner, guest tracking token, or admin).
- Admin sees photos in the booking detail popup.

### Customer accounts
- Login/signup already existed and is untouched; guests can still book and track.
- Added password reset ("Forgot Password" on the login page).
- Order history lives on the Account page, scoped by database security rules —
  customers can never see another customer's bookings.

### Payments
- Preserved as-is: customers pay at pickup/delivery. Admin records actual payment
  status manually. No gateway is active; nothing collects card details.
- To add a gateway later (Razorpay recommended in India): create the merchant
  account, add keys as server-side secrets, collect payment only after the admin
  confirms the final price, and record the result back on the booking. Do not
  activate until you approve and test it.

## Before you announce the pilot

1. Fill in real business details in Admin > Operations: WhatsApp number, contact
   email, service areas (PIN codes you will actually serve), pickup/delivery fee.
2. Confirm services + starting prices in Admin > Services. Only list services and
   areas you can genuinely fulfill.
3. Onboard tailoring partners in Admin > Operations (name, phone, locality).
4. Set your admin account email in your profile so admin notifications reach you.
5. Configure the Resend key (above) so bookings email you.
6. Test one real end-to-end booking yourself: book, track by reference + phone
   digits, cancel from the account page if needed, then process it as admin.
7. Publish from Bolt when ready. Publishing creates a new deployment of the
   frontend; it does not reset or overwrite database data. Your existing hosting
   (if you connected a domain earlier) stays in place unless you change it.

## Operational habits for the pilot

- Check the admin dashboard daily; new bookings pop up instantly with a toast +
  browser notification.
- Confirm price with the customer before moving a booking past
  "Awaiting Price Confirmation"; record it in "Confirmed Amount".
- Keep internal notes internal (the checkbox controls customer visibility).
- Reconcile payments manually: mark Paid only after cash/UPI is actually received.
- Photo/data handling: photos are private and visible only to you and the
  customer; delete a booking to delete its photos with it.

## Known limitations (honest list)

- Emails are skipped until RESEND_API_KEY is configured (bookings unaffected).
- Customer-side status-change emails for admins are wired but only fire if you
  call the notification function on status updates (currently it fires on new
  bookings from the booking form).
- Guest bookings are not linked to customer accounts; guests track via reference
  + phone digits, signed-in bookings appear in the account page automatically.
- No automated test suite in this repo; verification was done via live database
  function tests (booking creation, tracking with correct/wrong digits, missing
  references) and full build + type checks.
