import { Scissors, Truck, MapPin, Heart, Leaf, Users } from 'lucide-react';
import { Link } from '@/lib/router';

export function About() {
  return (
    <div className="animate-fade-in">
      <section className="bg-forest-50 py-12">
        <div className="mx-auto max-w-4xl px-4 text-center lg:px-8">
          <h1 className="mb-3 text-4xl font-semibold text-charcoal-900">About StitchDoor</h1>
          <p className="mx-auto max-w-2xl text-charcoal-500">
            Making clothing care simple, one doorstep at a time.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-16 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="overflow-hidden rounded-2xl shadow-card">
            <img src="https://images.pexels.com/photos/6461169/pexels-photo-6461169.jpeg?auto=compress&cs=tinysrgb&h=650&w=940" alt="Tailoring craftsmanship" className="h-full w-full object-cover" />
          </div>
          <div className="flex flex-col justify-center">
            <h2 className="mb-4 text-2xl font-semibold text-charcoal-900">Our Story</h2>
            <p className="mb-4 text-charcoal-600">
              StitchDoor was born from a simple observation: getting clothes altered or stitched in Hyderabad often means multiple trips to a tailor, waiting in queues, and coordinating around busy schedules.
            </p>
            <p className="mb-4 text-charcoal-600">
              We believe clothing care should be as convenient as ordering food or booking a ride. So we built a service that picks up your garments, coordinates with skilled local tailoring partners, and delivers them back to your door.
            </p>
            <p className="text-charcoal-600">
              We are an asset-light, coordination-first business. We do not own a factory — we connect customers, pickup logistics, independent tailoring partners, quality checks and delivery into one seamless experience.
            </p>
          </div>
        </div>

        <div className="mt-16">
          <h2 className="mb-8 text-center text-2xl font-semibold text-charcoal-900">Our Values</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { icon: Heart, title: 'Honesty First', desc: 'No fake reviews, no hidden charges, no inflated promises. We tell you what we can and cannot do.' },
              { icon: Leaf, title: 'Sustainable Choice', desc: 'Repairing and reusing clothes extends their life and reduces waste. Every alteration is a small win for the planet.' },
              { icon: Users, title: 'Local Partners', desc: 'We work with independent local tailors in Hyderabad, creating livelihoods while serving our community.' },
            ].map((item, i) => (
              <div key={i} className="card p-6 text-center hover:shadow-elevated transition-all">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-terracotta-50 text-terracotta-500">
                  <item.icon className="h-7 w-7" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-charcoal-800">{item.title}</h3>
                <p className="text-sm text-charcoal-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {[
            { icon: MapPin, title: 'Hyderabad-Based', desc: 'Currently serving selected areas of Hyderabad, Telangana.' },
            { icon: Scissors, title: 'Multiple Services', desc: 'Alterations, blouse stitching, repairs, saree transformation and upcycling.' },
            { icon: Truck, title: 'Doorstep Service', desc: 'We pick up and deliver — you never need to visit a tailor.' },
          ].map((item, i) => (
            <div key={i} className="flex gap-4 rounded-xl bg-forest-50 p-5">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-forest-100 text-forest-600">
                <item.icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-charcoal-800">{item.title}</h3>
                <p className="text-xs text-charcoal-500">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Link to="/contact" className="btn-secondary mr-3">Contact Us</Link>
          <Link to="/book" className="btn-primary">Book a Pickup</Link>
        </div>
      </section>
    </div>
  );
}
