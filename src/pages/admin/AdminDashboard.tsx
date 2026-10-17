import { useState, useEffect, useCallback } from 'react';
import { LayoutDashboard, Scissors, Settings, LogOut, Loader2, ShieldAlert, Plus, Edit, Trash2, X, Download, ChevronRight, Bell, Clock, ClipboardList, UserPlus, RefreshCw, Users, XCircle, AlertTriangle, Send, PauseCircle, PlayCircle, Truck, MessageSquare, Mail, Phone, Check, Archive } from 'lucide-react';
import { DeliveryTab, DeliveryTeamSection, type DeliveryAgentRow, type DeliveryExceptionRow } from './DeliveryTab';
import { useRouter } from '@/lib/router';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { STATUS_LABELS, STATUS_FLOW, PAYMENT_LABELS, formatINR } from '@/lib/constants';
import { formatDateTime, formatDate, slugify } from '@/lib/utils';
import type { Booking, BookingItem, BookingStatusHistory, Service, BusinessConfig, ServiceableArea, TailoringPartner, TailorApplication, TailorApplicationStatus, BookingStatus, PaymentStatus } from '@/lib/types';

interface EligibilityRow {
  partner_id: string;
  partner_name: string;
  partner_code: string | null;
  partner_locality: string;
  partner_phone: string;
  eligible: boolean;
  reasons: string[];
  match_score: number;
}

interface DeclineRow {
  offer_id: string;
  booking_id: string;
  booking_reference: string;
  partner_name: string;
  status: string;
  decline_reason: string | null;
  responded_at: string;
}

type AdminTab = 'overview' | 'bookings' | 'applications' | 'delivery' | 'messages' | 'services' | 'operations';

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
        (payload: { new: Booking }) => {
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
    { key: 'applications', label: 'Applications', icon: ClipboardList },
    { key: 'delivery', label: 'Delivery', icon: Truck },
    { key: 'messages', label: 'Messages', icon: MessageSquare },
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
            {tab === 'applications' && <ApplicationsTab />}
            {tab === 'delivery' && <DeliveryTabWrapper />}
            {tab === 'messages' && <MessagesTab />}
            {tab === 'services' && <ServicesTab />}
            {tab === 'operations' && <OperationsTab />}
          </div>
        </div>
      </div>
    </div>
  );
}

function DeliveryTabWrapper() {
  const [agents, setAgents] = useState<DeliveryAgentRow[]>([]);
  const [exceptions, setExceptions] = useState<DeliveryExceptionRow[]>([]);

  const loadAgents = useCallback(async () => {
    const { data } = await supabase.rpc('admin_list_delivery_agents');
    setAgents((data as unknown as DeliveryAgentRow[]) || []);
  }, []);

  const loadExceptions = useCallback(async () => {
    const { data } = await supabase.rpc('admin_pending_delivery_exceptions');
    setExceptions((data as unknown as DeliveryExceptionRow[]) || []);
  }, []);

  useEffect(() => { loadAgents(); loadExceptions(); }, [loadAgents, loadExceptions]);

  // Surface failed/exception tasks on the overview strip; DeliveryTab shows its own copy.
  return (
    <div className="space-y-6">
      {exceptions.length > 0 && (
        <div className="animate-fade-in rounded-xl bg-amber-50 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600" />
            <p className="text-sm font-semibold text-amber-800">
              {exceptions.length} delivery task{exceptions.length > 1 ? 's' : ''} failed or flagged — see the task list below.
            </p>
          </div>
        </div>
      )}
      <DeliveryTab />
      <DeliveryTeamSection agents={agents} onAgentsChanged={loadAgents} />
    </div>
  );
}

interface ContactMessageRow {
  id: string;
  name: string;
  phone: string;
  message: string;
  status: 'new' | 'handled';
  created_at: string;
}

