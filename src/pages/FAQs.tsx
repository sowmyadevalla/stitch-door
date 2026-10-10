import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Link } from '@/lib/router';
import { useBusinessConfig } from '@/lib/config';

export function FAQs() {
  const { config } = useBusinessConfig();
  const [open, setOpen] = useState<number | null>(0);

  const faqs = [
    { q: 'How do I book a service?', a: 'Click "Book a Pickup", choose your service, fill in garment details and your address, and submit. You will receive a booking reference to track your order.' },
    { q: 'Do I need an account to book?', a: 'No. You can book as a guest. Creating an account is optional and lets you view your booking history and save details for future bookings.' },
    { q: 'How is the price determined?', a: 'The prices shown on the website are indicative starting estimates. After you submit your request, we review the work required and send you a confirmed price. Nothing starts until you approve it.' },
    { q: 'When do I pay?', a: 'Payment is collected after the work is completed and delivered. The payment method and status will be communicated to you. We currently use manual payment confirmation.' },
    { q: 'What areas do you serve?', a: config.service_area_note + ' You can check if your PIN code is serviceable during the booking process. If we do not currently serve your area, we will let you know.' },
    { q: 'How long does the work take?', a: 'Turnaround time depends on the service and workload. Estimated ranges are shown on each service page. These are estimates, not guaranteed timelines.' },
    { q: 'What is your cancellation policy?', a: config.cancellation_policy },
    { q: 'How do I track my order?', a: 'Use the "Track Order" page and enter your booking reference along with the last 4 digits of your phone number for verification. You will see a status timeline and all updates.' },
    { q: 'Can I get multiple services in one booking?', a: 'Yes. You can add multiple services to a single booking request. Each service can have its own quantity and garment notes.' },
    { q: 'Do you pick up and deliver?', a: 'Yes. We coordinate doorstep pickup and delivery so you never need to visit a tailor. Pickup and delivery charges, if any, are shown in your price summary.' },
  ];

  return (
    <div className="animate-fade-in">
      <section className="bg-forest-50 py-12">
        <div className="mx-auto max-w-4xl px-4 text-center lg:px-8">
          <h1 className="mb-3 text-4xl font-semibold text-charcoal-900">Frequently Asked Questions</h1>
          <p className="text-charcoal-500">Everything you need to know about StitchDoor.</p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-12 lg:px-8">
        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <div key={i} className="card overflow-hidden">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full items-center justify-between gap-4 p-5 text-left"
              >
                <span className="text-sm font-semibold text-charcoal-800">{faq.q}</span>
                <ChevronDown className={`h-5 w-5 flex-shrink-0 text-charcoal-400 transition-transform ${open === i ? 'rotate-180' : ''}`} />
              </button>
              {open === i && (
                <div className="animate-fade-in px-5 pb-5 text-sm leading-relaxed text-charcoal-600">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-xl bg-forest-50 p-6 text-center">
          <p className="mb-3 text-charcoal-600">Still have questions?</p>
          <Link to="/contact" className="btn-primary">Contact Us</Link>
        </div>
      </section>
    </div>
  );
}
