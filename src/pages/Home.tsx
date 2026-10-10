import { Scissors, Truck, CheckCircle, Sparkles, ArrowRight, MapPin, Phone } from 'lucide-react';
import { Link } from '@/lib/router';
import { useServices } from '@/lib/services';
import { ServiceCard } from '@/components/ServiceCard';
import { useBusinessConfig } from '@/lib/config';

const galleryItems = [
  { image: 'https://images.pexels.com/photos/8751525/pexels-photo-8751525.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', title: 'Saree to Dress', desc: 'Transform an old saree into a stylish dress' },
  { image: 'https://images.pexels.com/photos/2517865/pexels-photo-2517865.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', title: 'Repurposed Garments', desc: 'Give old clothes a fresh new look' },
  { image: 'https://images.pexels.com/photos/3778061/pexels-photo-3778061.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', title: 'Fabric Scraps to Accessories', desc: 'Turn fabric pieces into bags and accessories' },
  { image: 'https://images.pexels.com/photos/15937625/pexels-photo-15937625.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', title: 'Denim Repair & Restyle', desc: 'Repair or restyle worn-out jeans' },
];

export function Home() {
  const { services, loading } = useServices();
  const { config } = useBusinessConfig();

  return (
    <div className="animate-fade-in">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-ivory-100 via-ivory-200 to-forest-50" />
        <div className="relative mx-auto max-w-7xl px-4 py-16 lg:px-8 lg:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="animate-fade-up">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-forest-100 px-4 py-1.5 text-xs font-medium text-forest-700">
                <MapPin className="h-3.5 w-3.5" />
                {config.service_area_note}
              </div>
              <h1 className="mb-4 text-4xl font-semibold leading-tight text-charcoal-900 lg:text-5xl">
                Your Favourite Clothes,{' '}
                <span className="text-forest-600">Perfectly Fitted.</span>
              </h1>
              <p className="mb-8 max-w-lg text-lg leading-relaxed text-charcoal-600">
                Book alterations, stitching and clothing transformations from home. We coordinate the service and bring your clothes back to your doorstep.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link to="/book" className="btn-primary">
                  <Scissors className="h-4 w-4" />
                  Book a Pickup
                </Link>
                <Link to="/services" className="btn-secondary">
                  Explore Services
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
            <div className="animate-fade-up relative" style={{ animationDelay: '0.15s' }}>
              <div className="relative overflow-hidden rounded-3xl shadow-elevated">
                <img
                  src="https://images.pexels.com/photos/6766240/pexels-photo-6766240.jpeg?auto=compress&cs=tinysrgb&h=750&w=940"
                  alt="Tailor adjusting a client's garment for the perfect fit"
                  className="h-[420px] w-full object-cover lg:h-[520px]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-forest-900/30 to-transparent" />
              </div>
              <div className="absolute -bottom-4 -left-4 hidden rounded-2xl bg-ivory-50 p-4 shadow-card sm:block">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-forest-100">
                    <Truck className="h-6 w-6 text-forest-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-charcoal-800">Doorstep Pickup</p>
                    <p className="text-xs text-charcoal-500">& Delivery</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Service Categories */}
      <section className="mx-auto max-w-7xl px-4 py-16 lg:px-8">
        <div className="mb-10 text-center">
          <h2 className="mb-3 text-3xl font-semibold text-charcoal-900">Our Services</h2>
          <p className="text-charcoal-500">Multiple clothing services, one convenient pickup.</p>
        </div>
        {loading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="animate-pulse rounded-2xl bg-ivory-200 p-4">
                <div className="mb-4 h-40 rounded-xl bg-ivory-300" />
                <div className="mb-2 h-5 rounded bg-ivory-300" />
                <div className="mb-3 h-4 rounded bg-ivory-300 w-2/3" />
                <div className="h-10 rounded-full bg-ivory-300" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {services.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>
        )}
        <p className="mt-6 text-center text-xs text-charcoal-400">
          Prices shown are indicative starting estimates and subject to confirmation based on your requirements.
        </p>
      </section>

      {/* How It Works */}
      <section className="bg-forest-50 py-16">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <div className="mb-10 text-center">
            <h2 className="mb-3 text-3xl font-semibold text-charcoal-900">How It Works</h2>
            <p className="text-charcoal-500">Four simple steps from request to delivery.</p>
          </div>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Scissors, step: '01', title: 'Choose Your Service', desc: 'Pick from alterations, stitching, repairs or transformations.' },
              { icon: Truck, step: '02', title: 'Submit Your Request', desc: 'Tell us what you need and when to pick up.' },
              { icon: CheckCircle, step: '03', title: 'We Confirm the Price', desc: 'Get a clear price and pickup details before work begins.' },
              { icon: Sparkles, step: '04', title: 'Doorstep Delivery', desc: 'Your tailoring partner completes the work — we deliver it back.' },
            ].map((item, i) => (
              <div key={i} className="card group p-6 text-center hover:shadow-elevated">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-forest-100 text-forest-600 transition-colors group-hover:bg-forest-600 group-hover:text-ivory-50">
                  <item.icon className="h-7 w-7" />
                </div>
                <span className="text-xs font-semibold text-terracotta-400">{item.step}</span>
                <h3 className="mb-2 text-lg font-semibold text-charcoal-800">{item.title}</h3>
                <p className="text-sm text-charcoal-500">{item.desc}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-charcoal-400">
            Pickup, delivery, turnaround time and final pricing depend on location and service availability.
          </p>
        </div>
      </section>

      {/* Gallery */}
      <section className="mx-auto max-w-7xl px-4 py-16 lg:px-8">
        <div className="mb-10 text-center">
          <h2 className="mb-3 text-3xl font-semibold text-charcoal-900">Clothing Transformation Gallery</h2>
          <p className="text-charcoal-500">Inspiration for giving your clothes a second life.</p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {galleryItems.map((item, i) => (
            <div key={i} className="card group overflow-hidden hover:shadow-elevated hover:-translate-y-1">
              <div className="relative aspect-square overflow-hidden">
                <img src={item.image} alt={item.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-forest-900/60 to-transparent" />
                <div className="absolute bottom-0 p-4 text-ivory-50">
                  <h3 className="text-sm font-semibold">{item.title}</h3>
                  <p className="text-xs text-ivory-200">{item.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-xs text-charcoal-400">
          These are illustrative concepts for inspiration, not completed StitchDoor customer work.
        </p>
        <div className="mt-6 text-center">
          <Link to="/gallery" className="btn-secondary">
            View Full Gallery
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Why StitchDoor */}
      <section className="bg-ivory-200 py-16">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <div className="mb-10 text-center">
            <h2 className="mb-3 text-3xl font-semibold text-charcoal-900">Why StitchDoor?</h2>
            <p className="text-charcoal-500">Genuine service benefits, no gimmicks.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: Truck, title: 'Convenient Doorstep Coordination', desc: 'No tailor visits required. We handle pickup and delivery.' },
              { icon: CheckCircle, title: 'Clear Pricing Before Work Begins', desc: 'You approve the confirmed price before any tailoring starts.' },
              { icon: Scissors, title: 'Multiple Services in One Place', desc: 'Alterations, stitching, repairs and transformations together.' },
              { icon: Sparkles, title: 'Repair & Reuse Options', desc: 'Extend the life of clothes you already love.' },
              { icon: Phone, title: 'Order-Status Updates', desc: 'Track your booking from request to delivery.' },
              { icon: MapPin, title: 'A Human Contact for Questions', desc: 'Reach us on WhatsApp whenever you need help.' },
            ].map((item, i) => (
              <div key={i} className="card flex gap-4 p-6 hover:shadow-elevated">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-terracotta-50 text-terracotta-500">
                  <item.icon className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="mb-1 text-base font-semibold text-charcoal-800">{item.title}</h3>
                  <p className="text-sm text-charcoal-500">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-5xl px-4 py-20 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-forest-700 px-8 py-16 text-center shadow-elevated lg:px-16">
          <div className="absolute inset-0 bg-gradient-to-br from-forest-600 to-forest-800" />
          <div className="relative">
            <h2 className="mb-4 text-3xl font-semibold text-ivory-50 lg:text-4xl">
              Give Your Clothes a Second Life.
            </h2>
            <p className="mb-8 text-ivory-200">
              From everyday alterations to creative transformations — we make clothing care simple.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/book" className="btn-accent">
                <Scissors className="h-4 w-4" />
                Book a Service
              </Link>
              {config.whatsapp_number && (
                <a
                  href={`https://wa.me/${config.whatsapp_number.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn bg-ivory-50 text-forest-700 hover:bg-ivory-200"
                >
                  Ask Us on WhatsApp
                </a>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
