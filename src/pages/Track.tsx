import { useState, useEffect } from 'react';
import { Search, AlertCircle, CheckCircle, Loader2, X } from 'lucide-react';
import { Link } from '@/lib/router';
import { supabase } from '@/lib/supabase';
import { STATUS_FLOW, STATUS_LABELS, getStatusIndex, formatINR } from '@/lib/constants';
import { formatDateTime, formatDate } from '@/lib/utils';
import type { Booking, BookingItem, BookingStatusHistory } from '@/lib/types';

interface StoredToken {
  token: string;
  savedAt: number;
}

function getStoredTokens(): Record<string, StoredToken> {
  try {
    return JSON.parse(localStorage.getItem('sd_tracking') || '{}');
  } catch {
    return {};
  }
}

const NEXT_STEP_HINTS: Record<string, { title: string; body: string }> = {
  request_received: {
    title: 'We have your request',
    body: 'Our team is reviewing your booking and preparing a price estimate. You do not need to do anything right now.',
  },
  awaiting_confirmation: {
    title: 'Price confirmation in progress',
    body: 'We will contact you shortly with the final price. Work begins only after you approve it.',
  },
  price_confirmed: {
    title: 'Price approved',
    body: 'Your pickup is being arranged for your preferred date and time window.',
  },
  pickup_scheduled: {
    title: 'Pickup scheduled',
    body: 'Please keep your garments ready. Our pickup team will arrive during your selected time window.',
  },
  picked_up: {
    title: 'Your clothes are with us',
    body: 'They are on their way to the tailoring partner. No action is needed from you.',
  },
  at_tailoring_partner: {
    title: 'Work in progress',
    body: 'A skilled tailoring partner is working on your garments. This is usually the longest stage.',
  },
  quality_check: {
    title: 'Quality check',
    body: 'The finished work is being checked against your instructions before it is returned.',
  },
  ready_for_delivery: {
    title: 'Almost home',
    body: 'Your garments are ready and delivery is being arranged. Keep the final amount ready — payment happens at delivery (cash or UPI).',
  },
  delivered: {
    title: 'Delivered',
    body: 'Thank you for choosing StitchDoor! We hope you love the results.',
  },
};