function MessagesTab() {
  const [messages, setMessages] = useState<ContactMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showHandled, setShowHandled] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('contact_messages')
      .select('id, name, phone, message, status, created_at')
      .order('created_at', { ascending: false });
    if (data) setMessages(data as ContactMessageRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('contact-messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'contact_messages' },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  async function markHandled(id: string, handled: boolean) {
    setBusyId(id);
    await supabase
      .from('contact_messages')
      .update({ status: handled ? 'handled' : 'new', handled_at: handled ? new Date().toISOString() : null })
      .eq('id', id);
    setBusyId(null);
    load();
  }

  const visible = showHandled ? messages : messages.filter((m) => m.status === 'new');
  const newCount = messages.filter((m) => m.status === 'new').length;

  if (loading) return <div className="py-12 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-forest-600" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-charcoal-500">
          Messages from the Contact page. Reply by phone or WhatsApp — the sender's number is on each message.
        </p>
        <label className="flex flex-shrink-0 cursor-pointer items-center gap-2 text-sm text-charcoal-600">
          <input type="checkbox" checked={showHandled} onChange={(e) => setShowHandled(e.target.checked)} className="h-4 w-4 rounded border-charcoal-300" />
          Show handled
        </label>
      </div>

      {newCount > 0 && !showHandled && (
        <div className="animate-fade-in rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-800">
          {newCount} new message{newCount > 1 ? 's' : ''} waiting for a reply.
        </div>
      )}

      {visible.length === 0 ? (
        <div className="card p-10 text-center text-sm text-charcoal-500">
          No messages yet. When a customer sends one from the Contact page, it appears here instantly.
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((m) => (
            <div
              key={m.id}
              className={`card p-4 ${m.status === 'new' ? 'border-l-4 border-l-terracotta-500' : 'opacity-70'}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-charcoal-900">{m.name}</p>
                    {m.status === 'new' ? (
                      <span className="rounded-full bg-terracotta-100 px-2 py-0.5 text-xs font-medium text-terracotta-700">New</span>
                    ) : (
                      <span className="rounded-full bg-forest-100 px-2 py-0.5 text-xs font-medium text-forest-700">Handled</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-charcoal-400">{formatDateTime(m.created_at)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <a href={`tel:${m.phone}`} className="btn-ghost text-xs"><Phone className="h-3.5 w-3.5" /> {m.phone}</a>
                  {(() => {
                    const wa = m.phone.replace(/\D/g, '');
                    return wa.length >= 10 && (
                      <a
                        href={`https://wa.me/${wa.length === 10 ? '91' + wa : wa}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-ghost text-xs"
                      >
                        <Mail className="h-3.5 w-3.5" /> WhatsApp
                      </a>
                    );
                  })()}
                  <button
                    onClick={() => markHandled(m.id, m.status === 'new')}
                    disabled={busyId === m.id}
                    className="btn-primary text-xs"
                  >
                    {busyId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : m.status === 'new' ? <Check className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                    {m.status === 'new' ? 'Mark handled' : 'Reopen'}
                  </button>
                </div>
              </div>
              <p className="mt-3 whitespace-pre-wrap rounded-lg bg-ivory-200 p-3 text-sm text-charcoal-700">{m.message}</p>
            </div>
          ))}
        </div>
      )}
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
  const [declines, setDeclines] = useState<DeclineRow[]>([]);

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

  async function loadDeclines() {
    const { data } = await supabase.rpc('admin_pending_declines');
    if (data) setDeclines((data as unknown as DeclineRow[]) || []);
  }

  useEffect(() => {
    loadData();
    loadDeclines();
    // Auto-refresh every 30 seconds as fallback
    const interval = setInterval(() => { loadData(); loadDeclines(); }, 30000);

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
      {/* Declined / expired offers needing reassignment */}
      {declines.length > 0 && (
        <div className="animate-fade-in rounded-xl bg-amber-50 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600" />
            <p className="text-sm font-semibold text-amber-800">
              {declines.length} offer{declines.length > 1 ? 's' : ''} declined or expired in the last 7 days — reassignment needed:
            </p>
          </div>
          <ul className="mt-2 space-y-1">
            {declines.map((d) => (
              <li key={d.offer_id} className="text-xs text-amber-800">
                <span className="font-semibold">{d.booking_reference}</span> — {d.partner_name} ({d.status})
                {d.decline_reason ? `: “${d.decline_reason}”` : ''}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-700">Open each booking in the Bookings tab and send an offer to a different partner.</p>
        </div>
      )}

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
  const [items, setItems] = useState<BookingItem[]>([]);
  const [history, setHistory] = useState<BookingStatusHistory[]>([]);

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
    const [itemsRes, histRes] = await Promise.all([
      supabase.from('booking_items').select('*').eq('booking_id', booking.id),
      supabase.from('booking_status_history').select('*').eq('booking_id', booking.id).order('created_at'),
    ]);
    setItems(itemsRes.data || []);
    setHistory(histRes.data || []);
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
          onClose={() => setSelected(null)}
          onUpdate={() => { loadBookings(); }}
        />
      )}
    </div>
  );
}

function BookingDetailModal({
  booking, items, history, onClose, onUpdate,
}: {
  booking: Booking; items: BookingItem[]; history: BookingStatusHistory[];
  onClose: () => void; onUpdate: () => void;
}) {
  const [status, setStatus] = useState<BookingStatus>(booking.status);
  const [confirmedAmount, setConfirmedAmount] = useState(booking.confirmed_amount?.toString() || '');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(booking.payment_status);
  const [adminNote, setAdminNote] = useState(booking.admin_notes);
  const [historyNote, setHistoryNote] = useState('');
  const [isInternal, setIsInternal] = useState(true);
  const [cancelReason, setCancelReason] = useState(booking.cancellation_reason);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [photos, setPhotos] = useState<{ id: string; url: string | null; original_name: string; file_size: number }[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setPhotosLoading(true);
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const { data: sessionData } = await supabase.auth.getSession();
      const jwt = sessionData.session?.access_token || supabaseAnonKey;
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/booking-photo-access`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}` },
          body: JSON.stringify({ action: 'list', booking_id: booking.id }),
        });
        if (res.ok) {
          const json = await res.json() as { photos?: { id: string; url: string | null; original_name: string; file_size: number }[] };
          setPhotos(json.photos || []);
        }
      } finally {
        setPhotosLoading(false);
      }
    })();
  }, [booking.id]);

  async function saveChanges() {
    setSaving(true);
    setSaveMsg(null);
    const amountTrim = confirmedAmount.trim();
    let parsedAmount: number | null = null;
    if (amountTrim) {
      parsedAmount = parseFloat(amountTrim);
      if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
        setSaveMsg('Error: Enter a valid amount (e.g. 1250).');
        setSaving(false);
        return;
      }
    }
    const updates: Record<string, string | number | null> = {
      status,
      payment_status: paymentStatus,
      admin_notes: adminNote,
    };
    if (parsedAmount !== null) updates.confirmed_amount = parsedAmount;
    if (status === 'cancelled' && cancelReason) updates.cancellation_reason = cancelReason;

    const { error } = await supabase.from('bookings').update(updates).eq('id', booking.id);
    if (error) {
      setSaveMsg('Error: ' + error.message + ' — your input is kept, please try again.');
      setSaving(false);
      return;
    }

    if (status !== booking.status && historyNote) {
      await supabase.from('booking_status_history').insert({
        booking_id: booking.id, status, note: historyNote, is_internal: isInternal, created_by: booking.user_id,
      });
    } else if (status !== booking.status) {
      await supabase.from('booking_status_history').insert({
        booking_id: booking.id, status, note: `Status updated to ${STATUS_LABELS[status]}`, is_internal: true,
      });
    }

    // Reload the saved row from the database and display what was actually stored
    const { data: saved } = await supabase
      .from('bookings')
      .select('confirmed_amount, status, payment_status')
      .eq('id', booking.id)
      .maybeSingle();
    if (saved) {
      setConfirmedAmount(saved.confirmed_amount !== null ? String(saved.confirmed_amount) : '');
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

        {/* Garment Photos */}
        {photosLoading ? (
          <div className="mb-4 flex items-center gap-2 text-sm text-charcoal-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading photos…</div>
        ) : photos.length > 0 ? (
          <div className="mb-4">
            <h4 className="mb-2 text-sm font-semibold text-charcoal-700">Garment Photos</h4>
            <div className="flex flex-wrap gap-2">
              {photos.map((p) => (
                <a key={p.id} href={p.url || '#'} target="_blank" rel="noopener noreferrer">
                  <img src={p.url || ''} alt={p.original_name || 'Garment photo'} className="h-20 w-20 rounded-lg object-cover transition-opacity hover:opacity-80" />
                </a>
              ))}
            </div>
          </div>
        ) : null}

        {/* Items */}
        {items.length > 0 && (
          <div className="mb-4">
            <h4 className="mb-2 text-sm font-semibold text-charcoal-700">Services</h4>
            <div className="space-y-2">
              {items.map((item) => (
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

        {/* Assignment */}
        <div className="mt-6">
          <AssignmentPanel booking={booking} onChanged={onUpdate} />
        </div>

        {/* History */}
        {history.length > 0 && (
          <div className="mt-6">
            <h4 className="mb-2 text-sm font-semibold text-charcoal-700">Status History</h4>
            <div className="space-y-2">
              {history.map((h) => (
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

function ApplicationsTab() {
  const [applications, setApplications] = useState<TailorApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | TailorApplicationStatus>('pending');
  const [selected, setSelected] = useState<TailorApplication | null>(null);
  const [partners, setPartners] = useState<TailoringPartner[]>([]);

  async function load() {
    setLoading(true);
    let query = supabase.from('tailor_applications').select('*').order('created_at', { ascending: false });
    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    const { data } = await query.limit(100);
    setApplications((data as TailorApplication[]) || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [statusFilter]);

  useEffect(() => {
    supabase.from('tailoring_partners').select('id, name').then(({ data }) => setPartners((data as TailoringPartner[]) || []));
  }, []);

  const APP_STATUS_STYLES: Record<TailorApplicationStatus, string> = {
    pending: 'bg-terracotta-100 text-terracotta-700',
    under_review: 'bg-yellow-100 text-yellow-700',
    more_info_required: 'bg-blue-100 text-blue-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
  };

  const pendingCount = applications.filter((a) => a.status === 'pending').length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="input-field max-w-xs">
          <option value="all">All applications</option>
          <option value="pending">Pending ({pendingCount} shown)</option>
          <option value="under_review">Under review</option>
          <option value="more_info_required">More info required</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <button onClick={load} className="btn-secondary text-sm"><RefreshCw className="h-4 w-4" /> Refresh</button>
      </div>

      {loading ? (
        <div className="py-12 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-forest-600" /></div>
      ) : applications.length === 0 ? (
        <div className="card p-12 text-center">
          <ClipboardList className="mx-auto mb-3 h-10 w-10 text-charcoal-300" />
          <p className="text-sm text-charcoal-500">No applications with this status.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {applications.map((a) => (
            <button key={a.id} onClick={() => setSelected(a)} className="card flex w-full items-center justify-between p-4 text-left hover:shadow-elevated transition-all">
              <div>
                <p className="text-sm font-semibold text-forest-700">{a.application_reference}</p>
                <p className="text-xs text-charcoal-500">{a.full_name} • {a.mobile} • {a.locality || 'No locality'}</p>
                <p className="text-xs text-charcoal-400">{formatDateTime(a.created_at)}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${APP_STATUS_STYLES[a.status]}`}>{a.status.replace(/_/g, ' ')}</span>
                <ChevronRight className="h-4 w-4 text-charcoal-400" />
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <ApplicationReviewModal
          application={selected}
          partners={partners}
          onClose={() => setSelected(null)}
          onChanged={() => { setSelected(null); load(); }}
        />
      )}
    </div>
  );
}

function ApplicationReviewModal({
  application, partners, onClose, onChanged,
}: {
  application: TailorApplication; partners: TailoringPartner[];
  onClose: () => void; onChanged: () => void;
}) {
  const [notes, setNotes] = useState(application.review_notes);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState(false);
  const [onboardEmail, setOnboardEmail] = useState(application.email || '');
  const [onboardPassword, setOnboardPassword] = useState('');
  const [activity, setActivity] = useState<{ id: string; action: string; details: string; created_at: string }[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('partner_activity_list');
      if (data) setActivity(data as { id: string; action: string; details: string; created_at: string }[]);
    })();
  }, []);

  async function review(newStatus: TailorApplicationStatus) {
    setSaving(true);
    setMsg(null);
    const { data } = await supabase.rpc('admin_review_application', {
      p_app_id: application.id, p_new_status: newStatus, p_notes: notes,
    });
    setSaving(false);
    if (data?.error) { setMsg('Error: ' + data.error); return; }
    onChanged();
  }

  async function onboard() {
    setMsg(null);
    if (!onboardEmail || onboardPassword.length < 8) {
      setMsg('Enter an email and a password of at least 8 characters.');
      return;
    }
    setSaving(true);
    const { data: createRes, error: createErr } = await supabase.auth.admin.createUser({
      email: onboardEmail,
      password: onboardPassword,
      email_confirm: true,
    });
    if (createErr || !createRes?.user) {
      setSaving(false);
      setMsg('Could not create the login: ' + (createErr?.message || 'unknown error'));
      return;
    }
    const { data: linkRes } = await supabase.rpc('link_partner_account', {
      p_app_id: application.id, p_auth_user_id: createRes.user.id,
    });
    setSaving(false);
    if (linkRes?.error) {
      setMsg('Login created, but linking failed: ' + linkRes.error + '. Ask technical support to link partner ' + application.application_reference + '.');
      return;
    }
    setOnboarding(false);
    onChanged();
  }

  async function markOnboarded() {
    // A partner was created outside this flow (e.g. already had a login); just close.
    onChanged();
  }

  const linkedPartner = partners.find((p) => p.name === application.full_name);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal-900/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-ivory-50 p-6 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-charcoal-900">Application {application.application_reference}</h3>
            <p className="text-xs text-charcoal-400">Status: {application.status.replace(/_/g, ' ')}</p>
          </div>
          <button onClick={onClose} className="text-charcoal-400 hover:text-charcoal-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="mb-4 grid gap-3 rounded-xl bg-ivory-200 p-4 text-sm sm:grid-cols-2">
          <div><p className="text-xs text-charcoal-400">Name</p><p className="font-medium">{application.full_name}</p></div>
          <div><p className="text-xs text-charcoal-400">Mobile</p><p className="font-medium">{application.mobile}</p></div>
          <div><p className="text-xs text-charcoal-400">Email</p><p className="font-medium">{application.email || '—'}</p></div>
          <div><p className="text-xs text-charcoal-400">Locality</p><p className="font-medium">{application.locality || '—'}</p></div>
          <div><p className="text-xs text-charcoal-400">Service areas</p><p className="font-medium">{application.service_areas || '—'}</p></div>
          <div><p className="text-xs text-charcoal-400">Experience</p><p className="font-medium">{application.experience_years || '—'}</p></div>
          <div><p className="text-xs text-charcoal-400">Services offered</p><p className="font-medium">{application.services_offered || '—'}</p></div>
          <div><p className="text-xs text-charcoal-400">Equipment</p><p className="font-medium">{application.equipment || '—'}</p></div>
          <div><p className="text-xs text-charcoal-400">Expected rates</p><p className="font-medium">{application.expected_rates || '—'}</p></div>
          <div><p className="text-xs text-charcoal-400">ID ({application.verification_id_type || 'n/a'})</p><p className="font-medium">{application.verification_id_number || '—'}</p></div>
          {application.portfolio_urls && <div className="sm:col-span-2"><p className="text-xs text-charcoal-400">Portfolio</p><a href={application.portfolio_urls} target="_blank" rel="noopener noreferrer" className="font-medium text-forest-700 underline">{application.portfolio_urls}</a></div>}
          {application.notes_from_tailor && <div className="sm:col-span-2"><p className="text-xs text-charcoal-400">Notes from tailor</p><p className="font-medium">{application.notes_from_tailor}</p></div>}
        </div>

        <div className="space-y-3">
          <div>
            <label className="label-field">Internal review notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="input-field resize-none" placeholder="Notes for the team (saved with each review action)..." />
          </div>

          {msg && <p className={`text-sm ${msg.startsWith('Error') || msg.startsWith('Could not') || msg.startsWith('Login created') ? 'text-red-600' : 'text-forest-600'}`}>{msg}</p>}

          {application.status === 'approved' && !linkedPartner && !onboarding && (
            <div className="rounded-xl bg-forest-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-forest-700">
                <UserPlus className="h-4 w-4" /> Onboard this tailor
              </div>
              <p className="mt-1 text-xs text-forest-600">
                Creates a partner login and links it to this application. Share the password with the tailor over phone.
              </p>
              <button onClick={() => setOnboarding(true)} className="btn-primary mt-3 text-sm">Start onboarding</button>
            </div>
          )}

          {application.status === 'approved' && linkedPartner && (
            <div className="rounded-xl bg-green-50 p-4 text-sm text-green-700">
              Partner account exists: <strong>{linkedPartner.name}</strong>{linkedPartner.partner_code ? ` (${linkedPartner.partner_code})` : ''}.
              They can sign in and see their dashboard.
            </div>
          )}

          {onboarding && (
            <div className="space-y-3 rounded-xl bg-ivory-200 p-4">
              <div><label className="label-field">Login email</label><input type="email" value={onboardEmail} onChange={(e) => setOnboardEmail(e.target.value)} className="input-field" /></div>
              <div><label className="label-field">Temporary password (min 8 chars)</label><input type="text" value={onboardPassword} onChange={(e) => setOnboardPassword(e.target.value)} className="input-field" /></div>
              <div className="flex gap-2">
                <button onClick={onboard} disabled={saving} className="btn-primary text-sm">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create login &amp; link
                </button>
                <button onClick={() => setOnboarding(false)} className="btn-ghost text-sm">Cancel</button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button onClick={() => review('under_review')} disabled={saving} className="btn-secondary text-sm">Mark under review</button>
            <button onClick={() => review('more_info_required')} disabled={saving} className="btn-secondary text-sm">Request more info</button>
            <button onClick={() => review('approved')} disabled={saving} className="btn-primary text-sm">Approve</button>
            <button onClick={() => review('rejected')} disabled={saving} className="btn-secondary text-sm !border-red-300 !text-red-700 hover:!bg-red-50">Reject</button>
          </div>
          <p className="text-xs text-charcoal-400">
            Approving does not create an account automatically — use onboarding above to create the partner login.
          </p>
        </div>

        {activity.length > 0 && (
          <div className="mt-6">
            <h4 className="mb-2 text-sm font-semibold text-charcoal-700">Audit trail (all partner activity)</h4>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {activity.slice(0, 20).map((a) => (
                <div key={a.id} className="rounded-lg bg-ivory-200 p-2 text-xs">
                  <span className="font-medium text-charcoal-700">{a.action.replace(/_/g, ' ')}</span>
                  <span className="text-charcoal-400"> — {formatDateTime(a.created_at)}</span>
                  {a.details && <p className="text-charcoal-500">{a.details}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {application.status === 'approved' && linkedPartner && (
          <button onClick={markOnboarded} className="btn-ghost mt-4 w-full text-sm">Close</button>
        )}
      </div>
    </div>
  );
}

function AssignmentPanel({ booking, onChanged }: { booking: Booking; onChanged: () => void }) {
  const [rows, setRows] = useState<EligibilityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('partner_matches_booking', { p_booking_id: booking.id });
    if (error) { setMsg('Could not load partner eligibility: ' + error.message); setRows([]); }
    else setRows((data as unknown as EligibilityRow[]) || []);
    setLoading(false);
  }, [booking.id]);

  useEffect(() => { load(); }, [load]);

  async function assign(partnerId: string, partnerName: string) {
    setAssigning(partnerId);
    setMsg(null);
    const { data: assignRes } = await supabase.rpc('admin_assign_booking', {
      p_booking_id: booking.id, p_partner_id: partnerId, p_note: note.trim(),
    });
    if (assignRes?.error) {
      setAssigning(null);
      setMsg('Assignment failed: ' + (assignRes.message || assignRes.error));
      return;
    }

    // Best-effort notification; never blocks the assignment.
    let notifyText = '';
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/partner-offer-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ offer_id: assignRes.offer_id }),
      });
      const json = await res.json().catch(() => null) as { notified?: boolean; detail?: string } | null;
      if (json?.notified) notifyText = ' Partner notified by email.';
      else if (json?.detail) notifyText = ` Note: partner email not sent (${json.detail}). They will still see the offer in their dashboard.`;
      else notifyText = ' Note: partner email not sent — they will still see the offer in their dashboard.';
    } catch {
      notifyText = ' Note: partner email not sent — they will still see the offer in their dashboard.';
    }

    setAssigning(null);
    setNote('');
    setMsg(`Order offered to ${partnerName}.${notifyText}`);
    load();
    onChanged();
  }

  const eligible = rows.filter((r) => r.eligible);
  const excluded = rows.filter((r) => !r.eligible);
  const visible = showAll ? rows : eligible;

  return (
    <div className="rounded-xl border border-ivory-300 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-charcoal-700">
          <Users className="h-4 w-4" /> Assign a Tailoring Partner
        </h4>
        <button onClick={load} className="btn-ghost text-xs"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
      </div>

      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="input-field mb-3"
        placeholder="Optional note for the partner (e.g. customer prefers evening pickup)"
        maxLength={300}
      />

      {msg && <p className={`mb-3 text-sm ${msg.startsWith('Assignment failed') ? 'text-red-600' : 'text-forest-600'}`}>{msg}</p>}

      {loading ? (
        <div className="py-6 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-forest-600" /></div>
      ) : rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-charcoal-500">
          No tailoring partners exist yet. Approve applications in the Applications tab to onboard partners.
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((r) => (
            <div key={r.partner_id} className={`rounded-lg p-3 text-sm ${r.eligible ? 'bg-forest-50' : 'bg-ivory-200 opacity-80'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-charcoal-800">
                    {r.partner_name}
                    {r.partner_code && <span className="ml-1.5 text-xs text-charcoal-400">{r.partner_code}</span>}
                  </p>
                  <p className="text-xs text-charcoal-500">{r.partner_locality || 'Locality not recorded'} • {r.partner_phone || 'No phone'}</p>
                </div>
                {r.eligible ? (
                  <button
                    onClick={() => assign(r.partner_id, r.partner_name)}
                    disabled={assigning !== null}
                    className="btn-primary text-xs"
                  >
                    {assigning === r.partner_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    {assigning === r.partner_id ? 'Offering…' : 'Send Offer'}
                  </button>
                ) : (
                  <span className="flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
                    <XCircle className="h-3.5 w-3.5" /> Excluded
                  </span>
                )}
              </div>
              {r.reasons?.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {r.reasons.map((reason, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs">
                      {reason.startsWith('Excluded:') ? <XCircle className="mt-0.5 h-3 w-3 flex-shrink-0 text-red-500" /> : <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0 text-amber-500" />}
                      <span className={reason.startsWith('Excluded:') ? 'text-red-600' : 'text-amber-700'}>{reason.replace(/^Excluded: |^Note: /, '')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          {excluded.length > 0 && (
            <button onClick={() => setShowAll(!showAll)} className="btn-ghost text-xs">
              {showAll ? 'Show eligible only' : `Show ${excluded.length} excluded partner${excluded.length > 1 ? 's' : ''} with reasons`}
            </button>
          )}
        </div>
      )}
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
  const [editingPartner, setEditingPartner] = useState<TailoringPartner | null>(null);

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

  // kept intentionally: removing partners is a deliberate admin action reachable from the partners list

  async function deletePartner(id: string) {
    await supabase.from('tailoring_partners').delete().eq('id', id);
    setPartners(partners.filter(p => p.id !== id));
  }
  void deletePartner;

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
            <div key={p.id} className="rounded-lg bg-ivory-200 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium text-charcoal-800">
                    {p.name}
                    {p.partner_code && <span className="text-xs text-charcoal-400">{p.partner_code}</span>}
                    <button
                      onClick={async () => {
                        const { data } = await supabase.from('tailoring_partners').update({ is_accepting_orders: !p.is_accepting_orders }).eq('id', p.id).select();
                        if (data) setPartners(partners.map(x => x.id === p.id ? data[0] as TailoringPartner : x));
                      }}
                      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${p.is_accepting_orders ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                      title="Toggle whether this partner receives new offers"
                    >
                      {p.is_accepting_orders ? <PlayCircle className="h-3 w-3" /> : <PauseCircle className="h-3 w-3" />}
                      {p.is_accepting_orders ? 'Accepting orders' : 'Paused'}
                    </button>
                  </p>
                  <p className="truncate text-xs text-charcoal-500">
                    {p.phone || 'No phone'} • {p.locality || 'No locality'}
                    {p.service_pin_codes ? ` • PINs: ${p.service_pin_codes}` : ' • No PIN coverage recorded'}
                    {p.capabilities ? ` • ${p.capabilities}` : ' • No capabilities recorded'}
                  </p>
                </div>
                <button onClick={() => setEditingPartner(p)} className="rounded-lg p-2 text-charcoal-400 hover:text-forest-700" title="Edit coverage & capabilities">
                  <Edit className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editingPartner && (
        <PartnerCoverageModal
          partner={editingPartner}
          onClose={() => setEditingPartner(null)}
          onSaved={(updated) => {
            setPartners(partners.map(x => x.id === updated.id ? updated : x));
            setEditingPartner(null);
          }}
        />
      )}
    </div>
  );
}

function PartnerCoverageModal({ partner, onClose, onSaved }: { partner: TailoringPartner; onClose: () => void; onSaved: (p: TailoringPartner) => void }) {
  const [pinCodes, setPinCodes] = useState(partner.service_pin_codes || '');
  const [capabilities, setCapabilities] = useState(partner.capabilities || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const { data, error: updateError } = await supabase
      .from('tailoring_partners')
      .update({ service_pin_codes: pinCodes.trim(), capabilities: capabilities.trim() })
      .eq('id', partner.id)
      .select();
    setSaving(false);
    if (updateError || !data) { setError(updateError?.message || 'Could not save.'); return; }
    onSaved(data[0] as TailoringPartner);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-ivory-50 p-6 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-charcoal-900">Coverage & Skills — {partner.name}</h3>
          <button onClick={onClose} className="text-charcoal-400 hover:text-charcoal-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="label-field">Service PIN codes (comma-separated)</label>
            <input type="text" value={pinCodes} onChange={(e) => setPinCodes(e.target.value)} className="input-field" placeholder="e.g. 500081, 500034, 500003" />
            <p className="mt-1 text-xs text-charcoal-400">Used to match bookings by pickup PIN. Leave blank if the partner serves everywhere.</p>
          </div>
          <div>
            <label className="label-field">Capabilities</label>
            <input type="text" value={capabilities} onChange={(e) => setCapabilities(e.target.value)} className="input-field" placeholder="e.g. blouse, alterations, repairs, kurti" />
            <p className="mt-1 text-xs text-charcoal-400">Used to match bookings by service. Leave blank if the partner can take any service.</p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button onClick={save} disabled={saving} className="btn-primary w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
          </button>
        </div>
      </div>
    </div>
  );
}
