import { useState, useEffect, useCallback } from 'react';
import {
  Scissors, LogOut, Loader2, PackageCheck, Clock, MapPin, CheckCircle2,
  XCircle, ArrowRight, Phone, User, RefreshCw, ShieldAlert, BadgeCheck, Timer,
} from 'lucide-react';
import { useRouter } from '@/lib/router';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { STATUS_LABELS } from '@/lib/constants';
import { formatDateTime } from '@/lib/utils';
import type { PartnerStage, BookingStatus } from '@/lib/types';

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

export interface PartnerOfferRow {
  offer_id: string;
  booking_id: string;
  booking_reference: string;
  customer_name: string;
  customer_phone: string;
  pickup_address: string;
  locality: string;
  pin_code: string;
  preferred_pickup_date: string | null;
  preferred_pickup_window: string;
  additional_instructions: string;
  assignment_note: string;
  expires_at: string | null;
  offered_at: string;
  items: { service_name: string; quantity: number; garment_notes: string | null }[];
}

export interface PartnerOrderRow {
  booking_id: string;
  booking_reference: string;
  status: BookingStatus;
  customer_name: string;
  customer_phone: string;
  pickup_address: string;
  locality: string;
  pin_code: string;
  preferred_pickup_date: string | null;
  preferred_pickup_window: string;
  additional_instructions: string;
  items: { service_name: string; quantity: number; garment_notes: string | null }[];
}

interface TailoringPartnerRow {
  id: string;
  name: string;
  phone: string;
  locality: string;
  is_active: boolean;
  auth_user_id: string | null;
  is_accepting_orders: boolean;
  partner_code: string | null;
}

