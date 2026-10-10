import { ArrowRight, Clock } from 'lucide-react';
import { Link } from '@/lib/router';
import { formatINR } from '@/lib/constants';
import type { Service } from '@/lib/types';

export function ServiceCard({ service }: { service: Service }) {
  return (
    <div className="card group overflow-hidden hover:shadow-elevated hover:-translate-y-1">
      <Link to={`/services/${service.slug}`}>
        <div className="relative aspect-[4/3] overflow-hidden">
          <img
            src={service.image_url}
            alt={service.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-forest-900/40 to-transparent" />
          <span className="absolute left-3 top-3 rounded-full bg-ivory-50/90 px-3 py-1 text-xs font-medium text-forest-700">
            {service.category}
          </span>
        </div>
      </Link>
      <div className="p-5">
        <Link to={`/services/${service.slug}`}>
          <h3 className="mb-1 text-lg font-semibold text-charcoal-800 group-hover:text-forest-700">
            {service.name}
          </h3>
        </Link>
        <p className="mb-3 line-clamp-2 text-sm text-charcoal-500">{service.description}</p>
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-semibold text-forest-700">
            {formatINR(service.starting_price)} onwards
          </span>
          {service.estimated_turnaround && (
            <span className="flex items-center gap-1 text-xs text-charcoal-400">
              <Clock className="h-3 w-3" />
              {service.estimated_turnaround}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Link to={`/book?service=${service.slug}`} className="btn-primary flex-1 text-xs">
            Book Now
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link to={`/services/${service.slug}`} className="btn-secondary text-xs">
            Details
          </Link>
        </div>
      </div>
    </div>
  );
}
