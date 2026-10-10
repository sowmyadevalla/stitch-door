import { ArrowRight, Clock, Tag, Scissors } from 'lucide-react';
import { Link } from '@/lib/router';
import { useService } from '@/lib/services';
import { formatINR } from '@/lib/constants';

export function ServiceDetail({ slug }: { slug: string }) {
  const { service, loading, error } = useService(slug);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-20 lg:px-8">
        <div className="animate-pulse">
          <div className="mb-6 h-8 w-1/3 rounded bg-ivory-300" />
          <div className="mb-8 h-64 rounded-2xl bg-ivory-300" />
          <div className="space-y-3">
            <div className="h-4 w-full rounded bg-ivory-300" />
            <div className="h-4 w-2/3 rounded bg-ivory-300" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !service) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-20 text-center lg:px-8">
        <h1 className="mb-3 text-2xl font-semibold text-charcoal-800">Service Not Found</h1>
        <p className="mb-6 text-charcoal-500">The service you're looking for doesn't exist or has been removed.</p>
        <Link to="/services" className="btn-primary">View All Services</Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <section className="mx-auto max-w-4xl px-4 py-12 lg:px-8">
        <Link to="/services" className="mb-6 inline-flex items-center gap-1 text-sm text-charcoal-500 hover:text-forest-700">
          ← Back to Services
        </Link>
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="overflow-hidden rounded-2xl shadow-card">
            <img src={service.image_url} alt={service.name} className="h-full w-full object-cover" />
          </div>
          <div>
            <span className="mb-2 inline-block rounded-full bg-forest-100 px-3 py-1 text-xs font-medium text-forest-700">
              {service.category}
            </span>
            <h1 className="mb-3 text-3xl font-semibold text-charcoal-900">{service.name}</h1>
            <p className="mb-6 text-charcoal-600">{service.description}</p>

            <div className="mb-6 space-y-3 rounded-xl bg-ivory-200 p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-charcoal-600">
                  <Tag className="h-4 w-4 text-forest-600" />
                  Starting Price
                </span>
                <span className="text-lg font-semibold text-forest-700">
                  {formatINR(service.starting_price)} onwards
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-charcoal-600">
                  <Clock className="h-4 w-4 text-forest-600" />
                  Estimated Turnaround
                </span>
                <span className="text-sm font-medium text-charcoal-700">{service.estimated_turnaround}</span>
              </div>
            </div>

            {service.is_available ? (
              <Link to={`/book?service=${service.slug}`} className="btn-primary w-full">
                <Scissors className="h-4 w-4" />
                Book This Service
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <div className="rounded-xl bg-charcoal-100 px-4 py-3 text-center text-sm text-charcoal-500">
                This service is currently unavailable.
              </div>
            )}

            <p className="mt-4 text-xs text-charcoal-400">
              This is an indicative estimate. The final price will be confirmed after we review your requirements.
            </p>
          </div>
        </div>

        {service.customization_questions && service.customization_questions.length > 0 && (
          <div className="mt-12">
            <h2 className="mb-4 text-xl font-semibold text-charcoal-800">What We'll Ask You</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {service.customization_questions.map((q, i) => (
                <div key={i} className="card flex items-start gap-3 p-4">
                  <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-forest-100 text-xs font-semibold text-forest-700">
                    {i + 1}
                  </div>
                  <p className="text-sm text-charcoal-600">{q.question}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