export function PartnerDashboard() {
  const { session, loading: authLoading, signOut } = useAuth();
  const { navigate } = useRouter();

  const [partner, setPartner] = useState<TailoringPartnerRow | null>(null);
  const [checked, setChecked] = useState(false); // finished the partner lookup

  useEffect(() => {
    if (authLoading) return;
    if (!session) { navigate('/login'); return; }
    (async () => {
      const { data } = await supabase
        .from('tailoring_partners')
        .select('id, name, phone, locality, is_active, auth_user_id, is_accepting_orders, partner_code')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();
      setPartner((data as TailoringPartnerRow) || null);
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

function PartnerHome({ partner, onSignOut }: { partner: TailoringPartnerRow; onSignOut: () => Promise<void> }) {
  const { navigate } = useRouter();
  const [offers, setOffers] = useState<PartnerOfferRow[]>([]);
  const [orders, setOrders] = useState<PartnerOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [declining, setDeclining] = useState<string | null>(null); // offer_id being declined
  const [declineReason, setDeclineReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [offersRes, ordersRes] = await Promise.all([
      supabase.rpc('partner_list_my_offers'),
      supabase.rpc('partner_list_my_orders'),
    ]);
    setOffers((offersRes.data as unknown as PartnerOfferRow[]) || []);
    setOrders((ordersRes.data as unknown as PartnerOrderRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function acceptOffer(offer: PartnerOfferRow) {
    setActionMsg(null);
    const { data } = await supabase.rpc('partner_respond_offer', { p_offer_id: offer.offer_id, p_accept: true });
    if (data?.error) { setActionMsg('Could not accept: ' + (data.message || data.error)); return; }
    setActionMsg('Offer accepted — the order is now in My Orders below.');
    load();
  }

  async function declineOffer(offer: PartnerOfferRow) {
    setActionMsg(null);
    const { data } = await supabase.rpc('partner_respond_offer', {
      p_offer_id: offer.offer_id, p_accept: false, p_reason: declineReason.trim(),
    });
    setDeclining(null);
    setDeclineReason('');
    if (data?.error) { setActionMsg('Could not decline: ' + (data.message || data.error)); return; }
    setActionMsg('Offer declined. StitchDoor has been notified and will reassign the order.');
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

  function expiryLabel(expiresAt: string | null): { text: string; urgent: boolean } {
    if (!expiresAt) return { text: 'No deadline', urgent: false };
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return { text: 'Expired', urgent: true };
    const hours = Math.floor(ms / 3600000);
    if (hours < 1) return { text: 'Expires in less than an hour', urgent: true };
    if (hours < 24) return { text: `Expires in ${hours}h`, urgent: true };
    const days = Math.floor(hours / 24);
    return { text: `Expires in ${days}d`, urgent: false };
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
                  {offers.map((offer) => {
                    const expiry = expiryLabel(offer.expires_at);
                    return (
                      <div key={offer.offer_id} className="card p-5">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold text-forest-700">{offer.booking_reference}</p>
                          <div className="flex items-center gap-2">
                            {offer.expires_at && (
                              <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                                expiry.urgent ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                              }`}>
                                <Timer className="h-3 w-3" /> {expiry.text}
                              </span>
                            )}
                            <span className="text-xs text-charcoal-400">{formatDateTime(offer.offered_at)}</span>
                          </div>
                        </div>
                        {offer.assignment_note && (
                          <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            <span className="font-semibold">Note from StitchDoor:</span> {offer.assignment_note}
                          </div>
                        )}
                        <div className="grid gap-3 text-sm sm:grid-cols-2">
                          <div>
                            <p className="text-xs text-charcoal-400">Customer</p>
                            <p className="font-medium text-charcoal-800">{offer.customer_name}</p>
                            <p className="text-xs text-charcoal-500">{offer.customer_phone}</p>
                          </div>
                          <div>
                            <p className="text-xs text-charcoal-400">Pickup</p>
                            <p className="font-medium text-charcoal-800">{offer.locality}, {offer.pin_code}</p>
                            <p className="text-xs text-charcoal-500">
                              {offer.preferred_pickup_date ? new Date(offer.preferred_pickup_date).toLocaleDateString('en-IN') : 'Flexible'}
                              {' • '}{offer.preferred_pickup_window}
                            </p>
                          </div>
                        </div>
                        {offer.additional_instructions && (
                          <p className="mt-2 text-xs text-charcoal-500">Instructions: {offer.additional_instructions}</p>
                        )}
                        {offer.items.length > 0 && (
                          <div className="mt-3 rounded-lg bg-ivory-200 p-3 text-sm">
                            {offer.items.map((it, i) => (
                              <div key={i} className="flex justify-between">
                                <span>{it.service_name} × {it.quantity}</span>
                                {it.garment_notes && <span className="text-charcoal-500">{it.garment_notes}</span>}
                              </div>
                            ))}
                          </div>
                        )}

                        {declining === offer.offer_id ? (
                          <div className="mt-4 space-y-2">
                            <input
                              type="text"
                              value={declineReason}
                              onChange={(e) => setDeclineReason(e.target.value)}
                              className="input-field"
                              placeholder="Reason for declining (helps us reassign faster)"
                              maxLength={200}
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <button onClick={() => declineOffer(offer)} className="btn-secondary text-sm !text-red-700">
                                <XCircle className="h-4 w-4" /> Confirm decline
                              </button>
                              <button onClick={() => { setDeclining(null); setDeclineReason(''); }} className="btn-ghost text-sm">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-4 flex gap-2">
                            <button onClick={() => acceptOffer(offer)} className="btn-primary text-sm">
                              <CheckCircle2 className="h-4 w-4" /> Accept
                            </button>
                            <button onClick={() => setDeclining(offer.offer_id)} className="btn-secondary text-sm !text-red-700">
                              <XCircle className="h-4 w-4" /> Decline
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
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
                      <div key={b.booking_id} className="card p-5">
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
                        {b.additional_instructions && (
                          <p className="mt-2 text-xs text-charcoal-500">Instructions: {b.additional_instructions}</p>
                        )}
                        {b.items.length > 0 && (
                          <div className="mt-3 rounded-lg bg-ivory-200 p-3 text-sm">
                            {b.items.map((it, i) => (
                              <div key={i} className="flex justify-between">
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
                          <button onClick={() => updateStage(b.booking_id, next)} className="btn-primary mt-4 text-sm">
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
