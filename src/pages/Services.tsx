import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { useServices } from '@/lib/services';
import { ServiceCard } from '@/components/ServiceCard';
import { SERVICE_CATEGORIES } from '@/lib/constants';

export function Services() {
  const { services, loading } = useServices();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');

  const filtered = useMemo(() => {
    return services.filter((s) => {
      const matchCategory = category === 'All' || s.category === category;
      const matchSearch =
        !search ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.description.toLowerCase().includes(search.toLowerCase());
      return matchCategory && matchSearch;
    });
  }, [services, search, category]);

  return (
    <div className="animate-fade-in">
      <section className="bg-forest-50 py-12">
        <div className="mx-auto max-w-7xl px-4 text-center lg:px-8">
          <h1 className="mb-3 text-4xl font-semibold text-charcoal-900">Our Services</h1>
          <p className="mx-auto max-w-2xl text-charcoal-500">
            From simple alterations to complete clothing transformations. All prices are indicative estimates and subject to confirmation.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-400" />
            <input
              type="text"
              placeholder="Search services..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field pl-10"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {SERVICE_CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  category === cat
                    ? 'bg-forest-600 text-ivory-50'
                    : 'bg-ivory-200 text-charcoal-600 hover:bg-ivory-300'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
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
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-lg text-charcoal-500">No services found matching your search.</p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {filtered.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
