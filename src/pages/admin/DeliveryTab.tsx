import { useState, useEffect, useCallback } from 'react';
import {
  Truck, Loader2, RefreshCw, Plus, X, AlertTriangle, CheckCircle2,
  XCircle, RotateCcw, ChevronRight, KeyRound, History,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatDateTime, formatDate } from '@/lib/utils';
import type { Booking } from '@/lib/types';

export interface DeliveryAgentRow {
  id: string;
  name: string;
  phone: string;
  agent_code: string | null;
  service_areas: string;
  auth_user_id: string | null;
  is_active: boolean;
  is_accepting_tasks: boolean;
}

export interface DeliveryTaskRow {
  id: string;
  task_reference: string;
  booking_id: string;
  booking_reference: string;
  task_type: 'pickup' | 'return_delivery';
  status: string;
  pickup_address: string;
  destination_address: string;
  contact_name: string;
  contact_phone: string;
  scheduled_date: string | null;
  scheduled_window: string;
  assignment_note: string;
  exception_reason: string;
  failure_reason: string;
  agent_name: string | null;
  agent_code: string | null;
  assigned_at: string | null;
  accepted_at: string | null;
  picked_up_at: string | null;
  completed_at: string | null;
  has_otp: boolean;
  created_at: string;
}

export interface DeliveryExceptionRow {
  task_id: string;
  task_reference: string;
  booking_reference: string;
  task_type: string;
  status: string;
  agent_name: string | null;
  exception_reason: string;
  failure_reason: string;
  updated_at: string;
}

export const DELIVERY_TASK_STATUS_LABELS: Record<string, string> = {
  unassigned: 'Unassigned',
  assigned: 'Assigned — awaiting response',
  accepted: 'Accepted',
  on_the_way: 'On the way',
  picked_up: 'Picked up — awaiting handover',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  completed: 'Completed',
  failed: 'Failed attempt',
  exception: 'Exception',
  cancelled: 'Cancelled',
};

