import { useState, useEffect } from 'react';
import { Menu, X, Scissors, User, HandshakeIcon } from 'lucide-react';
import { Link, useRouter } from '@/lib/router';
import { useAuth } from '@/lib/auth';
import { Logo } from './Logo';

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { path } = useRouter();
  const { session } = useAuth();

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [path]);

  const navLinks = [
    { to: '/services', label: 'Services' },
    { to: '/how-it-works', label: 'How It Works' },
    { to: '/about', label: 'About' },
    { to: '/contact', label: 'Contact' },
  ];

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-ivory-50/95 backdrop-blur-md shadow-soft' : 'bg-ivory-50/80 backdrop-blur-sm'
      }`}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 lg:px-8">
        <Link to="/">
          <Logo />
        </Link>

        <div className="hidden items-center gap-1 lg:flex">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                path.startsWith(link.to)
                  ? 'bg-forest-50 text-forest-700'
                  : 'text-charcoal-600 hover:bg-ivory-200 hover:text-forest-700'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <Link to="/join-as-tailor" className="btn-ghost text-sm">
            <HandshakeIcon className="h-4 w-4" />
            Join as a Tailor
          </Link>
          <Link to="/track" className="btn-ghost text-sm">
            Track Order
          </Link>
          {session ? (
            <Link to="/account" className="btn-ghost text-sm">
              <User className="h-4 w-4" />
              My Account
            </Link>
          ) : (
            <Link to="/login" className="btn-ghost text-sm">
              <User className="h-4 w-4" />
              Login
            </Link>
          )}
          <Link to="/book" className="btn-primary text-sm">
            <Scissors className="h-4 w-4" />
            Book a Pickup
          </Link>
        </div>

        <button
          className="rounded-lg p-2 text-charcoal-700 hover:bg-ivory-200 lg:hidden"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {open && (
        <div className="animate-fade-in border-t border-ivory-300 bg-ivory-50 lg:hidden">
          <div className="flex flex-col gap-1 px-4 py-4">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                  path.startsWith(link.to)
                    ? 'bg-forest-50 text-forest-700'
                    : 'text-charcoal-600 hover:bg-ivory-200'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link to="/join-as-tailor" className="rounded-xl px-4 py-3 text-sm font-medium text-charcoal-600 hover:bg-ivory-200">
              Join as a Tailor
            </Link>
            <Link to="/track" className="rounded-xl px-4 py-3 text-sm font-medium text-charcoal-600 hover:bg-ivory-200">
              Track Order
            </Link>
            {session ? (
              <Link to="/account" className="rounded-xl px-4 py-3 text-sm font-medium text-charcoal-600 hover:bg-ivory-200">
                My Account
              </Link>
            ) : (
              <Link to="/login" className="rounded-xl px-4 py-3 text-sm font-medium text-charcoal-600 hover:bg-ivory-200">
                Login / Sign Up
              </Link>
            )}
            <Link to="/book" className="btn-primary mt-2 w-full">
              <Scissors className="h-4 w-4" />
              Book a Pickup
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
