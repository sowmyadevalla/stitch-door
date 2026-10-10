import { useBusinessConfig } from '@/lib/config';

export function Terms() {
  const { config } = useBusinessConfig();

  return (
    <div className="animate-fade-in">
      <section className="bg-forest-50 py-12">
        <div className="mx-auto max-w-4xl px-4 text-center lg:px-8">
          <h1 className="mb-3 text-4xl font-semibold text-charcoal-900">Terms &amp; Conditions</h1>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-12 lg:px-8">
        <div className="space-y-4 text-sm leading-relaxed text-charcoal-600">
          {config.terms_text ? (
            <div className="whitespace-pre-wrap">{config.terms_text}</div>
          ) : (
            <>
              <p>Last updated: {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>

              <h2 className="text-lg font-semibold text-charcoal-800">1. Service Overview</h2>
              <p>StitchDoor is a doorstep clothing service that coordinates alterations, stitching, repairs and transformations. We act as a coordinator between customers, pickup/delivery, and independent local tailoring partners. We do not own a factory or directly employ tailors.</p>

              <h2 className="text-lg font-semibold text-charcoal-800">2. Pricing</h2>
              <p>All prices displayed on the website are indicative starting estimates. The final price is confirmed after reviewing your garments and requirements. No work begins until you approve the confirmed price. The confirmed amount is recorded as a snapshot and will not change due to later catalogue price updates.</p>

              <h2 className="text-lg font-semibold text-charcoal-800">3. Bookings</h2>
              <p>Submitting a booking request does not guarantee service availability. We confirm availability based on your location and our operational capacity. You can book as a guest or with an account. Each booking receives a unique reference code for tracking.</p>

              <h2 className="text-lg font-semibold text-charcoal-800">4. Pickup &amp; Delivery</h2>
              <p>Pickup and delivery are coordinated by StitchDoor. Preferred pickup dates and time windows are subject to availability. Turnaround times shown are estimates and depend on the service, workload, and location.</p>

              <h2 className="text-lg font-semibold text-charcoal-800">5. Cancellation Policy</h2>
              <p>{config.cancellation_policy}</p>

              <h2 className="text-lg font-semibold text-charcoal-800">6. Payment</h2>
              <p>Payment is collected after work is completed and delivered. We currently use manual payment confirmation. The payment method and status will be communicated to you. We do not store card details. A legitimate Indian payment provider may be integrated in the future.</p>

              <h2 className="text-lg font-semibold text-charcoal-800">7. Service Availability</h2>
              <p>{config.service_area_note} We expand to additional areas only when operations support it. If your PIN code is not currently serviceable, we will inform you.</p>

              <h2 className="text-lg font-semibold text-charcoal-800">8. Limitation of Liability</h2>
              <p>StitchDoor coordinates services with independent tailoring partners. While we strive for quality, we are not liable for outcomes beyond our control. Our liability is limited to the confirmed service amount. We are not liable for pre-existing garment conditions or issues not visible at pickup.</p>

              <h2 className="text-lg font-semibold text-charcoal-800">9. Account Security</h2>
              <p>You are responsible for maintaining the security of your account credentials. Do not share your password with others. We use secure authentication and never store passwords in plain text.</p>

              <h2 className="text-lg font-semibold text-charcoal-800">10. Changes to Terms</h2>
              <p>We may update these terms from time to time. Continued use of the service after changes constitutes acceptance of the updated terms.</p>

              <h2 className="text-lg font-semibold text-charcoal-800">11. Contact</h2>
              <p>For questions about these terms, contact us at {config.contact_email || 'our contact email (to be configured)'}.</p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
