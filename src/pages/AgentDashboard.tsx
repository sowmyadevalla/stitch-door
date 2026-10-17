import { useState, useEffect, useCallback } from 'react';
import {
  Truck, LogOut, Loader2, Clock, MapPin, Phone, CheckCircle2, XCircle, X,
  Navigation, PackageCheck, RefreshCw, ShieldAlert, KeyRound, AlertTriangle, User,
} from 'lucide-react';
import { useRouter } from '@/lib/router';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { formatDateTime, formatDate } from '@/lib/utils';

interface AgentInfo {
  id: string;
  name: string;
  agent_code: string | null;
}

interface AgentTask {
  id: string;
  task_reference: string;
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
  assigned_at: string | null;
  accepted_at: string | null;
  picked_up_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface AgentClosedTask {
  id: string;
  task_reference: string;
  booking_reference: string;
  task_type: 'pickup' | 'return_delivery';
  status: string;
  completed_at: string | null;
  failure_reason: string;
}

const TASK_STATUS_LABELS: Record<string, string> = {
  assigned: 'New task — waiting for your response',
  accepted: 'Accepted',
  on_the_way: 'On the way',
  picked_up: 'Picked up — confirm handover at destination',
  out_for_delivery: 'Out for delivery',
  exception: 'Exception flagged',
};

// Next allowed step per current status; terminal steps use dedicated confirm flows.
function nextAction(t: AgentTask): { key: string; label: string } | null {
  if (t.status === 'assigned') return { key: 'accept', label: 'Accept Task' };
  if (t.status === 'accepted') return { key: 'on_the_way', label: t.task_type === 'pickup' ? 'Start — On the way to collect' : 'Start — On the way' };
  if (t.status === 'on_the_way') {
    return t.task_type === 'pickup'
      ? { key: 'picked_up', label: 'Confirm Garments Collected' }
      : { key: 'out_for_delivery', label: 'Out for Delivery' };
  }
  if (t.status === 'picked_up') return { key: 'complete_pickup', label: 'Confirm Handover (delivered to tailor)' };
  if (t.status === 'out_for_delivery') return { key: 'complete_return', label: 'Deliver & Verify Code' };
  return null;
}

export function AgentDashboard() {
  const { session, loading: authLoading, signOut } = useAuth();
  const { navigate } = useRouter();
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!session) { navigate('/agent-login'); return; }
    (async () => {
      const { data } = await supabase
        .from('delivery_agents')
        .select('id, name, agent_code')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();
      setAgent((data as AgentInfo) || null);
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

  if (!agent) {
    return (
      <div className="animate-fade-in flex min-h-[70vh] items-center justify-center bg-ivory-100 px-4">
        <div className="card max-w-md p-8 text-center">
          <ShieldAlert className="mx-auto mb-3 h-12 w-12 text-charcoal-300" />
          <h1 className="font-serif text-2xl text-charcoal-900">Delivery agent access only</h1>
          <p className="mt-2 text-sm leading-relaxed text-charcoal-500">
            This account isn't linked to a StitchDoor delivery agent. Our team sets up delivery
            agent logins directly — contact StitchDoor if you believe this is a mistake.
          </p>
          <button onClick={() => navigate('/')} className="btn-primary mt-5">Back to home</button>
        </div>
      </div>
    );
  }

  return <AgentHome agent={agent} onSignOut={signOut} />;
}

function AgentHome({ agent, onSignOut }: { agent: AgentInfo; onSignOut: () => Promise<void> }) {
  const { navigate } = useRouter();
  const [active, setActive] = useState<AgentTask[]>([]);
  const [closed, setClosed] = useState<AgentClosedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [otpTask, setOtpTask] = useState<AgentTask | null>(null);
  const [declineTask, setDeclineTask] = useState<AgentTask | null>(null);
  const [handoverTask, setHandoverTask] = useState<AgentTask | null>(null);
  const [issueTask, setIssueTask] = useState<AgentTask | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc('agent_list_my_tasks');
    const res = data as { error?: string; active?: AgentTask[]; closed?: AgentClosedTask[] } | null;
    if (res?.error === 'not_delivery_agent') {
      setActive([]); setClosed([]);
    } else {
      setActive(res?.active || []);
      setClosed(res?.closed || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function acceptTask(t: AgentTask) {
    setActionMsg(null);
    const { data } = await supabase.rpc('agent_accept_task', { p_task_id: t.id, p_accept: true });
    if (data?.error) { setActionMsg('Could not accept: ' + (data as { message?: string }).message); return; }
    setActionMsg(`Task ${t.task_reference} accepted — you can now start.`);
    load();
  }

  async function updateStatus(t: AgentTask, key: string) {
    setActionMsg(null);
    const { data } = await supabase.rpc('agent_update_task_status', { p_task_id: t.id, p_new_status: key, p_note: '' });
    if (data?.error) { setActionMsg('Could not update: ' + (data as { message?: string }).message); return; }
    setActionMsg(`Task ${t.task_reference} updated.`);
    load();
  }

  async function completePickup(t: AgentTask, note: string) {
    setActionMsg(null);
    const { data } = await supabase.rpc('agent_complete_pickup', { p_task_id: t.id, p_handover_note: note });
    setHandoverTask(null);
    if (data?.error) { setActionMsg('Could not complete: ' + (data as { message?: string }).message); return; }
    setActionMsg(`Handover confirmed for ${t.task_reference}. Great work!`);
    load();
  }

  async function completeReturn(t: AgentTask, otp: string) {
    setActionMsg(null);
    const { data } = await supabase.rpc('agent_complete_return', { p_task_id: t.id, p_otp: otp.trim() });
    if (data?.error) {
      const err = (data as { error?: string }).error;
      const friendly: Record<string, string> = {
        otp_invalid: 'The code is wrong or expired. Ask the customer to read it again — repeated failures will lock verification for 15 minutes.',
        too_many_attempts: 'Too many wrong attempts. Verification is locked for 15 minutes.',
      };
      return friendly[err || ''] || 'Could not complete delivery.';
    }
    setOtpTask(null);
    setActionMsg(`Delivery verified and completed for ${t.task_reference}.`);
    load();
    return null;
  }

  async function declineTaskFn(t: AgentTask, reason: string) {
    setActionMsg(null);
    const { data } = await supabase.rpc('agent_accept_task', { p_task_id: t.id, p_accept: false, p_reason: reason });
    setDeclineTask(null);
    if (data?.error) { setActionMsg('Could not decline: ' + (data as { message?: string }).message); return; }
    setActionMsg(`Task ${t.task_reference} declined. StitchDoor has been notified and will reassign it.`);
    load();
  }

  async function reportIssue(t: AgentTask, reason: string) {
    setActionMsg(null);
    const { data } = await supabase.rpc('agent_report_issue', { p_task_id: t.id, p_reason: reason });
    setIssueTask(null);
    if (data?.error) { setActionMsg('Could not report: ' + (data as { message?: string }).message); return; }
    setActionMsg(`Issue reported for ${t.task_reference}. StitchDoor has been notified.`);
    load();
  }

  return (
    <div className="animate-fade-in min-h-screen bg-ivory-100">
      <header className="border-b border-ivory-300 bg-ivory-50">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest-600 text-ivory-50">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-serif text-lg leading-tight text-charcoal-900">Delivery Dashboard</h1>
              <p className="text-xs text-charcoal-500">
                {agent.name}{agent.agent_code ? ` • ${agent.agent_code}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="btn-ghost text-sm"><RefreshCw className="h-4 w-4" /> Refresh</button>
            <button onClick={async () => { await onSignOut(); navigate('/'); }} className="btn-ghost text-sm">
              <LogOut className="h-4 w-4" /> Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 lg:px-8">
        {actionMsg && (
          <div className="mb-4 rounded-xl bg-forest-50 px-4 py-3 text-sm text-forest-700">{actionMsg}</div>
        )}

        {loading ? (
          <div className="py-16 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-forest-600" /></div>
        ) : (
          <div className="space-y-8">
            {/* Active tasks */}
            <section>
              <h2 className="mb-3 flex items-center gap-2 font-serif text-xl text-charcoal-900">
                <Navigation className="h-5 w-5 text-terracotta-500" /> My Tasks
              </h2>
              {active.length === 0 ? (
                <div className="card p-8 text-center text-sm text-charcoal-500">
                  No active tasks right now. When StitchDoor assigns you a pickup or delivery, it appears here.
                </div>
              ) : (
                <div className="space-y-3">
                  {active.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      onAccept={() => acceptTask(t)}
                      onReject={() => setDeclineTask(t)}
                      onStatus={(key) => updateStatus(t, key)}
                      onCompletePickup={() => setHandoverTask(t)}
                      onCompleteReturn={() => setOtpTask(t)}
                      onIssue={() => setIssueTask(t)}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Closed history */}
            {closed.length > 0 && (
              <section>
                <h2 className="mb-3 flex items-center gap-2 font-serif text-xl text-charcoal-900">
                  <CheckCircle2 className="h-5 w-5 text-charcoal-400" /> Completed & Closed
                </h2>
                <div className="space-y-2">
                  {closed.map((t) => (
                    <div key={t.id} className="card flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                      <div>
                        <p className="font-semibold text-forest-700">{t.task_reference}</p>
                        <p className="text-xs text-charcoal-500">
                          {t.task_type === 'pickup' ? 'Pickup' : 'Return delivery'} • {t.booking_reference}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {t.failure_reason && (
                          <span className="text-xs text-red-600" title={t.failure_reason}>
                            <AlertTriangle className="inline h-3.5 w-3.5" /> {t.failure_reason.slice(0, 40)}
                          </span>
                        )}
                        <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                          t.status === 'completed' || t.status === 'delivered'
                            ? 'bg-green-100 text-green-700'
                            : t.status === 'cancelled' ? 'bg-charcoal-100 text-charcoal-500' : 'bg-red-100 text-red-700'
                        }`}>
                          {t.status.replace(/_/g, ' ')}
                        </span>
                        {t.completed_at && <span className="text-xs text-charcoal-400">{formatDateTime(t.completed_at)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      {otpTask && <OtpModal task={otpTask} onClose={() => setOtpTask(null)} onConfirm={completeReturn} />}
      {declineTask && <ReasonModal
        title={`Decline ${declineTask.task_reference}`}
        placeholder="Reason (e.g. vehicle breakdown, out of area)"
        onClose={() => setDeclineTask(null)}
        onConfirm={(reason) => declineTaskFn(declineTask, reason)}
      />}
      {handoverTask && <ReasonModal
        title={`Confirm handover — ${handoverTask.task_reference}`}
        placeholder="Optional handover note (e.g. received by tailor name)"
        optional
        onClose={() => setHandoverTask(null)}
        onConfirm={(note) => completePickup(handoverTask, note)}
      />}
      {issueTask && <ReasonModal
        title={`Report issue — ${issueTask.task_reference}`}
        placeholder="What went wrong? (e.g. customer not home, address unreachable)"
        onClose={() => setIssueTask(null)}
        onConfirm={(reason) => reportIssue(issueTask, reason)}
      />}
    </div>
  );
}

function TaskCard({ task, onAccept, onReject, onStatus, onCompletePickup, onCompleteReturn, onIssue }: {
  task: AgentTask;
  onAccept: () => void;
  onReject: () => void;
  onStatus: (key: string) => void;
  onCompletePickup: () => void;
  onCompleteReturn: () => void;
  onIssue: () => void;
}) {
  const next = nextAction(task);
  const isPickup = task.task_type === 'pickup';

  return (
    <div className="card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-forest-700">
          {task.task_reference}
          <span className="ml-2 text-xs font-normal text-charcoal-400">for booking {task.booking_reference}</span>
        </p>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${
          task.status === 'assigned' ? 'bg-blue-100 text-blue-700' : 'bg-forest-100 text-forest-700'
        }`}>
          {TASK_STATUS_LABELS[task.status] || task.status.replace(/_/g, ' ')}
        </span>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${isPickup ? 'bg-terracotta-100 text-terracotta-700' : 'bg-amber-100 text-amber-700'}`}>
          {isPickup ? <PackageCheck className="inline h-3 w-3" /> : <Truck className="inline h-3 w-3" />} {isPickup ? 'Pickup' : 'Return Delivery'}
        </span>
        {task.scheduled_date && (
          <span className="flex items-center gap-1 text-xs text-charcoal-500">
            <Clock className="h-3.5 w-3.5" /> {formatDate(task.scheduled_date)}{task.scheduled_window ? ` • ${task.scheduled_window}` : ''}
          </span>
        )}
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="flex items-center gap-1 text-xs text-charcoal-400"><MapPin className="h-3.5 w-3.5" /> Collection point</p>
          <p className="font-medium text-charcoal-800">{task.pickup_address || '—'}</p>
        </div>
        <div>
          <p className="flex items-center gap-1 text-xs text-charcoal-400"><MapPin className="h-3.5 w-3.5" /> Destination</p>
          <p className="font-medium text-charcoal-800">{task.destination_address || '—'}</p>
        </div>
        <div>
          <p className="flex items-center gap-1 text-xs text-charcoal-400"><User className="h-3.5 w-3.5" /> Contact</p>
          <p className="font-medium text-charcoal-800">{task.contact_name || '—'}</p>
          {task.contact_phone && (
            <a href={`tel:${task.contact_phone}`} className="flex items-center gap-1 text-xs text-forest-700 hover:underline">
              <Phone className="h-3 w-3" /> {task.contact_phone}
            </a>
          )}
        </div>
      </div>

      {task.assignment_note && (
        <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span className="font-semibold">Note from StitchDoor:</span> {task.assignment_note}
        </div>
      )}
      {task.status === 'exception' && task.exception_reason && (
        <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          <span className="font-semibold">Exception:</span> {task.exception_reason}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {next && next.key === 'accept' && (
          <>
            <button onClick={onAccept} className="btn-primary text-sm"><CheckCircle2 className="h-4 w-4" /> {next.label}</button>
            <button onClick={onReject} className="btn-ghost text-sm text-red-600"><XCircle className="h-4 w-4" /> Decline</button>
          </>
        )}
        {next && next.key !== 'accept' && (
          <button
            onClick={() => {
              if (next.key === 'complete_pickup') onCompletePickup();
              else if (next.key === 'complete_return') onCompleteReturn();
              else onStatus(next.key);
            }}
            className="btn-primary text-sm"
          >
            <CheckCircle2 className="h-4 w-4" /> {next.label}
          </button>
        )}
        {task.status !== 'assigned' && (
          <button onClick={onIssue} className="btn-ghost text-sm text-red-600">
            <AlertTriangle className="h-4 w-4" /> Report Issue
          </button>
        )}
      </div>
    </div>
  );
}

function OtpModal({ task, onClose, onConfirm }: {
  task: AgentTask;
  onClose: () => void;
  onConfirm: (t: AgentTask, otp: string) => Promise<string | null>;
}) {
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!/^\d{6}$/.test(otp.trim())) {
      setError('Enter the 6-digit code shown to the customer.');
      return;
    }
    setBusy(true);
    setError(null);
    const err = await onConfirm(task, otp);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-ivory-50 p-6 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-charcoal-900">
            <KeyRound className="h-5 w-5 text-forest-700" /> Customer Verification
          </h3>
          <button onClick={onClose} className="text-charcoal-400 hover:text-charcoal-600"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-4 text-sm text-charcoal-500">
          Ask the customer for the 6-digit code StitchDoor shared with them for booking{' '}
          <span className="font-semibold text-charcoal-800">{task.booking_reference}</span>, then enter it here.
        </p>
        <input
          type="text"
          inputMode="numeric"
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className="input-field text-center text-2xl tracking-[0.4em]"
          placeholder="••••••"
          maxLength={6}
          autoFocus
        />
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button onClick={submit} disabled={busy || otp.length !== 6} className="btn-primary mt-4 w-full">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Verify & Complete Delivery
        </button>
      </div>
    </div>
  );
}

function ReasonModal({ title, placeholder, optional, onClose, onConfirm }: {
  title: string;
  placeholder: string;
  optional?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!optional && !text.trim()) {
      setError('Please enter a reason.');
      return;
    }
    onConfirm(text.trim());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-ivory-50 p-6 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-charcoal-900">{title}</h3>
          <button onClick={onClose} className="text-charcoal-400 hover:text-charcoal-600"><X className="h-5 w-5" /></button>
        </div>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="input-field"
          placeholder={placeholder}
          maxLength={300}
          autoFocus
        />
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button onClick={submit} className="btn-primary mt-4 w-full">Confirm</button>
      </div>
    </div>
  );
}
