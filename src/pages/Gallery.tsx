import { Sparkles } from 'lucide-react';
import { Link } from '@/lib/router';

const galleryItems = [
  { image: 'https://images.pexels.com/photos/8751525/pexels-photo-8751525.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', title: 'Saree to Dress', desc: 'Transform an old silk saree into an elegant dress for everyday wear.' },
  { image: 'https://images.pexels.com/photos/2517865/pexels-photo-2517865.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', title: 'Repurposed Garments', desc: 'Restyle old kurtis and dresses into fresh, modern silhouettes.' },
  { image: 'https://images.pexels.com/photos/3778061/pexels-photo-3778061.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', title: 'Fabric Scraps to Accessories', desc: 'Turn fabric remnants into tote bags, pouches and hair accessories.' },
  { image: 'https://images.pexels.com/photos/15937625/pexels-photo-15937625.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', title: 'Denim Repair & Restyle', desc: 'Repair torn denim or restyle old jeans into shorts, skirts or bags.' },
  { image: 'https://images.pexels.com/photos/38826113/pexels-photo-38826113.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', title: 'Saree to Lehenga', desc: 'Convert a cherished saree into a lehenga set with matching dupatta.' },
  { image: 'https://images.pexels.com/photos/11496275/pexels-photo-11496275.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', title: 'Patchwork from Scraps', desc: 'Combine fabric scraps into patchwork cushions, runners or quilts.' },
  { image: 'https://images.pexels.com/photos/5355645/pexels-photo-5355645.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', title: 'Fabric Bags', desc: 'Stitch reusable fabric bags from old curtains, bedsheets or garments.' },
  { image: 'https://images.pexels.com/photos/11004381/pexels-photo-11004381.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', title: 'Custom Restyling', desc: 'Bring your own idea — we will help you bring it to life.' },
];

export function Gallery() {
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
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {galleryItems.map((item, i) => (
            <div key={i} className="card group overflow-hidden hover:shadow-elevated hover:-translate-y-1 transition-all">
              <div className="relative aspect-[4/3] overflow-hidden">
                <img src={item.image} alt={item.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-forest-900/70 to-transparent" />
                <div className="absolute bottom-0 p-5 text-ivory-50">
                  <h3 className="mb-1 text-lg font-semibold">{item.title}</h3>
                  <p className="text-sm text-ivory-200">{item.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

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
    </div>
  );
}
