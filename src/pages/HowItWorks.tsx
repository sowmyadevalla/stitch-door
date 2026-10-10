import { Scissors, Truck, CheckCircle, Sparkles, ClipboardList, Package, ShieldCheck } from 'lucide-react';
import { Link } from '@/lib/router';

export function HowItWorks() {
  const steps = [
    { icon: Scissors, title: 'Choose Your Service', desc: 'Browse our catalogue and select the service — or services — you need. From simple hemming to saree-to-outfit transformations, pick what suits your garments.' },
    { icon: ClipboardList, title: 'Submit Your Pickup Request', desc: 'Fill in garment details, your address, and a preferred pickup time. No account needed — guest bookings are welcome.' },
    { icon: CheckCircle, title: 'We Confirm the Price', desc: 'We review your request and send you a confirmed price. Nothing starts until you approve it. No hidden charges, no surprises.' },
    { icon: Truck, title: 'Doorstep Pickup', desc: 'Our team picks up your garments at the scheduled time. You receive a booking reference to track progress.' },
    { icon: Package, title: 'Tailoring & Quality Check', desc: 'Your garments go to a local tailoring partner. Once work is done, a quality check ensures everything meets our standards.' },
    { icon: Sparkles, title: 'Delivered to Your Door', desc: 'We coordinate delivery back to your doorstep. You pay as per the confirmed amount — nothing more.' },
  ];

  return (
    <div className="animate-fade-in">
      <section className="bg-forest-50 py-12">
        <div className="mx-auto max-w-4xl px-4 text-center lg:px-8">
          <h1 className="mb-3 text-4xl font-semibold text-charcoal-900">How It Works</h1>
          <p className="mx-auto max-w-2xl text-charcoal-500">
            From request to doorstep delivery in six simple steps. No tailor visits, no hassle.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-16 lg:px-8">
        <div className="space-y-6">
          {steps.map((step, i) => (
            <div key={i} className="card flex gap-6 p-6 hover:shadow-elevated transition-all">
              <div className="flex-shrink-0">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-forest-100 text-forest-600">
                  <step.icon className="h-7 w-7" />
                </div>
              </div>
              <div className="flex-1">
                <div className="mb-1 flex items-center gap-3">
                  <span className="text-xs font-bold text-terracotta-400">STEP {String(i + 1).padStart(2, '0')}</span>
                </div>
                <h2 className="mb-2 text-lg font-semibold text-charcoal-800">{step.title}</h2>
                <p className="text-sm leading-relaxed text-charcoal-600">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-2xl bg-ivory-200 p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-charcoal-800">
            <ShieldCheck className="h-5 w-5 text-forest-600" />
            What You Should Know
          </h2>
          <ul className="space-y-2 text-sm text-charcoal-600">
            <li>• Pickup, delivery, turnaround time and final pricing depend on your location and service availability.</li>
            <li>• Price estimates shown on the website are indicative — the final amount is confirmed before any work begins.</li>
            <li>• You can cancel free of charge before pickup. After pickup, charges may apply based on work completed.</li>
            <li>• We currently serve selected areas of Hyderabad and will expand as operations support it.</li>
          </ul>
        </div>

        <div className="mt-10 text-center">
          <Link to="/book" className="btn-primary">
            <Scissors className="h-4 w-4" />
            Book a Pickup
          </Link>
        </div>
      </section>
    </div>
  );
}
