import { useBusinessConfig } from '@/lib/config';

export function Privacy() {
  const { config } = useBusinessConfig();

  return (
    <div className="animate-fade-in">
      <section className="bg-forest-50 py-12">
        <div className="mx-auto max-w-4xl px-4 text-center lg:px-8">
          <h1 className="mb-3 text-4xl font-semibold text-charcoal-900">Privacy Policy</h1>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-12 lg:px-8">
        <div className="prose prose-sm max-w-none text-charcoal-600">
          {config.privacy_policy_text ? (
            <div className="whitespace-pre-wrap">{config.privacy_policy_text}</div>
          ) : (
            <div className="space-y-4 text-sm leading-relaxed">
              <p>Last updated: {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>

              <h2 className="text-lg font-semibold text-charcoal-800">1. Information We Collect</h2>
              <p>When you book a service, we collect your name, mobile number, email (if provided), pickup address, locality, PIN code, and details about the garments and services you request. If you create an account, we also store your login credentials securely through our authentication provider.</p>

              <h2 className="text-lg font-semibold text-charcoal-800">2. How We Use Your Information</h2>
              <p>We use your information to process bookings, coordinate pickup and delivery, communicate with you about your order, confirm pricing, and improve our services. We do not sell your personal information to third parties.</p>

              <h2 className="text-lg font-semibold text-charcoal-800">3. Data Storage</h2>
              <p>Your data is stored securely in our database with row-level security policies that ensure you can only access your own booking information. Admin access is restricted to authorized personnel only.</p>

              <h2 className="text-lg font-semibold text-charcoal-800">4. Payment Information</h2>
              <p>We do not store card details or sensitive payment information. Payment status is recorded manually based on confirmed transactions. When a payment gateway is integrated, payment processing is handled by the gateway provider.</p>

              <h2 className="text-lg font-semibold text-charcoal-800">5. Booking References</h2>
              <p>Each booking is assigned a randomly generated reference code. We verify your identity using the last 4 digits of your phone number before showing booking details, to protect your information from unauthorized access.</p>

              <h2 className="text-lg font-semibold text-charcoal-800">6. Your Rights</h2>
              <p>You can request access to your data, correction of inaccurate information, or deletion of your account. Contact us using the details on our Contact page.</p>

              <h2 className="text-lg font-semibold text-charcoal-800">7. Third-Party Services</h2>
              <p>We use Supabase for database and authentication services. WhatsApp links direct you to WhatsApp's platform. These services have their own privacy policies.</p>

              <h2 className="text-lg font-semibold text-charcoal-800">8. Contact</h2>
              <p>For privacy-related questions, contact us at {config.contact_email || 'our contact email (to be configured)'}.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
