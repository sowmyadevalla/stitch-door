import { useState, useEffect, useCallback } from 'react';
import {
  Scissors, LogOut, Loader2, PackageCheck, Clock, MapPin, CheckCircle2,
  XCircle, ArrowRight, Phone, User, RefreshCw, ShieldAlert, BadgeCheck,
} from 'lucide-react';
import { useRouter } from '@/lib/router';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { STATUS_LABELS, formatINR } from '@/lib/constants';
import { formatDateTime } from '@/lib/utils';
import type {
  Booking, BookingItem, TailoringPartner, PartnerOffer,
  PartnerStage, BookingStatus,
} from '@/lib/types';

// Stages a partner may set, in strict forward order.
const STAGE_FLOW: PartnerStage[] = ['picked_up', 'at_tailoring_partner', 'quality_check', 'ready_for_delivery'];
const STAGE_LABELS: Record<PartnerStage, string> = {
  picked_up: 'Picked up',
  at_tailoring_partner: 'At workshop',
  quality_check: 'Quality check',
  ready_for_delivery: 'Ready for delivery',
};
const NEXT_STAGE: Partial<Record<BookingStatus, PartnerStage>> = {
  picked_up: 'at_tailoring_partner',
  at_tailoring_partner: 'quality_check',
  quality_check: 'ready_for_delivery',
};

interface OfferWithBooking {
  offer: PartnerOffer;
  booking: Booking;
  items: BookingItem[];
}

export function PartnerDashboard() {
  const { session, loading: authLoading, signOut } = useAuth();
  const { navigate } = useRouter();

  const [partner, setPartner] = useState<TailoringPartner | null>(null);
  const [checked, setChecked] = useState(false); // finished the partner lookup

  useEffect(() => {
    if (authLoading) return;
    if (!session) { navigate('/login'); return; }
    (async () => {
      const { data } = await supabase
        .from('tailoring_partners')
        .select('*')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();
      setPartner((data as TailoringPartner) || null);
      setChecked(true);
    })();
  }, [session, authLoading, navigate]);

  if (authLoading || !checked) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-forest-600" />
      </div>
    );
  }

  if (!partner) {
    return (
      <div className="animate-fade-in flex min-h-[70vh] items-center justify-center bg-ivory-100 px-4">
        <div className="card max-w-md p-8 text-center">
          <ShieldAlert className="mx-auto mb-3 h-12 w-12 text-charcoal-300" />
          <h1 className="font-serif text-2xl text-charcoal-900">Partner access only</h1>
          <p className="mt-2 text-sm leading-relaxed text-charcoal-500">
            This account isn't linked to a StitchDoor tailoring partner yet. If you've applied to join us,
            our team is reviewing your application and will set up your login once approved.
          </p>
          <button onClick={() => navigate('/')} className="btn-primary mt-5">Back to home</button>
        </div>
      </div>
    );
  }

  return <PartnerHome partner={partner} onSignOut={signOut} />;
}

