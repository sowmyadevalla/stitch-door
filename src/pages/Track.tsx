import { useState, useEffect } from 'react';
import { Search, AlertCircle, CheckCircle, Loader2, X } from 'lucide-react';
import { Link } from '@/lib/router';
import { supabase } from '@/lib/supabase';
import { STATUS_FLOW, STATUS_LABELS, getStatusIndex, formatINR } from '@/lib/constants';
import { formatDateTime, formatDate } from '@/lib/utils';
import type { Booking, BookingItem, BookingStatusHistory } from '@/lib/types';

export function Track() {
  const [ref, setRef] = useState('');
  const [phone, setPhone] = useState('');
  const [booking, setBooking] = useState<Booking | null>(null);
  const [items, setItems] = useState<BookingItem[]>([]);
  const [history, setHistory] = useState<BookingStatusHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!ref.trim()) {
      setError('Please enter your booking reference.');
      return;
    }
    setLoading(true);
    setError(null);
    setBooking(null);
    setItems([]);
    setHistory([]);

    const { data, error: queryError } = await supabase
      .from('bookings')
      .select('*')
      .eq('booking_reference', ref.trim().toUpperCase())
      .maybeSingle();

    if (queryError) {
      setError('Something went wrong. Please try again.');
      setLoading(false);
      return;
    }

    if (!data) {
      setError('No booking found with this reference. Please check and try again.');
      setLoading(false);
      return;
    }

    const bookingData = data as Booking;

    // Verify with last 4 digits of phone if provided
    if (phone.trim()) {
      const last4 = phone.trim().replace(/\D/g, '').slice(-4);
      const bookingLast4 = bookingData.customer_phone.slice(-4);
      if (last4 !== bookingLast4) {
        setError('The phone number does not match this booking. Please verify and try again.');
        setLoading(false);
        return;
      }
    }

    setBooking(bookingData);

    // Load items
    const { data: itemsData } = await supabase
      .from('booking_items')
      .select('*')
      .eq('booking_id', bookingData.id)
      .order('created_at');
    if (itemsData) setItems(itemsData as BookingItem[]);

    // Load status history (non-internal)
    const { data: histData } = await supabase
      .from('booking_status_history')
      .select('*')
      .eq('booking_id', bookingData.id)
      .eq('is_internal', false)
      .order('created_at');
    if (histData) setHistory(histData as BookingStatusHistory[]);

    setLoading(false);
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
