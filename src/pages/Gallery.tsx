import { useState, useEffect } from 'react';
import { Sparkles, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from '@/lib/router';

interface GalleryItem {
  image: string;
  title: string;
  desc: string;
  category: string;
}

const galleryItems: GalleryItem[] = [
  { image: 'https://images.pexels.com/photos/8751525/pexels-photo-8751525.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', title: 'Saree to Dress', desc: 'Transform an old silk saree into an elegant dress for everyday wear.', category: 'Upcycling' },
  { image: 'https://images.pexels.com/photos/2517865/pexels-photo-2517865.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', title: 'Repurposed Garments', desc: 'Restyle old kurtis and dresses into fresh, modern silhouettes.', category: 'Upcycling' },
  { image: 'https://images.pexels.com/photos/3778061/pexels-photo-3778061.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', title: 'Fabric Scraps to Accessories', desc: 'Turn fabric remnants into tote bags, pouches and hair accessories.', category: 'Upcycling' },
  { image: 'https://images.pexels.com/photos/15937625/pexels-photo-15937625.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', title: 'Denim Repair & Restyle', desc: 'Repair torn denim or restyle old jeans into shorts, skirts or bags.', category: 'Repairs' },
  { image: 'https://images.pexels.com/photos/38826113/pexels-photo-38826113.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', title: 'Saree to Lehenga', desc: 'Convert a cherished saree into a lehenga set with matching dupatta.', category: 'Custom Stitching' },
  { image: 'https://images.pexels.com/photos/11496275/pexels-photo-11496275.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', title: 'Patchwork from Scraps', desc: 'Combine fabric scraps into patchwork cushions, runners or quilts.', category: 'Upcycling' },
  { image: 'https://images.pexels.com/photos/5355645/pexels-photo-5355645.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', title: 'Fabric Bags', desc: 'Stitch reusable fabric bags from old curtains, bedsheets or garments.', category: 'Custom Stitching' },
  { image: 'https://images.pexels.com/photos/11004381/pexels-photo-11004381.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', title: 'Custom Restyling', desc: 'Bring your own idea — we will help you bring it to life.', category: 'Custom Stitching' },
];

const CATEGORIES = ['All', 'Alterations', 'Repairs', 'Custom Stitching', 'Upcycling'];

export function Gallery() {
  const [filter, setFilter] = useState('All');
  const [lightbox, setLightbox] = useState<number | null>(null);

  const visible = galleryItems.filter((i) => filter === 'All' || i.category === filter);

  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
      if (e.key === 'ArrowRight') setLightbox((i) => (i === null ? null : (i + 1) % visible.length));
      if (e.key === 'ArrowLeft') setLightbox((i) => (i === null ? null : (i - 1 + visible.length) % visible.length));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, visible.length]);

  return (
    <div className="animate-fade-in">
      <section className="bg-forest-50 py-12">
        <div className="mx-auto max-w-4xl px-4 text-center lg:px-8">
          <h1 className="mb-3 text-4xl font-semibold text-charcoal-900">Transformation Gallery</h1>
          <p className="mx-auto max-w-2xl text-charcoal-500">
            Inspiration for giving your clothes a second life.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
        {/* Filters */}
        <div className="mb-8 flex flex-wrap justify-center gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              aria-pressed={filter === c}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                filter === c
                  ? 'bg-forest-700 text-ivory-50'
                  : 'bg-ivory-200 text-charcoal-600 hover:bg-ivory-300'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <div className="card mx-auto max-w-md p-10 text-center">
            <Sparkles className="mx-auto mb-3 h-8 w-8 text-forest-400" />
            <p className="text-charcoal-500">No items in this category yet — check back soon or browse all.</p>
            <button onClick={() => setFilter('All')} className="btn-secondary mt-4">View All</button>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((item, i) => (
              <button
                key={item.title}
                onClick={() => setLightbox(i)}
                className="card group overflow-hidden text-left hover:shadow-elevated hover:-translate-y-1 transition-all"
                aria-label={`View ${item.title} larger`}
              >
                <div className="relative aspect-[4/3] overflow-hidden">
                  <img src={item.image} alt={item.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-forest-900/70 to-transparent" />
                  <span className="absolute right-3 top-3 rounded-full bg-ivory-50/90 px-2.5 py-0.5 text-[11px] font-medium text-forest-700">{item.category}</span>
                  <div className="absolute bottom-0 p-5 text-ivory-50">
                    <h3 className="mb-0.5 text-lg font-semibold">{item.title}</h3>
                    <p className="line-clamp-2 text-sm text-ivory-200">{item.desc}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="mt-8 rounded-xl bg-terracotta-50 p-4 text-center">
          <p className="text-sm text-charcoal-600">
            <Sparkles className="mb-1 mx-auto h-4 w-4 text-terracotta-500" />
            These are illustrative concepts for inspiration, not completed StitchDoor customer work.
          </p>
        </div>

        <div className="mt-8 text-center">
          <Link to="/book" className="btn-primary">
            Start Your Transformation
          </Link>
        </div>
      </section>

      {/* Lightbox */}
      {lightbox !== null && visible[lightbox] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal-900/80 p-4"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            className="absolute right-4 top-4 rounded-full bg-ivory-50/90 p-2 text-charcoal-800 hover:bg-ivory-50"
            onClick={() => setLightbox(null)}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <button
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-ivory-50/90 p-2 text-charcoal-800 hover:bg-ivory-50 sm:left-6"
            onClick={(e) => { e.stopPropagation(); setLightbox((lightbox - 1 + visible.length) % visible.length); }}
            aria-label="Previous image"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <figure className="max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <img src={visible[lightbox].image} alt={visible[lightbox].title} className="max-h-[75vh] w-auto rounded-2xl object-contain shadow-elevated" />
            <figcaption className="mt-3 text-center text-sm text-ivory-100">
              <span className="font-semibold">{visible[lightbox].title}</span> — {visible[lightbox].desc}
            </figcaption>
          </figure>
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-ivory-50/90 p-2 text-charcoal-800 hover:bg-ivory-50 sm:right-6"
            onClick={(e) => { e.stopPropagation(); setLightbox((lightbox + 1) % visible.length); }}
            aria-label="Next image"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}