export function Track() {
  const [ref, setRef] = useState('');
  const [phone, setPhone] = useState('');
  const [booking, setBooking] = useState<Booking | null>(null);
  const [items, setItems] = useState<BookingItem[]>([]);
  const [history, setHistory] = useState<BookingStatusHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedRefs, setSavedRefs] = useState<string[]>([]);

  // Auto-track when arriving with ?ref=XXXX (e.g. from the booking confirmation)
  // or show saved orders for one-tap tracking
  useEffect(() => {
    const hashQuery = window.location.hash.split('?')[1] || '';
    const params = new URLSearchParams(hashQuery);
    const refParam = params.get('ref')?.trim().toUpperCase() || '';
    const tokens = getStoredTokens();
    const savedRefs = Object.keys(tokens)
      .filter((k) => tokens[k]?.token)
      .sort((a, b) => (tokens[b].savedAt || 0) - (tokens[a].savedAt || 0));
    setSavedRefs(savedRefs);
    if (refParam) {
      setRef(refParam);
      doTrack(refParam, '', true);
    } else if (savedRefs.length === 1) {
      // Only one order on this device: open it straight away
      setRef(savedRefs[0]);
      doTrack(savedRefs[0], '', true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doTrack(refValue: string, phoneValue: string, useToken = false) {
    setLoading(true);
    setError(null);
    setBooking(null);
    setItems([]);
    setHistory([]);

    const stored = getStoredTokens()[refValue];
    const token = stored?.token || '';
    const last4 = useToken && token ? '' : phoneValue.trim().replace(/\D/g, '').slice(-4);

    const { data, error: rpcError } = await supabase.rpc('track_booking', {
      p_ref: refValue,
      p_last4: last4,
      p_token: token,
    });

    if (rpcError) {
      setError('Something went wrong. Please try again.');
      setLoading(false);
      return;
    }

    const result = data as {
      error?: string;
      booking?: Booking;
      items?: BookingItem[];
      history?: BookingStatusHistory[];
    };

    if (result?.error === 'not_found') {
      setError('No booking found with this reference. Please check and try again.');
      setLoading(false);
      return;
    }
    if (result?.error === 'phone_mismatch' || result?.error === 'phone_required') {
      setError('The phone number does not match this booking. Please verify and try again.');
      setLoading(false);
      return;
    }
    if (result?.error || !result?.booking) {
      setError('Something went wrong. Please try again.');
      setLoading(false);
      return;
    }

    setBooking(result.booking);
    setItems(result.items || []);
    setHistory(result.history || []);
    setLoading(false);
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const target = ref.trim().toUpperCase();
    if (!target) {
      setError('Please enter your booking reference.');
      return;
    }
    setRef(target);
    await doTrack(target, phone);
  }

  const currentStatusIndex = booking ? getStatusIndex(booking.status) : -1;
  const isCancelled = booking?.status === 'cancelled';

  return (
    <div className="animate-fade-in">
      <section className="bg-forest-50 py-10">
        <div className="mx-auto max-w-3xl px-4 text-center lg:px-8">
          <h1 className="mb-2 text-3xl font-semibold text-charcoal-900">Track Your Order</h1>
          <p className="text-charcoal-500">Enter your booking reference to check the status.</p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-12 lg:px-8">
        {/* Saved orders: one tap, no ID or phone needed */}
        {savedRefs.length > 0 && !booking && (
          <div className="card mb-6 p-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-charcoal-500">
              {savedRefs.length === 1 ? 'Your recent order' : `Your orders (${savedRefs.length})`}
            </h2>
            <div className="flex flex-wrap gap-2">
              {savedRefs.map((savedRef) => (
                <button
                  key={savedRef}
                  onClick={() => {
                    setRef(savedRef);
                    doTrack(savedRef, '', true);
                  }}
                  disabled={loading}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    ref === savedRef && loading
                      ? 'bg-forest-600 text-ivory-50'
                      : 'bg-forest-100 text-forest-700 hover:bg-forest-200'
                  }`}
                >
                  {savedRef}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-charcoal-400">
              Saved on this device — tap to check status instantly. Booked on another device? Use the form below.
            </p>
          </div>
        )}
        <form onSubmit={handleSearch} className="card mb-8 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label-field">Booking Reference *</label>
              <input
                type="text"
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                className="input-field"
                placeholder="e.g. SDABCD1234"
              />
            </div>
            <div>
              <label className="label-field">Last 4 digits of phone (for verification)</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="input-field"
                placeholder="e.g. 4567"
                maxLength={4}
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-charcoal-400">
            We ask for the last 4 digits of your phone number to protect your booking details from anyone who might guess your reference.
          </p>
          <button type="submit" disabled={loading} className="btn-primary mt-4">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Track Order
          </button>
        </form>

        {error && (
          <div className="card flex items-center gap-3 p-4 text-sm text-terracotta-600">
            <AlertCircle className="h-5 w-5" />
            {error}
          </div>
        )}

        {booking && (
          <div className="animate-fade-in space-y-6">
            {/* Status Timeline */}
            <div className="card p-6">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider text-charcoal-500">Booking Reference</p>
                  <p className="text-xl font-bold text-forest-700">{booking.booking_reference}</p>
                </div>
                <span className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                  isCancelled ? 'bg-red-100 text-red-700' : 'bg-forest-100 text-forest-700'
                }`}>
                  {STATUS_LABELS[booking.status]}
                </span>
              </div>

              {isCancelled ? (
                <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
                  <p className="flex items-center gap-2">
                    <X className="h-4 w-4" /> This booking has been cancelled.
                  </p>
                  {booking.cancellation_reason && (
                    <p className="mt-1 text-red-600">Reason: {booking.cancellation_reason}</p>
                  )}
                </div>
              ) : (
                <>
                  {NEXT_STEP_HINTS[booking.status] && (
                    <div className="mb-6 rounded-xl bg-forest-50 p-4">
                      <p className="text-sm font-semibold text-forest-800">{NEXT_STEP_HINTS[booking.status].title}</p>
                      <p className="mt-1 text-sm text-charcoal-600">{NEXT_STEP_HINTS[booking.status].body}</p>
                      {booking.confirmed_amount === null && booking.status !== 'delivered' && (
                        <p className="mt-2 text-xs text-terracotta-600">
                          The final price will be confirmed with you before any work begins.
                        </p>
                      )}
                    </div>
                  )}
                  <div className="space-y-3">
                  {STATUS_FLOW.filter((s) => s.key !== 'cancelled').map((status, i) => {
                    const isDone = i <= currentStatusIndex;
                    const isCurrent = i === currentStatusIndex;
                    return (
                      <div key={status.key} className="flex items-start gap-3">
                        <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                          isDone ? 'bg-forest-600 text-ivory-50' : 'bg-ivory-200 text-charcoal-400'
                        }`}>
                          {isDone ? <CheckCircle className="h-4 w-4" /> : i + 1}
                        </div>
                        <div className={`flex-1 pb-3 ${i < STATUS_FLOW.length - 2 ? 'border-b border-ivory-300' : ''}`}>
                          <p className={`text-sm font-medium ${isDone ? 'text-charcoal-800' : 'text-charcoal-400'}`}>
                            {status.label}
                          </p>
                          <p className={`text-xs ${isDone ? 'text-charcoal-500' : 'text-charcoal-300'}`}>
                            {status.description}
                          </p>
                          {isCurrent && (
                            <span className="mt-1 inline-block rounded-full bg-terracotta-100 px-2 py-0.5 text-xs font-medium text-terracotta-600">
                              Current Status
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </>
              )}
            </div>

            {/* Booking Details */}
            <div className="card p-6">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-charcoal-500">Booking Details</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-charcoal-400">Date</p>
                  <p className="text-sm text-charcoal-700">{formatDateTime(booking.created_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-charcoal-400">Preferred Pickup</p>
                  <p className="text-sm text-charcoal-700">{formatDate(booking.preferred_pickup_date)} ({booking.preferred_pickup_window})</p>
                </div>
                <div>
                  <p className="text-xs text-charcoal-400">Payment Status</p>
                  <p className="text-sm capitalize text-charcoal-700">{booking.payment_status}</p>
                </div>
                <div>
                  <p className="text-xs text-charcoal-400">Estimated Total</p>
                  <p className="text-sm font-semibold text-forest-700">{formatINR(booking.estimated_total)}</p>
                </div>
              </div>
              {booking.confirmed_amount !== null && (
                <div className="mt-3 rounded-lg bg-forest-50 p-3">
                  <p className="text-xs text-charcoal-400">Confirmed Amount</p>
                  <p className="text-lg font-bold text-forest-700">{formatINR(booking.confirmed_amount)}</p>
                </div>
              )}
            </div>

            {/* Items */}
            {items.length > 0 && (
              <div className="card p-6">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-charcoal-500">Services</h3>
                <div className="space-y-3">
                  {items.map((item) => (
                    <div key={item.id} className="flex justify-between border-b border-ivory-300 pb-3 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-charcoal-800">{item.service_name}</p>
                        <p className="text-xs text-charcoal-500">Qty: {item.quantity}</p>
                        {item.garment_notes && (
                          <p className="mt-1 text-xs text-charcoal-400">{item.garment_notes}</p>
                        )}
                      </div>
                      <span className="text-sm font-medium text-charcoal-700">{formatINR(item.line_total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Status Updates */}
            {history.length > 0 && (
              <div className="card p-6">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-charcoal-500">Status Updates</h3>
                <div className="space-y-3">
                  {history.map((h) => (
                    <div key={h.id} className="flex gap-3">
                      <div className="flex h-2 w-2 mt-1.5 flex-shrink-0 rounded-full bg-forest-500" />
                      <div>
                        <p className="text-sm font-medium text-charcoal-800">{STATUS_LABELS[h.status]}</p>
                        {h.note && <p className="text-xs text-charcoal-500">{h.note}</p>}
                        <p className="text-xs text-charcoal-400">{formatDateTime(h.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="text-center">
              <Link to="/book" className="btn-secondary">Book Another Service</Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
