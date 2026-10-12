import { useState, useEffect } from 'react';
import { LayoutDashboard, Scissors, Settings, LogOut, Loader2, ShieldAlert, Plus, Edit, Trash2, X, Download, ChevronRight, Bell, Clock } from 'lucide-react';
import { useRouter } from '@/lib/router';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { STATUS_LABELS, STATUS_FLOW, PAYMENT_LABELS, formatINR } from '@/lib/constants';
import { formatDateTime, formatDate, slugify } from '@/lib/utils';
import type { Booking, Service, BusinessConfig, ServiceableArea, TailoringPartner, BookingStatus, PaymentStatus } from '@/lib/types';

type AdminTab = 'overview' | 'bookings' | 'services' | 'operations';

export function AdminDashboard() {
  const { session, isAdmin, loading, signOut } = useAuth();
  const { navigate } = useRouter();
  const [tab, setTab] = useState<AdminTab>('overview');
  const [toast, setToast] = useState<{ ref: string; name: string } | null>(null);

  useEffect(() => {
    if (!loading && (!session || !isAdmin)) navigate('/admin-login');
  }, [session, isAdmin, loading, navigate]);

  // Realtime: listen for new bookings and show a toast + browser notification
  useEffect(() => {
    if (!session || !isAdmin) return;

    const channel = supabase
      .channel('new-bookings')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bookings' },
        (payload: any) => {
          const b = payload.new as Booking;
          setToast({ ref: b.booking_reference, name: b.customer_name });

          // Browser notification (if permission granted)
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification('New StitchDoor Booking!', {
              body: `${b.customer_name} — ${b.booking_reference}`,
            });
          }

          // Auto-dismiss toast after 8 seconds
          setTimeout(() => setToast(null), 8000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, isAdmin]);

  // Request notification permission on mount
  useEffect(() => {
    if (!session || !isAdmin) return;
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [session, isAdmin]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-forest-600" />
      </div>
    );
  }

  if (!session || !isAdmin) return null;

  const tabs: { key: AdminTab; label: string; icon: typeof LayoutDashboard }[] = [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard },
    { key: 'bookings', label: 'Bookings', icon: Scissors },
    { key: 'services', label: 'Services', icon: Settings },
    { key: 'operations', label: 'Operations', icon: Settings },
  ];

  return (
    <div className="animate-fade-in min-h-screen bg-ivory-200">
      {/* Real-time toast notification */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 animate-fade-in">
          <div className="flex items-center gap-3 rounded-xl bg-forest-700 px-5 py-4 text-ivory-50 shadow-elevated">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-terracotta-500">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">New Booking Received!</p>
              <p className="text-xs text-ivory-200">{toast.name} — {toast.ref}</p>
            </div>
            <button
              onClick={() => { setToast(null); setTab('bookings'); }}
              className="ml-4 rounded-lg bg-ivory-50 px-3 py-1.5 text-xs font-medium text-forest-700 hover:bg-ivory-200"
            >
              View
            </button>
            <button onClick={() => setToast(null)} className="text-ivory-300 hover:text-ivory-50">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-charcoal-900">Admin Dashboard</h1>
          <button
            onClick={async () => { await signOut(); navigate('/'); }}
            className="btn-ghost text-sm"
          >
            <LogOut className="h-4 w-4" /> Sign Out
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
          <div className="flex gap-2 overflow-x-auto lg:flex-col">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                  tab === t.key ? 'bg-forest-600 text-ivory-50' : 'bg-ivory-50 text-charcoal-600 hover:bg-ivory-300'
                }`}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            ))}
          </div>

          <div>
            {tab === 'overview' && <OverviewTab />}
            {tab === 'bookings' && <BookingsTab />}
            {tab === 'services' && <ServicesTab />}
            {tab === 'operations' && <OperationsTab />}
          </div>
        </div>
      </div>
    </div>
  );
}

function OverviewTab() {
  const [stats, setStats] = useState({
    total: 0, request_received: 0, awaiting_confirmation: 0, pickup_scheduled: 0,
    in_progress: 0, delivered: 0, cancelled: 0, revenue: 0,
  });
  const [recentBookings, setRecentBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  async function loadData() {
    const { data, error } = await supabase.from('bookings').select('*').order('created_at', { ascending: false });
    if (error || !data) { setLoading(false); return; }
    const bookings = data as Booking[];
    setStats({
      total: bookings.length,
      request_received: bookings.filter(b => b.status === 'request_received').length,
      awaiting_confirmation: bookings.filter(b => b.status === 'awaiting_confirmation' || b.status === 'price_confirmed').length,
      pickup_scheduled: bookings.filter(b => b.status === 'pickup_scheduled' || b.status === 'picked_up').length,
      in_progress: bookings.filter(b => ['at_tailoring_partner', 'quality_check', 'ready_for_delivery'].includes(b.status)).length,
      delivered: bookings.filter(b => b.status === 'delivered').length,
      cancelled: bookings.filter(b => b.status === 'cancelled').length,
      revenue: bookings.filter(b => b.status === 'delivered' && b.payment_status === 'paid').reduce((s, b) => s + (b.confirmed_amount || b.estimated_total), 0),
    });
    setRecentBookings(bookings.slice(0, 5));
    setLastRefresh(new Date());
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // Auto-refresh every 30 seconds as fallback
    const interval = setInterval(loadData, 30000);

    // Realtime: refresh immediately when a new booking is inserted
    const channel = supabase
      .channel('overview-bookings')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bookings' },
        () => loadData()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bookings' },
        () => loadData()
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading) return <div className="py-12 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-forest-600" /></div>;

  const cards = [
    { label: 'Total Bookings', value: stats.total, color: 'bg-forest-100 text-forest-700' },
    { label: 'New Requests', value: stats.request_received, color: 'bg-terracotta-100 text-terracotta-700' },
    { label: 'Awaiting Confirmation', value: stats.awaiting_confirmation, color: 'bg-yellow-100 text-yellow-700' },
    { label: 'Pickups Scheduled', value: stats.pickup_scheduled, color: 'bg-blue-100 text-blue-700' },
    { label: 'In Progress', value: stats.in_progress, color: 'bg-purple-100 text-purple-700' },
    { label: 'Completed', value: stats.delivered, color: 'bg-green-100 text-green-700' },
    { label: 'Cancelled', value: stats.cancelled, color: 'bg-red-100 text-red-700' },
    { label: 'Revenue (Paid)', value: formatINR(stats.revenue), color: 'bg-forest-600 text-ivory-50' },
  ];

  const hasNewOrders = stats.request_received > 0;

  return (
    <div className="space-y-6">
      {/* New orders alert */}
      {hasNewOrders && (
        <div className="animate-fade-in flex items-center gap-3 rounded-xl bg-terracotta-50 p-4">
          <Bell className="h-5 w-5 flex-shrink-0 animate-pulse text-terracotta-500" />
          <div>
            <p className="text-sm font-semibold text-terracotta-700">
              You have {stats.request_received} new booking request{stats.request_received > 1 ? 's' : ''} waiting for price confirmation.
            </p>
            <p className="text-xs text-terracotta-500">Go to the Bookings tab to review and confirm them.</p>
          </div>
        </div>
      )}

      {/* Stats */}
      {stats.total === 0 ? (
        <div className="card p-12 text-center">
          <ShieldAlert className="mx-auto mb-3 h-12 w-12 text-charcoal-300" />
          <h3 className="mb-2 text-lg font-semibold text-charcoal-700">No Bookings Yet</h3>
          <p className="text-sm text-charcoal-500">Your dashboard will show booking statistics here once customers start booking services. New orders will appear here automatically — this page refreshes every 30 seconds.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((c, i) => (
              <div key={i} className="card p-5">
                <p className="mb-1 text-xs uppercase tracking-wider text-charcoal-400">{c.label}</p>
                <p className={`text-2xl font-bold ${c.color.split(' ')[1]}`}>{c.value}</p>
              </div>
            ))}
          </div>

          {/* Recent bookings */}
          <div className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-charcoal-700">Recent Bookings</h3>
              <span className="flex items-center gap-1 text-xs text-charcoal-400">
                <Clock className="h-3 w-3" />
                Auto-refreshed at {lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="space-y-2">
              {recentBookings.map(b => (
                <div key={b.id} className="flex items-center justify-between rounded-lg bg-ivory-200 p-3 text-sm">
                  <div>
                    <p className="font-semibold text-forest-700">{b.booking_reference}</p>
                    <p className="text-xs text-charcoal-500">{b.customer_name} • {b.customer_phone}</p>
                    <p className="text-xs text-charcoal-400">{formatDateTime(b.created_at)}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                    b.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                    b.status === 'request_received' ? 'bg-terracotta-100 text-terracotta-700' :
                    b.status === 'delivered' ? 'bg-green-100 text-green-700' :
                    'bg-forest-100 text-forest-700'
                  }`}>{STATUS_LABELS[b.status]}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function BookingsTab() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState<Booking | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [partners, setPartners] = useState<TailoringPartner[]>([]);

  async function loadBookings() {
    setLoading(true);
    let query = supabase.from('bookings').select('*').order('created_at', { ascending: false });
    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    if (search) query = query.or(`booking_reference.ilike.%${search}%,customer_name.ilike.%${search}%`);
    const { data } = await query.limit(100);
    setBookings((data as Booking[]) || []);
    setLoading(false);
  }

  useEffect(() => { loadBookings(); }, [statusFilter, search]);

  async function openBooking(booking: Booking) {
    setSelected(booking);
    const [itemsRes, histRes, partnersRes] = await Promise.all([
      supabase.from('booking_items').select('*').eq('booking_id', booking.id),
      supabase.from('booking_status_history').select('*').eq('booking_id', booking.id).order('created_at'),
      supabase.from('tailoring_partners').select('*').eq('is_active', true),
    ]);
    setItems(itemsRes.data || []);
    setHistory(histRes.data || []);
    setPartners((partnersRes.data as TailoringPartner[]) || []);
  }

  function exportCSV() {
    const headers = ['Reference', 'Customer', 'Phone', 'Status', 'Estimated', 'Confirmed', 'Payment', 'Created'];
    const rows = bookings.map(b => [
      b.booking_reference, b.customer_name, b.customer_phone, b.status,
      b.estimated_total, b.confirmed_amount || '', b.payment_status, b.created_at,
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'stitchdoor-bookings.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input type="text" placeholder="Search ref or name..." value={search} onChange={(e) => setSearch(e.target.value)} className="input-field max-w-xs" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-field max-w-xs">
          <option value="all">All Statuses</option>
          {STATUS_FLOW.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <button onClick={exportCSV} disabled={bookings.length === 0} className="btn-secondary text-sm">
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-forest-600" /></div>
      ) : bookings.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-sm text-charcoal-500">No bookings found matching your filters.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {bookings.map(b => (
            <button key={b.id} onClick={() => openBooking(b)} className="card flex w-full items-center justify-between p-4 text-left hover:shadow-elevated transition-all">
              <div>
                <p className="text-sm font-semibold text-forest-700">{b.booking_reference}</p>
                <p className="text-xs text-charcoal-500">{b.customer_name} • {b.customer_phone}</p>
                <p className="text-xs text-charcoal-400">{formatDateTime(b.created_at)}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                  b.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-forest-100 text-forest-700'
                }`}>{STATUS_LABELS[b.status]}</span>
                <span className="text-sm font-medium text-charcoal-700">{formatINR(b.confirmed_amount || b.estimated_total)}</span>
                <ChevronRight className="h-4 w-4 text-charcoal-400" />
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <BookingDetailModal
          booking={selected}
          items={items}
          history={history}
          partners={partners}
          onClose={() => setSelected(null)}
          onUpdate={() => { loadBookings(); }}
        />
      )}
    </div>
  );
}

function BookingDetailModal({
  booking, items, history, partners, onClose, onUpdate,
}: {
  booking: Booking; items: any[]; history: any[]; partners: TailoringPartner[];
  onClose: () => void; onUpdate: () => void;
}) {
  const [status, setStatus] = useState<BookingStatus>(booking.status);
  const [confirmedAmount, setConfirmedAmount] = useState(booking.confirmed_amount?.toString() || '');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(booking.payment_status);
  const [partnerId, setPartnerId] = useState(booking.assigned_partner_id || '');
  const [adminNote, setAdminNote] = useState(booking.admin_notes);
  const [historyNote, setHistoryNote] = useState('');
  const [isInternal, setIsInternal] = useState(true);
  const [cancelReason, setCancelReason] = useState(booking.cancellation_reason);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  async function saveChanges() {
    setSaving(true);
    setSaveMsg(null);
    const updates: any = {
      status,
      payment_status: paymentStatus,
      admin_notes: adminNote,
      assigned_partner_id: partnerId || null,
    };
    if (confirmedAmount) updates.confirmed_amount = parseFloat(confirmedAmount);
    if (status === 'cancelled' && cancelReason) updates.cancellation_reason = cancelReason;

    const { error } = await supabase.from('bookings').update(updates).eq('id', booking.id);
    if (error) { setSaveMsg('Error: ' + error.message); setSaving(false); return; }

    if (status !== booking.status && historyNote) {
      await supabase.from('booking_status_history').insert({
        booking_id: booking.id, status, note: historyNote, is_internal: isInternal, created_by: booking.user_id,
      });
    } else if (status !== booking.status) {
      await supabase.from('booking_status_history').insert({
        booking_id: booking.id, status, note: `Status updated to ${STATUS_LABELS[status]}`, is_internal: true,
      });
    }

    setSaveMsg('Saved successfully.');
    setSaving(false);
    onUpdate();
    setTimeout(() => setSaveMsg(null), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal-900/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-ivory-50 p-6 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-charcoal-900">Booking {booking.booking_reference}</h3>
          <button onClick={onClose} className="text-charcoal-400 hover:text-charcoal-600"><X className="h-5 w-5" /></button>
        </div>

        {/* Customer Info */}
        <div className="mb-4 grid gap-3 rounded-xl bg-ivory-200 p-4 text-sm sm:grid-cols-2">
          <div><p className="text-xs text-charcoal-400">Name</p><p className="font-medium">{booking.customer_name}</p></div>
          <div><p className="text-xs text-charcoal-400">Phone</p><p className="font-medium">{booking.customer_phone}</p></div>
          <div><p className="text-xs text-charcoal-400">Email</p><p className="font-medium">{booking.customer_email || '—'}</p></div>
          <div><p className="text-xs text-charcoal-400">Pickup Date</p><p className="font-medium">{formatDate(booking.preferred_pickup_date)} ({booking.preferred_pickup_window})</p></div>
          <div className="sm:col-span-2"><p className="text-xs text-charcoal-400">Address</p><p className="font-medium">{booking.pickup_address}, {booking.locality}, {booking.pin_code}</p></div>
          {booking.additional_instructions && <div className="sm:col-span-2"><p className="text-xs text-charcoal-400">Instructions</p><p className="font-medium">{booking.additional_instructions}</p></div>}
        </div>

        {/* Items */}
        {items.length > 0 && (
          <div className="mb-4">
            <h4 className="mb-2 text-sm font-semibold text-charcoal-700">Services</h4>
            <div className="space-y-2">
              {items.map((item: any) => (
                <div key={item.id} className="rounded-lg bg-ivory-200 p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium">{item.service_name} × {item.quantity}</span>
                    <span>{formatINR(item.line_total)}</span>
                  </div>
                  {item.garment_notes && <p className="mt-1 text-xs text-charcoal-500">{item.garment_notes}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Admin Controls */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-charcoal-700">Manage Booking</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label-field">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as BookingStatus)} className="input-field">
                {STATUS_FLOW.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label-field">Payment Status</label>
              <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)} className="input-field">
                {Object.entries(PAYMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="label-field">Confirmed Amount</label>
              <input type="number" value={confirmedAmount} onChange={(e) => setConfirmedAmount(e.target.value)} className="input-field" placeholder="INR" />
            </div>
            <div>
              <label className="label-field">Assigned Partner</label>
              <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className="input-field">
                <option value="">None</option>
                {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          {status === 'cancelled' && (
            <div>
              <label className="label-field">Cancellation Reason</label>
              <input type="text" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="input-field" />
            </div>
          )}

          <div>
            <label className="label-field">Status Update Note</label>
            <input type="text" value={historyNote} onChange={(e) => setHistoryNote(e.target.value)} className="input-field" placeholder="Note for this status change..." />
            <label className="mt-2 flex items-center gap-2 text-xs text-charcoal-500">
              <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} />
              Internal note (not visible to customer)
            </label>
          </div>

          <div>
            <label className="label-field">Admin Notes</label>
            <textarea value={adminNote} onChange={(e) => setAdminNote(e.target.value)} rows={2} className="input-field resize-none" />
          </div>

          {saveMsg && <p className={`text-sm ${saveMsg.startsWith('Error') ? 'text-red-600' : 'text-forest-600'}`}>{saveMsg}</p>}

          <button onClick={saveChanges} disabled={saving} className="btn-primary w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save Changes
          </button>
        </div>

        {/* History */}
        {history.length > 0 && (
          <div className="mt-6">
            <h4 className="mb-2 text-sm font-semibold text-charcoal-700">Status History</h4>
            <div className="space-y-2">
              {history.map((h: any) => (
                <div key={h.id} className="rounded-lg bg-ivory-200 p-3 text-xs">
                  <div className="flex justify-between">
                    <span className="font-medium text-charcoal-700">{STATUS_LABELS[h.status as BookingStatus]}</span>
                    <span className="text-charcoal-400">{formatDateTime(h.created_at)}</span>
                  </div>
                  {h.note && <p className="mt-1 text-charcoal-500">{h.note}</p>}
                  {h.is_internal && <span className="mt-1 inline-block rounded bg-charcoal-100 px-1.5 py-0.5 text-[10px] text-charcoal-400">Internal</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ServicesTab() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Service | null>(null);
  const [creating, setCreating] = useState(false);

  async function loadServices() {
    setLoading(true);
    const { data } = await supabase.from('services').select('*').order('display_order');
    setServices((data as Service[]) || []);
    setLoading(false);
  }

  useEffect(() => { loadServices(); }, []);

  if (loading) return <div className="py-12 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-forest-600" /></div>;

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button onClick={() => setCreating(true)} className="btn-primary text-sm">
          <Plus className="h-4 w-4" /> Add Service
        </button>
      </div>

      <div className="space-y-2">
        {services.map(s => (
          <div key={s.id} className="card flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <img src={s.image_url} alt={s.name} className="h-12 w-12 rounded-lg object-cover" />
              <div>
                <p className="text-sm font-semibold text-charcoal-800">{s.name}</p>
                <p className="text-xs text-charcoal-500">{s.category} • {formatINR(s.starting_price)} • {s.estimated_turnaround}</p>
                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${s.is_available ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {s.is_available ? 'Available' : 'Unavailable'}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditing(s)} className="rounded-lg p-2 text-charcoal-500 hover:bg-ivory-200"><Edit className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>

      {(editing || creating) && (
        <ServiceEditModal
          service={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); loadServices(); }}
        />
      )}
    </div>
  );
}

function ServiceEditModal({ service, onClose, onSaved }: { service: Service | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: service?.name || '',
    slug: service?.slug || '',
    category: service?.category || 'Alterations',
    description: service?.description || '',
    image_url: service?.image_url || '',
    starting_price: service?.starting_price?.toString() || '0',
    estimated_turnaround: service?.estimated_turnaround || '',
    is_available: service?.is_available ?? true,
    display_order: service?.display_order?.toString() || '0',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const data = {
      ...form,
      slug: form.slug || slugify(form.name),
      starting_price: parseFloat(form.starting_price) || 0,
      display_order: parseInt(form.display_order) || 0,
      customization_questions: service?.customization_questions || [],
    };
    let res;
    if (service) {
      res = await supabase.from('services').update(data).eq('id', service.id);
    } else {
      res = await supabase.from('services').insert(data);
    }
    if (res.error) { setError(res.error.message); setSaving(false); return; }
    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal-900/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-ivory-50 p-6 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-charcoal-900">{service ? 'Edit Service' : 'Add Service'}</h3>
          <button onClick={onClose} className="text-charcoal-400 hover:text-charcoal-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3">
          <div><label className="label-field">Name</label><input type="text" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} className="input-field" /></div>
          <div><label className="label-field">Slug (URL)</label><input type="text" value={form.slug} onChange={(e) => setForm({...form, slug: e.target.value})} className="input-field" placeholder="auto-generated from name" /></div>
          <div><label className="label-field">Category</label>
            <select value={form.category} onChange={(e) => setForm({...form, category: e.target.value})} className="input-field">
              <option>Alterations</option><option>Blouse</option><option>Repairs</option><option>Transformation</option><option>Custom</option>
            </select>
          </div>
          <div><label className="label-field">Description</label><textarea value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} rows={3} className="input-field resize-none" /></div>
          <div><label className="label-field">Image URL</label><input type="text" value={form.image_url} onChange={(e) => setForm({...form, image_url: e.target.value})} className="input-field" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label-field">Starting Price</label><input type="number" value={form.starting_price} onChange={(e) => setForm({...form, starting_price: e.target.value})} className="input-field" /></div>
            <div><label className="label-field">Turnaround</label><input type="text" value={form.estimated_turnaround} onChange={(e) => setForm({...form, estimated_turnaround: e.target.value})} className="input-field" placeholder="e.g. 2-4 days" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label-field">Display Order</label><input type="number" value={form.display_order} onChange={(e) => setForm({...form, display_order: e.target.value})} className="input-field" /></div>
            <div><label className="label-field">Available</label>
              <select value={form.is_available ? '1' : '0'} onChange={(e) => setForm({...form, is_available: e.target.value === '1'})} className="input-field">
                <option value="1">Yes</option><option value="0">No</option>
              </select>
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button onClick={save} disabled={saving} className="btn-primary w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {service ? 'Update Service' : 'Create Service'}
          </button>
        </div>
      </div>
    </div>
  );
}

function OperationsTab() {
  const [config, setConfig] = useState<BusinessConfig | null>(null);
  const [areas, setAreas] = useState<ServiceableArea[]>([]);
  const [partners, setPartners] = useState<TailoringPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [newArea, setNewArea] = useState({ pin_code: '', locality: '' });
  const [newPartner, setNewPartner] = useState({ name: '', phone: '', locality: '', specialties: '' });

  useEffect(() => {
    (async () => {
      const [cfgRes, areasRes, partnersRes] = await Promise.all([
        supabase.from('business_config').select('*').eq('id', 1).maybeSingle(),
        supabase.from('serviceable_areas').select('*').order('locality'),
        supabase.from('tailoring_partners').select('*').order('name'),
      ]);
      if (cfgRes.data) setConfig(cfgRes.data as BusinessConfig);
      setAreas((areasRes.data as ServiceableArea[]) || []);
      setPartners((partnersRes.data as TailoringPartner[]) || []);
      setLoading(false);
    })();
  }, []);

  async function saveConfig() {
    if (!config) return;
    setSaving(true);
    const { error } = await supabase.from('business_config').update({
      brand_name: config.brand_name, tagline: config.tagline, whatsapp_number: config.whatsapp_number,
      contact_email: config.contact_email, business_hours: config.business_hours,
      pickup_delivery_fee: config.pickup_delivery_fee, free_delivery_threshold: config.free_delivery_threshold,
      cancellation_policy: config.cancellation_policy, privacy_policy_text: config.privacy_policy_text,
      terms_text: config.terms_text, facebook_url: config.facebook_url, instagram_url: config.instagram_url,
      twitter_url: config.twitter_url, service_area_note: config.service_area_note,
    }).eq('id', 1);
    setSaving(false);
    setSaveMsg(error ? 'Error: ' + error.message : 'Saved successfully.');
    setTimeout(() => setSaveMsg(null), 2000);
  }

  async function addArea() {
    if (!newArea.pin_code) return;
    const { data } = await supabase.from('serviceable_areas').insert({ pin_code: newArea.pin_code, locality: newArea.locality, is_active: true }).select();
    if (data) { setAreas([...areas, data[0] as ServiceableArea]); setNewArea({ pin_code: '', locality: '' }); }
  }

  async function toggleArea(area: ServiceableArea) {
    const { data } = await supabase.from('serviceable_areas').update({ is_active: !area.is_active }).eq('id', area.id).select();
    if (data) setAreas(areas.map(a => a.id === area.id ? data[0] as ServiceableArea : a));
  }

  async function deleteArea(id: string) {
    await supabase.from('serviceable_areas').delete().eq('id', id);
    setAreas(areas.filter(a => a.id !== id));
  }

  async function addPartner() {
    if (!newPartner.name) return;
    const { data } = await supabase.from('tailoring_partners').insert({ ...newPartner, is_active: true }).select();
    if (data) { setPartners([...partners, data[0] as TailoringPartner]); setNewPartner({ name: '', phone: '', locality: '', specialties: '' }); }
  }

  async function deletePartner(id: string) {
    await supabase.from('tailoring_partners').delete().eq('id', id);
    setPartners(partners.filter(p => p.id !== id));
  }

  if (loading) return <div className="py-12 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-forest-600" /></div>;
  if (!config) return <p className="text-sm text-red-600">Could not load configuration.</p>;

  return (
    <div className="space-y-6">
      {/* Business Config */}
      <div className="card p-5">
        <h3 className="mb-4 text-sm font-semibold text-charcoal-700">Business Configuration</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label-field">Brand Name</label><input type="text" value={config.brand_name} onChange={(e) => setConfig({...config, brand_name: e.target.value})} className="input-field" /></div>
          <div><label className="label-field">Tagline</label><input type="text" value={config.tagline} onChange={(e) => setConfig({...config, tagline: e.target.value})} className="input-field" /></div>
          <div><label className="label-field">WhatsApp Number</label><input type="text" value={config.whatsapp_number} onChange={(e) => setConfig({...config, whatsapp_number: e.target.value})} className="input-field" placeholder="e.g. +91 9876543210" /></div>
          <div><label className="label-field">Contact Email</label><input type="email" value={config.contact_email} onChange={(e) => setConfig({...config, contact_email: e.target.value})} className="input-field" /></div>
          <div><label className="label-field">Business Hours</label><input type="text" value={config.business_hours} onChange={(e) => setConfig({...config, business_hours: e.target.value})} className="input-field" /></div>
          <div><label className="label-field">Pickup/Delivery Fee</label><input type="number" value={config.pickup_delivery_fee} onChange={(e) => setConfig({...config, pickup_delivery_fee: parseFloat(e.target.value) || 0})} className="input-field" /></div>
          <div className="sm:col-span-2"><label className="label-field">Service Area Note</label><input type="text" value={config.service_area_note} onChange={(e) => setConfig({...config, service_area_note: e.target.value})} className="input-field" /></div>
          <div className="sm:col-span-2"><label className="label-field">Cancellation Policy</label><textarea value={config.cancellation_policy} onChange={(e) => setConfig({...config, cancellation_policy: e.target.value})} rows={2} className="input-field resize-none" /></div>
          <div><label className="label-field">Facebook URL</label><input type="text" value={config.facebook_url} onChange={(e) => setConfig({...config, facebook_url: e.target.value})} className="input-field" /></div>
          <div><label className="label-field">Instagram URL</label><input type="text" value={config.instagram_url} onChange={(e) => setConfig({...config, instagram_url: e.target.value})} className="input-field" /></div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button onClick={saveConfig} disabled={saving} className="btn-primary text-sm">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save Config
          </button>
          {saveMsg && <span className={`text-sm ${saveMsg.startsWith('Error') ? 'text-red-600' : 'text-forest-600'}`}>{saveMsg}</span>}
        </div>
      </div>

      {/* Serviceable Areas */}
      <div className="card p-5">
        <h3 className="mb-4 text-sm font-semibold text-charcoal-700">Serviceable Areas</h3>
        <div className="mb-3 flex flex-wrap gap-2">
          <input type="text" placeholder="PIN code" value={newArea.pin_code} onChange={(e) => setNewArea({...newArea, pin_code: e.target.value})} className="input-field max-w-[120px]" />
          <input type="text" placeholder="Locality" value={newArea.locality} onChange={(e) => setNewArea({...newArea, locality: e.target.value})} className="input-field max-w-[200px]" />
          <button onClick={addArea} className="btn-secondary text-sm"><Plus className="h-4 w-4" /> Add</button>
        </div>
        <div className="space-y-2">
          {areas.length === 0 ? <p className="text-sm text-charcoal-400">No areas configured yet.</p> : areas.map(a => (
            <div key={a.id} className="flex items-center justify-between rounded-lg bg-ivory-200 p-3 text-sm">
              <div>
                <span className="font-medium text-charcoal-800">{a.pin_code}</span>
                <span className="text-charcoal-500"> — {a.locality || 'N/A'}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleArea(a)} className={`rounded-full px-2 py-0.5 text-xs ${a.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {a.is_active ? 'Active' : 'Inactive'}
                </button>
                <button onClick={() => deleteArea(a.id)} className="text-charcoal-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tailoring Partners */}
      <div className="card p-5">
        <h3 className="mb-4 text-sm font-semibold text-charcoal-700">Tailoring Partners</h3>
        <div className="mb-3 grid gap-2 sm:grid-cols-4">
          <input type="text" placeholder="Name" value={newPartner.name} onChange={(e) => setNewPartner({...newPartner, name: e.target.value})} className="input-field" />
          <input type="text" placeholder="Phone" value={newPartner.phone} onChange={(e) => setNewPartner({...newPartner, phone: e.target.value})} className="input-field" />
          <input type="text" placeholder="Locality" value={newPartner.locality} onChange={(e) => setNewPartner({...newPartner, locality: e.target.value})} className="input-field" />
          <button onClick={addPartner} className="btn-secondary text-sm"><Plus className="h-4 w-4" /> Add</button>
        </div>
        <div className="space-y-2">
          {partners.length === 0 ? <p className="text-sm text-charcoal-400">No partners configured yet.</p> : partners.map(p => (
            <div key={p.id} className="flex items-center justify-between rounded-lg bg-ivory-200 p-3 text-sm">
              <div>
                <span className="font-medium text-charcoal-800">{p.name}</span>
                <span className="text-charcoal-500"> — {p.phone || 'No phone'} • {p.locality || 'N/A'}</span>
              </div>
              <button onClick={() => deletePartner(p.id)} className="text-charcoal-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
