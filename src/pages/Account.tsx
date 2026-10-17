import { useState, useEffect } from 'react';
import { LogOut, Package, User, Loader2 } from 'lucide-react';
import { Link, useRouter } from '@/lib/router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { STATUS_LABELS, formatINR } from '@/lib/constants';
import { formatDateTime } from '@/lib/utils';
import type { Booking } from '@/lib/types';

export function Account() {
  const { session, loading: authLoading, signOut } = useAuth();
  const { navigate } = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !session) navigate('/login');
  }, [authLoading, session, navigate]);

  useEffect(() => {
    if (session) {
      (async () => {
        const { data } = await supabase
          .from('bookings')
          .select('id, booking_reference, status, estimated_total, confirmed_amount, created_at')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false });
        if (data) setBookings(data as Booking[]);
        setLoading(false);
      })();
    }
  }, [session]);

  if (authLoading || !session) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-forest-600" />
      </div>
    );
  }

  const userName = session.user.user_metadata?.full_name || session.user.email;

  return (
    <div className="animate-fade-in mx-auto max-w-4xl px-4 py-12 lg:px-8">
      <div className="card mb-8 flex items-center justify-between p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-forest-100">
            <User className="h-6 w-6 text-forest-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-charcoal-800">{userName}</h1>
            <p className="text-sm text-charcoal-500">{session.user.email}</p>
          </div>
        </div>
        <button
          onClick={async () => {
            await signOut();
            navigate('/');
          }}
          className="btn-ghost text-sm"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>

      <div className="mb-6 flex items-center gap-2">
        <Package className="h-5 w-5 text-forest-600" />
        <h2 className="text-lg font-semibold text-charcoal-800">Your Bookings</h2>
      </div>

      {loading ? (
        <div className="py-12 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-forest-600" />
        </div>
      ) : bookings.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="mb-4 text-charcoal-500">You haven't made any bookings yet.</p>
          <Link to="/book" className="btn-primary">Book a Pickup</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => (
            <div key={booking.id} className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-forest-700">{booking.booking_reference}</p>
                  <p className="text-xs text-charcoal-400">{formatDateTime(booking.created_at)}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                  booking.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-forest-100 text-forest-700'
                }`}>
                  {STATUS_LABELS[booking.status]}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-ivory-300 pt-3">
                <span className="text-sm text-charcoal-500">
                  {booking.confirmed_amount ? formatINR(booking.confirmed_amount) : formatINR(booking.estimated_total)}
                  {!booking.confirmed_amount && ' (estimate)'}
                </span>
                <Link to="/track" className="text-sm font-medium text-forest-600 hover:underline">
                  Track →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