function PartnerHome({ partner, onSignOut }: { partner: TailoringPartner; onSignOut: () => Promise<void> }) {
  const [offers, setOffers] = useState<OfferWithBooking[]>([]);
  const [orders, setOrders] = useState<Booking[]>([]);
  const [itemsByBooking, setItemsByBooking] = useState<Record<string, BookingItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const partnerId = partner.id;

    const [offersRes, bookingsRes] = await Promise.all([
      supabase
        .from('partner_offers')
        .select('*')
        .eq('partner_id', partnerId)
        .eq('status', 'pending')
        .order('offered_at', { ascending: false }),
      supabase
        .from('bookings')
        .select('*')
        .eq('assigned_partner_id', partnerId)
        .in('status', ['price_confirmed', 'pickup_scheduled', 'picked_up', 'at_tailoring_partner', 'quality_check', 'ready_for_delivery'])
        .order('updated_at', { ascending: false }),
    ]);

    const pendingOffers = (offersRes.data as PartnerOffer[]) || [];
    const bookings = (bookingsRes.data as Booking[]) || [];

    const offeredBookingIds = pendingOffers.map((o) => o.booking_id);
    let offeredBookings: Booking[] = [];
    if (offeredBookingIds.length > 0) {
      const { data } = await supabase.from('bookings').select('*').in('id', offeredBookingIds);
      offeredBookings = (data as Booking[]) || [];
    }

    const allBookingIds = Array.from(new Set([...offeredBookingIds, ...bookings.map((b) => b.id)]));
    const itemsMap: Record<string, BookingItem[]> = {};
    if (allBookingIds.length > 0) {
      const { data: itemsRes } = await supabase.from('booking_items').select('*').in('booking_id', allBookingIds);
      for (const item of (itemsRes as BookingItem[]) || []) {
        (itemsMap[item.booking_id] ||= []).push(item);
      }
    }

    setOffers(pendingOffers.map((o) => ({
      offer: o,
      booking: offeredBookings.find((b) => b.id === o.booking_id)!,
      items: itemsMap[o.booking_id] || [],
    })).filter((x) => x.booking));

    setOrders(bookings);
    setItemsByBooking(itemsMap);
    setLoading(false);
  }, [partner.id]);

  useEffect(() => { load(); }, [load]);

  async function respondOffer(offerId: string, accept: boolean) {
    setActionMsg(null);
    const { data } = await supabase.rpc('partner_respond_offer', { p_offer_id: offerId, p_accept: accept });
    if (data?.error) { setActionMsg('Could not respond: ' + data.error); return; }
    setActionMsg(accept ? 'Offer accepted — the order is now in My Orders below.' : 'Offer declined. StitchDoor has been notified.');
    load();
  }

  async function updateStage(bookingId: string, next: PartnerStage) {
    setActionMsg(null);
    const { data } = await supabase.rpc('partner_update_stage', {
      p_booking_id: bookingId, p_new_status: next, p_note: '',
    });
    if (data?.error) { setActionMsg('Could not update: ' + (data.message || data.error)); return; }
    setActionMsg('Order updated — the customer can now see "' + STAGE_LABELS[next] + '".');
    load();
  }

  return (
    <div className="animate-fade-in min-h-screen bg-ivory-100">
      <header className="border-b border-ivory-300 bg-ivory-50">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest-600 text-ivory-50">
              <Scissors className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-serif text-lg leading-tight text-charcoal-900">Partner Dashboard</h1>
              <p className="text-xs text-charcoal-500">
                {partner.name}{partner.partner_code ? ` • ${partner.partner_code}` : ''}
              </p>
            </div>
          </div>
          <button onClick={async () => { await onSignOut(); navigate('/'); }} className="btn-ghost text-sm">
            <LogOut className="h-4 w-4" /> Sign Out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 lg:px-8">
        {actionMsg && (
          <div className="mb-4 rounded-xl bg-forest-50 px-4 py-3 text-sm text-forest-700">{actionMsg}</div>
        )}

        {/* Profile card */}
        <div className="card mb-6 flex flex-wrap items-center gap-x-8 gap-y-3 p-5 text-sm">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-charcoal-400" />
            <span className="font-medium text-charcoal-800">{partner.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-charcoal-400" />
            <span className="text-charcoal-600">{partner.phone || '—'}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-charcoal-400" />
            <span className="text-charcoal-600">{partner.locality || '—'}</span>
          </div>
          <div className="flex items-center gap-2">
            <BadgeCheck className={`h-4 w-4 ${partner.is_accepting_orders ? 'text-forest-600' : 'text-charcoal-300'}`} />
            <span className={partner.is_accepting_orders ? 'text-forest-700' : 'text-charcoal-400'}>
              {partner.is_accepting_orders ? 'Accepting orders' : 'Not accepting orders'}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-forest-600" /></div>
        ) : (
          <div className="space-y-8">
            {/* Pending offers */}
            <section>
              <h2 className="mb-3 flex items-center gap-2 font-serif text-xl text-charcoal-900">
                <Clock className="h-5 w-5 text-terracotta-500" /> New Order Offers
              </h2>
              {offers.length === 0 ? (
                <div className="card p-8 text-center text-sm text-charcoal-500">
                  No new offers right now. When StitchDoor assigns an order to you, it appears here first.
                </div>
              ) : (
                <div className="space-y-3">
                  {offers.map(({ offer, booking, items }) => (
                    <div key={offer.id} className="card p-5">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-forest-700">{booking.booking_reference}</p>
                        <span className="text-xs text-charcoal-400">{formatDateTime(offer.offered_at)}</span>
                      </div>
                      <div className="grid gap-3 text-sm sm:grid-cols-2">
                        <div>
                          <p className="text-xs text-charcoal-400">Customer</p>
                          <p className="font-medium text-charcoal-800">{booking.customer_name}</p>
                          <p className="text-xs text-charcoal-500">{booking.customer_phone}</p>
                        </div>
                        <div>
                          <p className="text-xs text-charcoal-400">Pickup</p>
                          <p className="font-medium text-charcoal-800">{booking.locality}, {booking.pin_code}</p>
                          <p className="text-xs text-charcoal-500">
                            {booking.preferred_pickup_date ? new Date(booking.preferred_pickup_date).toLocaleDateString('en-IN') : 'Flexible'}
                            {' • '}{booking.preferred_pickup_window}
                          </p>
                        </div>
                      </div>
                      {items.length > 0 && (
                        <div className="mt-3 rounded-lg bg-ivory-200 p-3 text-sm">
                          {items.map((it) => (
                            <div key={it.id} className="flex justify-between">
                              <span>{it.service_name} × {it.quantity}</span>
                              <span className="text-charcoal-500">{formatINR(it.line_total)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="mt-4 flex gap-2">
                        <button onClick={() => respondOffer(offer.id, true)} className="btn-primary text-sm">
                          <CheckCircle2 className="h-4 w-4" /> Accept
                        </button>
                        <button onClick={() => respondOffer(offer.id, false)} className="btn-secondary text-sm !text-red-700">
                          <XCircle className="h-4 w-4" /> Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Assigned orders */}
            <section>
              <h2 className="mb-3 flex items-center gap-2 font-serif text-xl text-charcoal-900">
                <PackageCheck className="h-5 w-5 text-forest-600" /> My Orders
              </h2>
              {orders.length === 0 ? (
                <div className="card p-8 text-center text-sm text-charcoal-500">
                  No active orders. Accepted offers appear here with their current stage.
                </div>
              ) : (
                <div className="space-y-3">
                  {orders.map((b) => {
                    const next = NEXT_STAGE[b.status];
                    const stageIdx = STAGE_FLOW.indexOf(b.status as PartnerStage);
                    return (
                      <div key={b.id} className="card p-5">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold text-forest-700">{b.booking_reference}</p>
                          <span className="rounded-full bg-forest-50 px-3 py-1 text-xs font-medium text-forest-700">
                            {STATUS_LABELS[b.status] || b.status}
                          </span>
                        </div>
                        <div className="grid gap-3 text-sm sm:grid-cols-2">
                          <div>
                            <p className="text-xs text-charcoal-400">Customer</p>
                            <p className="font-medium text-charcoal-800">{b.customer_name}</p>
                            <p className="text-xs text-charcoal-500">{b.customer_phone}</p>
                          </div>
                          <div>
                            <p className="text-xs text-charcoal-400">Pickup address</p>
                            <p className="font-medium text-charcoal-800">{b.pickup_address}</p>
                            <p className="text-xs text-charcoal-500">{b.locality}, {b.pin_code}</p>
                          </div>
                        </div>
                        {(itemsByBooking[b.id] || []).length > 0 && (
                          <div className="mt-3 rounded-lg bg-ivory-200 p-3 text-sm">
                            {(itemsByBooking[b.id] || []).map((it) => (
                              <div key={it.id} className="flex justify-between">
                                <span>{it.service_name} × {it.quantity}</span>
                                {it.garment_notes && <span className="text-charcoal-500">{it.garment_notes}</span>}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Stage progress */}
                        {stageIdx >= 0 && (
                          <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs">
                            {STAGE_FLOW.map((s, i) => (
                              <span key={s} className="flex items-center gap-1.5">
                                <span className={`rounded-full px-2.5 py-1 font-medium ${
                                  i < stageIdx ? 'bg-forest-100 text-forest-700' :
                                  i === stageIdx ? 'bg-forest-600 text-ivory-50' :
                                  'bg-ivory-200 text-charcoal-400'
                                }`}>
                                  {STAGE_LABELS[s]}
                                </span>
                                {i < STAGE_FLOW.length - 1 && <ArrowRight className={`h-3 w-3 ${i < stageIdx ? 'text-forest-500' : 'text-charcoal-300'}`} />}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Stage advance */}
                        {next ? (
                          <button onClick={() => updateStage(b.id, next)} className="btn-primary mt-4 text-sm">
                            <ArrowRight className="h-4 w-4" /> Mark as {STAGE_LABELS[next]}
                          </button>
                        ) : b.status === 'ready_for_delivery' ? (
                          <p className="mt-4 flex items-center gap-2 text-sm text-forest-700">
                            <CheckCircle2 className="h-4 w-4" /> Ready for delivery — StitchDoor handles the return.
                          </p>
                        ) : (
                          <p className="mt-4 text-xs text-charcoal-400">
                            Waiting for pickup to be confirmed before you can update this order.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <div className="flex justify-end">
              <button onClick={load} className="btn-ghost text-xs"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
