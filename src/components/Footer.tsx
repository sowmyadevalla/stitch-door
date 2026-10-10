import { Mail, Phone, Clock, MapPin } from 'lucide-react';
import { Link } from '@/lib/router';
import { Logo } from './Logo';
import { useBusinessConfig } from '@/lib/config';

export function Footer() {
  const { config } = useBusinessConfig();

  return (
    <footer className="mt-20 bg-forest-800 text-ivory-200">
      <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="mb-4">
              <Logo />
            </div>
            <p className="text-sm leading-relaxed text-ivory-300">
              {config.tagline}
            </p>
            <p className="mt-3 text-xs text-ivory-400">
              {config.service_area_note}
            </p>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-ivory-300">Services</h3>
            <ul className="space-y-2 text-sm">
              <li><Link to="/services" className="hover:text-ivory-50 transition-colors">All Services</Link></li>
              <li><Link to="/services/alterations" className="hover:text-ivory-50 transition-colors">Clothing Alterations</Link></li>
              <li><Link to="/services/blouse-stitching" className="hover:text-ivory-50 transition-colors">Blouse Stitching</Link></li>
              <li><Link to="/services/saree-to-outfit" className="hover:text-ivory-50 transition-colors">Saree Transformation</Link></li>
              <li><Link to="/gallery" className="hover:text-ivory-50 transition-colors">Transformation Gallery</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-ivory-300">Company</h3>
            <ul className="space-y-2 text-sm">
              <li><Link to="/how-it-works" className="hover:text-ivory-50 transition-colors">How It Works</Link></li>
              <li><Link to="/about" className="hover:text-ivory-50 transition-colors">About Us</Link></li>
              <li><Link to="/faqs" className="hover:text-ivory-50 transition-colors">FAQs</Link></li>
              <li><Link to="/contact" className="hover:text-ivory-50 transition-colors">Contact Us</Link></li>
              <li><Link to="/track" className="hover:text-ivory-50 transition-colors">Track Your Order</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-ivory-300">Contact</h3>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <Phone className="mt-0.5 h-4 w-4 flex-shrink-0 text-terracotta-300" />
                <span>{config.whatsapp_number || 'To be configured'}</span>
              </li>
              <li className="flex items-start gap-2">
                <Mail className="mt-0.5 h-4 w-4 flex-shrink-0 text-terracotta-300" />
                <span>{config.contact_email || 'To be configured'}</span>
              </li>
              <li className="flex items-start gap-2">
                <Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-terracotta-300" />
                <span>{config.business_hours}</span>
              </li>
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-terracotta-300" />
                <span>Hyderabad, Telangana, India</span>
              </li>
            </ul>
            <div className="mt-4 flex gap-3">
              {config.facebook_url && <a href={config.facebook_url} target="_blank" rel="noopener noreferrer" className="text-ivory-300 hover:text-ivory-50">Facebook</a>}
              {config.instagram_url && <a href={config.instagram_url} target="_blank" rel="noopener noreferrer" className="text-ivory-300 hover:text-ivory-50">Instagram</a>}
              {config.twitter_url && <a href={config.twitter_url} target="_blank" rel="noopener noreferrer" className="text-ivory-300 hover:text-ivory-50">Twitter</a>}
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-forest-700 pt-6 text-xs text-ivory-400 sm:flex-row">
          <p>&copy; {new Date().getFullYear()} StitchDoor. All rights reserved.</p>
          <div className="flex gap-4">
            <Link to="/privacy-policy" className="hover:text-ivory-50">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-ivory-50">Terms &amp; Conditions</Link>
            <Link to="/admin-login" className="text-ivory-500 hover:text-ivory-300">Admin</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