export function DeliveryTab() {
  const [tasks, setTasks] = useState<DeliveryTaskRow[]>([]);
  const [agents, setAgents] = useState<DeliveryAgentRow[]>([]);
  const [exceptions, setExceptions] = useState<DeliveryExceptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [assigning, setAssigning] = useState<DeliveryTaskRow | null>(null);
  const [detail, setDetail] = useState<DeliveryTaskRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [tasksRes, agentsRes, excRes] = await Promise.all([
      supabase.rpc('admin_list_delivery_tasks', { p_status: statusFilter }),
      supabase.rpc('admin_list_delivery_agents'),
      supabase.rpc('admin_pending_delivery_exceptions'),
    ]);
    setTasks((tasksRes.data as unknown as DeliveryTaskRow[]) || []);
    setAgents((agentsRes.data as unknown as DeliveryAgentRow[]) || []);
    setExceptions((excRes.data as unknown as DeliveryExceptionRow[]) || []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-field max-w-xs">
          <option value="all">All tasks</option>
          {Object.entries(DELIVERY_TASK_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button onClick={load} className="btn-secondary text-sm"><RefreshCw className="h-4 w-4" /> Refresh</button>
        <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">
          <Plus className="h-4 w-4" /> New Task
        </button>
      </div>

      {exceptions.length > 0 && (
        <div className="animate-fade-in mb-4 rounded-xl bg-amber-50 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600" />
            <p className="text-sm font-semibold text-amber-800">
              {exceptions.length} task{exceptions.length > 1 ? 's' : ''} failed or flagged — attention needed:
            </p>
          </div>
          <ul className="mt-2 space-y-1">
            {exceptions.map((e) => (
              <li key={e.task_id} className="text-xs text-amber-800">
                <span className="font-semibold">{e.task_reference}</span> ({e.booking_reference}, {e.task_type === 'pickup' ? 'pickup' : 'return'}) — {e.agent_name || 'no agent'}
                {e.failure_reason ? `: ${e.failure_reason}` : e.exception_reason ? `: ${e.exception_reason}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-forest-600" /></div>
      ) : tasks.length === 0 ? (
        <div className="card p-12 text-center">
          <Truck className="mx-auto mb-3 h-10 w-10 text-charcoal-300" />
          <p className="text-sm text-charcoal-500">No delivery tasks{statusFilter !== 'all' ? ' with this status' : ' yet'}. Create one from a booking or the New Task button.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => (
            <div key={t.id} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button onClick={() => setDetail(t)} className="min-w-0 flex-1 text-left">
                  <p className="text-sm font-semibold text-forest-700">
                    {t.task_reference}
                    <span className="ml-2 text-xs font-normal text-charcoal-400">for booking {t.booking_reference}</span>
                  </p>
                  <p className="truncate text-xs text-charcoal-500">
                    {t.task_type === 'pickup' ? 'Pickup' : 'Return delivery'}
                    {t.agent_name ? ` • ${t.agent_name}` : ' • No agent'}
                    {t.scheduled_date ? ` • ${formatDate(t.scheduled_date)} ${t.scheduled_window}` : ''}
                  </p>
                </button>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusBadgeClass(t.status)}`}>
                    {DELIVERY_TASK_STATUS_LABELS[t.status] || t.status}
                  </span>
                  <button
                    onClick={() => setAssigning(t)}
                    disabled={t.status === 'completed' || t.status === 'delivered' || t.status === 'cancelled'}
                    className="btn-ghost text-xs"
                  >
                    {t.agent_name ? 'Reassign' : 'Assign'}
                  </button>
                  <ChevronRight className="h-4 w-4 text-charcoal-400" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateTaskModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
      {assigning && (
        <AssignTaskModal
          task={assigning}
          agents={agents}
          onClose={() => setAssigning(null)}
          onDone={() => { setAssigning(null); load(); }}
        />
      )}
      {detail && (
        <TaskDetailModal
          task={detail}
          onClose={() => setDetail(null)}
          onChanged={() => { setDetail(null); load(); }}
        />
      )}
    </div>
  );
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'unassigned': return 'bg-yellow-100 text-yellow-700';
    case 'assigned': return 'bg-blue-100 text-blue-700';
    case 'accepted':
    case 'on_the_way':
    case 'picked_up':
    case 'out_for_delivery': return 'bg-forest-100 text-forest-700';
    case 'completed':
    case 'delivered': return 'bg-green-100 text-green-700';
    case 'failed':
    case 'exception': return 'bg-red-100 text-red-700';
    case 'cancelled': return 'bg-charcoal-100 text-charcoal-500';
    default: return 'bg-ivory-200 text-charcoal-600';
  }
}

function CreateTaskModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [search, setSearch] = useState('');
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [selected, setSelected] = useState<Booking | null>(null);
  const [taskType, setTaskType] = useState<'pickup' | 'return_delivery'>('pickup');
  const [pickupAddress, setPickupAddress] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledWindow, setScheduledWindow] = useState('');
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdInfo, setCreatedInfo] = useState<{ ref: string; otp: string | null } | null>(null);

  useEffect(() => {
    (async () => {
      setLoadingBookings(true);
      let query = supabase.from('bookings').select('*').neq('status', 'cancelled').order('created_at', { ascending: false }).limit(30);
      if (search) query = query.or(`booking_reference.ilike.%${search}%,customer_name.ilike.%${search}%`);
      const { data } = await query;
      setBookings((data as Booking[]) || []);
      setLoadingBookings(false);
    })();
  }, [search]);

  function chooseBooking(b: Booking) {
    setSelected(b);
    setPickupAddress(b.pickup_address + ', ' + b.locality + ' ' + b.pin_code);
    setDestinationAddress('');
  }

  async function create() {
    if (!selected) return;
    setCreating(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('admin_create_delivery_task', {
      p_booking_id: selected.id,
      p_task_type: taskType,
      p_pickup_address: pickupAddress,
      p_destination_address: destinationAddress,
      p_scheduled_date: scheduledDate || null,
      p_scheduled_window: scheduledWindow,
      p_note: note,
    });
    setCreating(false);
    if (rpcError || !data || (data as { error?: string }).error) {
      const err = (data as { error?: string } | null)?.error;
      const friendly: Record<string, string> = {
        duplicate_active_task: 'This booking already has an active task of this type.',
        booking_cancelled: 'This booking is cancelled.',
        booking_not_found: 'Booking not found.',
      };
      setError(friendly[err || ''] || rpcError?.message || 'Could not create the task.');
      return;
    }
    const res = data as { task_reference: string; otp: string | null };
    setCreatedInfo({ ref: res.task_reference, otp: res.otp });
    setSelected(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal-900/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-ivory-50 p-6 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-charcoal-900">
            <Truck className="h-5 w-5 text-forest-700" /> New Delivery Task
          </h3>
          <button onClick={onClose} className="text-charcoal-400 hover:text-charcoal-600"><X className="h-5 w-5" /></button>
        </div>

        {createdInfo ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-forest-50 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-forest-700">
                <CheckCircle2 className="h-4 w-4" /> Task {createdInfo.ref} created — Unassigned
              </p>
              <p className="mt-1 text-xs text-forest-600">Assign it to a delivery agent from the task list.</p>
            </div>
            {createdInfo.otp && (
              <div className="rounded-xl bg-amber-50 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                  <KeyRound className="h-4 w-4" /> Customer verification code (return delivery)
                </p>
                <p className="mt-2 text-center text-3xl font-bold tracking-[0.3em] text-amber-900">{createdInfo.otp}</p>
                <p className="mt-3 text-xs text-amber-700">
                  Share this 6-digit code with the customer by phone or WhatsApp now. It is shown only this once —
                  the agent will ask for it at the doorstep, and no one can retrieve it afterwards.
                  If it is lost, reassign the task to generate a new verification window and call support.
                </p>
              </div>
            )}
            <button onClick={onCreated} className="btn-primary w-full">Done</button>
          </div>
        ) : !selected ? (
          <div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field mb-3"
              placeholder="Search booking by reference or customer name..."
            />
            {loadingBookings ? (
              <div className="py-8 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-forest-600" /></div>
            ) : bookings.length === 0 ? (
              <p className="py-8 text-center text-sm text-charcoal-500">No active bookings found.</p>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {bookings.map((b) => (
                  <button key={b.id} onClick={() => chooseBooking(b)} className="card flex w-full items-center justify-between p-3 text-left hover:shadow-elevated transition-all">
                    <div>
                      <p className="text-sm font-semibold text-forest-700">{b.booking_reference}</p>
                      <p className="text-xs text-charcoal-500">{b.customer_name} • {b.locality} {b.pin_code}</p>
                    </div>
                    <span className="text-xs text-charcoal-400">{formatDate(b.created_at)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl bg-ivory-200 p-3 text-sm">
              <p className="font-semibold text-forest-700">{selected.booking_reference}</p>
              <p className="text-xs text-charcoal-500">{selected.customer_name} • {selected.customer_phone}</p>
            </div>
            <div>
              <label className="label-field">Task Type</label>
              <select value={taskType} onChange={(e) => setTaskType(e.target.value as 'pickup' | 'return_delivery')} className="input-field">
                <option value="pickup">Pickup (collect garments)</option>
                <option value="return_delivery">Return delivery (bring garments to customer)</option>
              </select>
            </div>
            <div>
              <label className="label-field">Collection Point (where the agent takes the garments)</label>
              <input type="text" value={pickupAddress} onChange={(e) => setPickupAddress(e.target.value)} className="input-field" placeholder="Address" />
            </div>
            <div>
              <label className="label-field">Destination (where the garments must go)</label>
              <input type="text" value={destinationAddress} onChange={(e) => setDestinationAddress(e.target.value)} className="input-field" placeholder={taskType === 'pickup' ? 'e.g. tailor workshop or QC location address' : 'defaults to customer address'} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label-field">Scheduled Date (optional)</label>
                <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="label-field">Time Window (optional)</label>
                <input type="text" value={scheduledWindow} onChange={(e) => setScheduledWindow(e.target.value)} className="input-field" placeholder="e.g. 5 PM – 7 PM" />
              </div>
            </div>
            <div>
              <label className="label-field">Note for the Agent</label>
              <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className="input-field" placeholder="e.g. landmark, gate code, call before arriving" maxLength={300} />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => setSelected(null)} className="btn-ghost text-sm">Back</button>
              <button onClick={create} disabled={creating} className="btn-primary flex-1">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create Task
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AssignTaskModal({ task, agents, onClose, onDone }: {
  task: DeliveryTaskRow; agents: DeliveryAgentRow[]; onClose: () => void; onDone: () => void;
}) {
  const [note, setNote] = useState('');
  const [busyAgent, setBusyAgent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notifyText, setNotifyText] = useState('');

  const available = agents.filter((a) => a.is_active && a.is_accepting_tasks);
  const others = agents.filter((a) => !(a.is_active && a.is_accepting_tasks));

  async function assign(agentId: string) {
    setBusyAgent(agentId);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('admin_assign_delivery_task', {
      p_task_id: task.id, p_agent_id: agentId, p_note: note.trim(),
    });
    setBusyAgent(null);
    if (rpcError || !data || (data as { error?: string }).error) {
      const err = (data as { error?: string } | null)?.error;
      const friendly: Record<string, string> = {
        agent_not_available: 'That agent is inactive or paused.',
        agent_en_route_use_exception_flow: 'Agent is en route — use "Flag issue" in task details instead.',
        task_closed: 'This task is already closed.',
      };
      setError(friendly[err || ''] || rpcError?.message || 'Could not assign.');
      return;
    }

    // Best-effort notification; never blocks the assignment.
    let notifyText = '';
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const jwt = sessionData.session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delivery-task-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}` },
        body: JSON.stringify({ task_id: task.id }),
      });
      const json = await res.json().catch(() => null) as { notified?: boolean; detail?: string } | null;
      if (json?.notified) notifyText = ' Agent notified by email.';
      else if (json?.detail) notifyText = ` Note: agent email not sent (${json.detail}). They will still see the task in their dashboard.`;
      else notifyText = ' Note: agent email not sent — they will still see the task in their dashboard.';
    } catch {
      notifyText = ' Note: agent email not sent — they will still see the task in their dashboard.';
    }
    setNotifyText(notifyText);
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal-900/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-ivory-50 p-6 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-charcoal-900">Assign {task.task_reference}</h3>
          <button onClick={onClose} className="text-charcoal-400 hover:text-charcoal-600"><X className="h-5 w-5" /></button>
        </div>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="input-field mb-3"
          placeholder="Optional note for the agent (e.g. call before arriving)"
          maxLength={300}
        />
        {notifyText && <p className="mb-3 text-xs text-charcoal-500">{notifyText}</p>}
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        {available.length === 0 ? (
          <p className="py-6 text-center text-sm text-charcoal-500">
            No active delivery agents yet. Add one in the Delivery Team section below.
          </p>
        ) : (
          <div className="space-y-2">
            {available.map((a) => (
              <button
                key={a.id}
                onClick={() => assign(a.id)}
                disabled={busyAgent !== null}
                className="card flex w-full items-center justify-between p-3 text-left hover:shadow-elevated transition-all"
              >
                <div>
                  <p className="text-sm font-medium text-charcoal-800">{a.name}</p>
                  <p className="text-xs text-charcoal-500">
                    {a.phone || 'No phone'}{a.service_areas ? ` • ${a.service_areas}` : ''}
                  </p>
                </div>
                {busyAgent === a.id
                  ? <Loader2 className="h-4 w-4 animate-spin text-forest-600" />
                  : <span className="text-xs font-medium text-forest-700">Assign</span>}
              </button>
            ))}
          </div>
        )}
        {others.length > 0 && (
          <div className="mt-3 border-t border-ivory-300 pt-3">
            <p className="mb-2 text-xs text-charcoal-400">Inactive / paused (cannot be assigned):</p>
            <div className="space-y-1">
              {others.map((a) => (
                <p key={a.id} className="text-xs text-charcoal-400">
                  {a.name} — {a.is_active ? 'paused' : 'inactive'}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TaskDetailModal({ task, onClose, onChanged }: {
  task: DeliveryTaskRow; onClose: () => void; onChanged: () => void;
}) {
  const [history, setHistory] = useState<{ id: string; actor_role: string; actor_label: string; action: string; details: string; created_at: string }[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setHistoryLoading(true);
      const { data } = await supabase.rpc('admin_delivery_task_history', { p_task_id: task.id });
      setHistory((data as unknown as typeof history) || []);
      setHistoryLoading(false);
    })();
  }, [task.id]);

  async function doAction(action: string, needsReason: boolean) {
    if (needsReason && !reason.trim()) {
      setActionMsg('Please enter a reason first.');
      return;
    }
    setBusy(action);
    setActionMsg(null);
    const { data, error: rpcError } = await supabase.rpc('admin_update_delivery_task', {
      p_task_id: task.id, p_action: action, p_details: reason.trim(),
    });
    setBusy(null);
    if (rpcError || !data || (data as { error?: string }).error) {
      setActionMsg('Error: ' + ((data as { error?: string } | null)?.error || rpcError?.message || 'unknown'));
      return;
    }
    onChanged();
  }

  const closed = task.status === 'completed' || task.status === 'delivered' || task.status === 'cancelled';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal-900/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-ivory-50 p-6 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-charcoal-900">{task.task_reference}</h3>
            <p className="text-xs text-charcoal-400">
              {task.task_type === 'pickup' ? 'Pickup' : 'Return delivery'} for booking {task.booking_reference}
            </p>
          </div>
          <button onClick={onClose} className="text-charcoal-400 hover:text-charcoal-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="mb-4 grid gap-3 rounded-xl bg-ivory-200 p-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-charcoal-400">Status</p>
            <p className="font-medium">{DELIVERY_TASK_STATUS_LABELS[task.status] || task.status}</p>
          </div>
          <div>
            <p className="text-xs text-charcoal-400">Agent</p>
            <p className="font-medium">{task.agent_name || 'Unassigned'}{task.agent_code ? ` (${task.agent_code})` : ''}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs text-charcoal-400">Collection point</p>
            <p className="font-medium">{task.pickup_address || '—'}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs text-charcoal-400">Destination</p>
            <p className="font-medium">{task.destination_address || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-charcoal-400">Customer contact</p>
            <p className="font-medium">{task.contact_name} • {task.contact_phone}</p>
          </div>
          <div>
            <p className="text-xs text-charcoal-400">Schedule</p>
            <p className="font-medium">
              {task.scheduled_date ? formatDate(task.scheduled_date) : 'Not scheduled'}
              {task.scheduled_window ? ` (${task.scheduled_window})` : ''}
            </p>
          </div>
          {task.assignment_note && (
            <div className="sm:col-span-2">
              <p className="text-xs text-charcoal-400">Note to agent</p>
              <p className="font-medium">{task.assignment_note}</p>
            </div>
          )}
          {(task.failure_reason || task.exception_reason) && (
            <div className="sm:col-span-2">
              <p className="text-xs text-charcoal-400">{task.failure_reason ? 'Failure reason' : 'Exception'}</p>
              <p className="font-medium text-red-600">{task.failure_reason || task.exception_reason}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-charcoal-400">Timestamps</p>
            <p className="text-xs text-charcoal-600">
              Assigned: {task.assigned_at ? formatDateTime(task.assigned_at) : '—'}<br />
              Accepted: {task.accepted_at ? formatDateTime(task.accepted_at) : '—'}<br />
              Completed: {task.completed_at ? formatDateTime(task.completed_at) : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-charcoal-400">Verification</p>
            <p className="font-medium">
              {task.task_type === 'return_delivery'
                ? (task.has_otp ? 'Customer code active' : task.status === 'delivered' ? 'Verified at delivery' : 'No code generated')
                : 'Handover confirmation'}
            </p>
            {task.has_otp && (
              <p className="mt-1 text-xs text-charcoal-400">Code shown once at creation — call the customer if needed.</p>
            )}
          </div>
        </div>

        {!closed && (
          <div className="mb-4 rounded-xl border border-ivory-300 p-4">
            <h4 className="mb-2 text-sm font-semibold text-charcoal-700">Admin Actions</h4>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input-field mb-3"
              placeholder="Reason (required for flag issue / cancel)"
              maxLength={300}
            />
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => doAction('mark_exception', true)}
                disabled={busy !== null}
                className="btn-ghost text-xs"
              >
                <AlertTriangle className="h-3.5 w-3.5" /> Flag issue
              </button>
              <button
                onClick={() => doAction('mark_failed', true)}
                disabled={busy !== null}
                className="btn-ghost text-xs text-red-600"
              >
                <XCircle className="h-3.5 w-3.5" /> Mark failed
              </button>
              <button
                onClick={() => doAction('reset_to_unassigned', false)}
                disabled={busy !== null || task.status === 'unassigned'}
                className="btn-ghost text-xs"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Return to unassigned
              </button>
              <button
                onClick={() => doAction('cancel', true)}
                disabled={busy !== null}
                className="btn-ghost text-xs text-red-600"
              >
                <XCircle className="h-3.5 w-3.5" /> Cancel task
              </button>
            </div>
            {actionMsg && <p className={`mt-2 text-xs ${actionMsg.startsWith('Error') ? 'text-red-600' : 'text-forest-600'}`}>{actionMsg}</p>}
          </div>
        )}

        <div>
          <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-charcoal-700">
            <History className="h-4 w-4" /> Task History
          </h4>
          {historyLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-forest-600" />
          ) : history.length === 0 ? (
            <p className="text-xs text-charcoal-400">No events recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {history.map((h) => (
                <div key={h.id} className="rounded-lg bg-ivory-200 p-3 text-xs">
                  <div className="flex justify-between">
                    <span className="font-medium text-charcoal-700">{h.action.replace(/_/g, ' ')}{h.actor_label ? ` — ${h.actor_label} (${h.actor_role})` : ''}</span>
                    <span className="text-charcoal-400">{formatDateTime(h.created_at)}</span>
                  </div>
                  {h.details && <p className="mt-1 text-charcoal-500">{h.details}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Delivery team management (agents) ---

export function DeliveryTeamSection({ agents, onAgentsChanged }: {
  agents: DeliveryAgentRow[];
  onAgentsChanged: () => void;
}) {
  const [newAgent, setNewAgent] = useState({ name: '', phone: '', service_areas: '', agent_code: '' });
  const [adding, setAdding] = useState(false);
  const [onboarding, setOnboarding] = useState<DeliveryAgentRow | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function addAgent() {
    if (!newAgent.name.trim()) { setMsg('Name is required.'); return; }
    setAdding(true);
    setMsg(null);
    const { error } = await supabase.from('delivery_agents').insert({
      name: newAgent.name.trim(),
      phone: newAgent.phone.trim(),
      service_areas: newAgent.service_areas.trim(),
      agent_code: newAgent.agent_code.trim() || null,
      is_active: true,
      is_accepting_tasks: true,
    });
    setAdding(false);
    if (error) { setMsg('Error: ' + error.message); return; }
    setNewAgent({ name: '', phone: '', service_areas: '', agent_code: '' });
    onAgentsChanged();
  }

  async function toggleAgent(a: DeliveryAgentRow, field: 'is_active' | 'is_accepting_tasks') {
    const { error } = await supabase.from('delivery_agents').update({ [field]: !a[field] }).eq('id', a.id);
    if (!error) onAgentsChanged();
  }

  async function deleteAgent(a: DeliveryAgentRow) {
    if (a.auth_user_id) {
      setMsg('This agent has a login linked. Remove the login link first (or disable them instead of deleting).');
      return;
    }
    const { error } = await supabase.from('delivery_agents').delete().eq('id', a.id);
    if (error) { setMsg('Error: ' + error.message); return; }
    onAgentsChanged();
  }

  return (
    <div className="card p-5">
      <h3 className="mb-4 text-sm font-semibold text-charcoal-700">Delivery Team</h3>
      <div className="mb-3 grid gap-2 sm:grid-cols-4">
        <input type="text" placeholder="Name" value={newAgent.name} onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })} className="input-field" />
        <input type="text" placeholder="Phone" value={newAgent.phone} onChange={(e) => setNewAgent({ ...newAgent, phone: e.target.value })} className="input-field" />
        <input type="text" placeholder="Service areas (e.g. Gachibowli, Kondapur)" value={newAgent.service_areas} onChange={(e) => setNewAgent({ ...newAgent, service_areas: e.target.value })} className="input-field" />
        <button onClick={addAgent} disabled={adding} className="btn-secondary text-sm"><Plus className="h-4 w-4" /> Add Agent</button>
      </div>
      {msg && <p className={`mb-3 text-xs ${msg.startsWith('Error') ? 'text-red-600' : 'text-charcoal-500'}`}>{msg}</p>}
      <div className="space-y-2">
        {agents.length === 0 ? (
          <p className="text-sm text-charcoal-400">No delivery agents yet. Add your first agent above, then use "Set up login" to give them dashboard access.</p>
        ) : agents.map((a) => (
          <div key={a.id} className="rounded-lg bg-ivory-200 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium text-charcoal-800">
                  {a.name}
                  {a.agent_code && <span className="text-xs text-charcoal-400">{a.agent_code}</span>}
                  <button
                    onClick={() => toggleAgent(a, 'is_accepting_tasks')}
                    className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${a.is_accepting_tasks ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                    title="Toggle whether this agent can receive new task assignments"
                  >
                    {a.is_accepting_tasks ? 'Accepting tasks' : 'Paused'}
                  </button>
                  <button
                    onClick={() => toggleAgent(a, 'is_active')}
                    className={`rounded-full px-2 py-0.5 text-xs ${a.is_active ? 'bg-forest-100 text-forest-700' : 'bg-charcoal-100 text-charcoal-500'}`}
                    title="Toggle whether this agent can sign in at all"
                  >
                    {a.is_active ? 'Active' : 'Inactive'}
                  </button>
                </p>
                <p className="truncate text-xs text-charcoal-500">
                  {a.phone || 'No phone'}{a.service_areas ? ` • ${a.service_areas}` : ''}
                  {a.auth_user_id ? ' • has dashboard login' : ' • no login yet'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!a.auth_user_id && (
                  <button onClick={() => setOnboarding(a)} className="btn-ghost text-xs">Set up login</button>
                )}
                <button onClick={() => deleteAgent(a)} className="rounded-lg p-2 text-charcoal-400 hover:text-red-500" title="Remove agent">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {onboarding && (
        <AgentOnboardModal
          agent={onboarding}
          onClose={() => setOnboarding(null)}
          onDone={() => { setOnboarding(null); onAgentsChanged(); }}
        />
      )}
    </div>
  );
}

function AgentOnboardModal({ agent, onClose, onDone }: {
  agent: DeliveryAgentRow; onClose: () => void; onDone: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onboard() {
    if (!email.trim() || password.length < 8) {
      setMsg('Enter an email and a password of at least 8 characters.');
      return;
    }
    setSaving(true);
    setMsg(null);
    const { data: createRes, error: createErr } = await supabase.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
    });
    if (createErr || !createRes?.user) {
      setSaving(false);
      setMsg('Could not create the login: ' + (createErr?.message || 'unknown error'));
      return;
    }
    const { data: linkRes } = await supabase.rpc('link_delivery_agent_account', {
      p_agent_id: agent.id, p_auth_user_id: createRes.user.id,
    });
    setSaving(false);
    if (linkRes?.error) {
      setMsg('Login created, but linking failed: ' + linkRes.error + '. Share this with technical support: agent ' + agent.id);
      return;
    }
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-ivory-50 p-6 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-charcoal-900">Set up login — {agent.name}</h3>
          <button onClick={onClose} className="text-charcoal-400 hover:text-charcoal-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="label-field">Agent's email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-field" placeholder="agent@example.com" />
          </div>
          <div>
            <label className="label-field">Temporary password (min 8 characters)</label>
            <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} className="input-field" placeholder="Share this with the agent securely" />
          </div>
          <p className="text-xs text-charcoal-400">
            The agent signs in at /agent with this email and password. They will only ever see their own assigned tasks.
          </p>
          {msg && <p className={`text-sm ${msg.startsWith('Could not') || msg.startsWith('Login created') ? 'text-red-600' : 'text-forest-600'}`}>{msg}</p>}
          <button onClick={onboard} disabled={saving} className="btn-primary w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create Login
          </button>
        </div>
      </div>
    </div>
  );
}
