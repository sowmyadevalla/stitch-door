import { useState, useEffect } from 'react';
import { LogOut, Package, User, Loader2, XCircle } from 'lucide-react';
import { Link, useRouter } from '@/lib/router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { STATUS_LABELS, formatINR } from '@/lib/constants';
import { formatDateTime } from '@/lib/utils';
import type { Booking } from '@/lib/types';

const STATUS_HINTS: Record<string, string> = {
  request_received: 'We are preparing your price estimate',
  awaiting_confirmation: 'Price confirmation in progress',
  price_confirmed: 'Pickup being arranged',
  pickup_scheduled: 'Pickup scheduled',
  picked_up: 'Your clothes are with us',
  at_tailoring_partner: 'Work in progress',
  quality_check: 'Quality check',
  ready_for_delivery: 'Ready for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export function Account() {
  const { session, loading: authLoading, signOut } = useAuth();
  const { navigate } = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<Record<string, string>>({});
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !session) navigate('/login');
  }, [authLoading, session, navigate]);

  function loadBookings() {
    if (!session) return;
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

  useEffect(() => {
    loadBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function cancelBooking(bookingId: string) {
    setCancelling(bookingId);
    setCancelError((prev) => ({ ...prev, [bookingId]: '' }));
    const { data } = await supabase.rpc('customer_cancel_booking', { p_booking_id: bookingId });
    if (data?.error) {
      setCancelError((prev) => ({ ...prev, [bookingId]: data.error }));
    } else {
      loadBookings();
    }
    setConfirmCancelId(null);
    setCancelling(null);
  }

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
        <h2 className="text-lg font-semibold text-charcoal-800">My Orders</h2>
      </div>

      {loading ? (
        <div className="py-12 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-forest-600" />
        </div>
      ) : bookings.length === 0 ? (
        <div className="card p-12 text-center">
          <Package className="mx-auto mb-3 h-10 w-10 text-ivory-400" />
          <p className="mb-1 font-medium text-charcoal-700">No orders yet</p>
          <p className="mb-4 text-sm text-charcoal-500">Book your first pickup and track it right here.</p>
          <Link to="/book" className="btn-primary">Book a Pickup</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => {
            const cancellable = !['cancelled', 'picked_up', 'at_tailoring_partner', 'quality_check', 'ready_for_delivery', 'delivered'].includes(booking.status);
            return (
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
                <p className="mt-1 text-xs text-charcoal-500">{STATUS_HINTS[booking.status]}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-ivory-300 pt-3">
                  <span className="text-sm text-charcoal-500">
                    {booking.confirmed_amount ? formatINR(booking.confirmed_amount) : formatINR(booking.estimated_total)}
                    {!booking.confirmed_amount && ' (estimate)'}
                  </span>
                  <div className="flex items-center gap-3">
                    {cancellable && confirmCancelId !== booking.id && (
                      <button
                        onClick={() => setConfirmCancelId(booking.id)}
                        className="text-sm text-charcoal-400 hover:text-terracotta-600"
                      >
                        Cancel
                      </button>
                    )}
                    <Link to={`/track?ref=${booking.booking_reference}`} className="text-sm font-medium text-forest-600 hover:underline">
                      Track →
                    </Link>
                  </div>
                </div>
                {confirmCancelId === booking.id && (
                  <div className="mt-3 rounded-xl bg-amber-50 p-3">
                    <p className="text-sm text-amber-800">
                      Cancel this booking? Free cancellation applies before pickup. After pickup, charges may apply based on work completed.
                    </p>
                    {cancelError[booking.id] && (
                      <p className="mt-1 text-xs text-terracotta-600">{cancelError[booking.id]}</p>
                    )}
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => cancelBooking(booking.id)}
                        disabled={cancelling === booking.id}
                        className="rounded-lg bg-terracotta-500 px-3 py-1.5 text-sm font-medium text-ivory-50 hover:bg-terracotta-600 disabled:opacity-50"
                      >
                        {cancelling === booking.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><XCircle className="h-4 w-4" /> Yes, cancel</>}
                      </button>
                      <button
                        onClick={() => setConfirmCancelId(null)}
                        className="rounded-lg px-3 py-1.5 text-sm text-charcoal-600 hover:bg-amber-100"
                      >
                        Keep booking
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
