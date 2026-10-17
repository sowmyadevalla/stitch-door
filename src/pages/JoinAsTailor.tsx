import { useState } from 'react';
import { Scissors, MapPin, Clock, ShieldCheck, CheckCircle2, AlertCircle, Loader2, ClipboardList, HandshakeIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const emptyForm = {
  full_name: '',
  mobile: '',
  email: '',
  locality: '',
  service_areas: '',
  experience_years: '',
  services_offered: '',
  equipment: '',
  expected_rates: '',
  portfolio_urls: '',
  verification_id_type: 'aadhaar',
  verification_id_number: '',
  notes_from_tailor: '',
};

const BENEFITS = [
  { icon: ClipboardList, title: 'Steady orders, zero marketing', text: 'We send you orders from customers in your locality — you focus on the stitching, we handle the customers.' },
  { icon: MapPin, title: 'Work from your workshop', text: 'Pick up garment bundles from nearby customers. No shopfront or travel across the city needed.' },
  { icon: HandshakeIcon, title: 'You choose what to accept', text: 'Every order comes to you as an offer. Accept the ones that fit your schedule and skills.' },
  { icon: ShieldCheck, title: 'Clear pricing, timely updates', text: 'You see the confirmed order details and update progress in a few taps — customers stay informed automatically.' },
];

const STEPS = [
  { title: 'Apply below', text: 'Fill the application with your skills, locality and experience. It takes about five minutes.' },
  { title: 'We review it', text: 'Our team checks your application and may ask for more information before making a decision.' },
  { title: 'Account setup', text: 'If approved, we create your secure partner login and share it with you over phone.' },
  { title: 'Start receiving offers', text: 'Sign in to your partner dashboard, and accept the orders that suit you.' },
];

export function JoinAsTailor() {
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ reference: string } | null>(null);

  function set<K extends keyof typeof emptyForm>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { data, error: rpcError } = await supabase.rpc('submit_tailor_application', { p_payload: form });
    setSubmitting(false);
    if (rpcError || !data) {
      setError('Something went wrong while sending your application. Please try again.');
      return;
    }
    if (data.error === 'duplicate') {
      setError('We already have an application under review with this mobile number. Our team will contact you — no need to apply again.');
      return;
    }
    if (data.error || !data.application_reference) {
      setError('Please check your details — name, a valid 10-digit mobile number and a valid email are required.');
      return;
    }
    setResult({ reference: data.application_reference });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const inputCls = 'input-field w-full';
  const labelCls = 'label-field';

  return (
    <div className="animate-fade-in bg-ivory-100">
      {/* Hero */}
      <section className="border-b border-ivory-300 bg-ivory-50">
        <div className="mx-auto max-w-7xl px-4 py-14 lg:px-8 lg:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-forest-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-forest-700">
              <Scissors className="h-3.5 w-3.5" /> Partner with StitchDoor
            </span>
            <h1 className="font-serif text-4xl leading-tight text-charcoal-900 sm:text-5xl">
              Join as a Tailor
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-charcoal-600">
              Do you run a tailoring shop or work from home in Hyderabad? Partner with StitchDoor and receive
              orders from customers near you — without spending a rupee on advertising.
            </p>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
        <div className="grid gap-4 sm:grid-cols-2">
          {BENEFITS.map((b) => (
            <div key={b.title} className="card flex gap-4 p-6">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-forest-50 text-forest-700">
                <b.icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-charcoal-900">{b.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-charcoal-500">{b.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Application ≠ approval notice */}
      <section className="mx-auto max-w-7xl px-4 pb-4 lg:px-8">
        <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-amber-600" />
          <p className="text-sm leading-relaxed text-amber-800">
            <strong>Submitting an application is not the same as being approved.</strong> Every application is
            reviewed by our team, and we may request more information before deciding. Only approved tailors get a
            partner account and receive orders. We will contact you on the mobile number you provide.
          </p>
        </div>
      </section>

      {/* Form or success */}
      <section className="mx-auto max-w-3xl px-4 py-10 lg:px-8">
        {result ? (
          <div className="card p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-forest-50">
              <CheckCircle2 className="h-8 w-8 text-forest-600" />
            </div>
            <h2 className="font-serif text-2xl text-charcoal-900">Application received</h2>
            <p className="mt-2 text-sm leading-relaxed text-charcoal-500">
              Thank you for applying. Our team reviews every application and will call you on the number you gave us.
            </p>
            <div className="mx-auto mt-5 w-fit rounded-xl bg-ivory-200 px-6 py-4">
              <p className="text-xs uppercase tracking-wider text-charcoal-400">Your application reference</p>
              <p className="mt-1 font-mono text-xl font-semibold text-forest-700">{result.reference}</p>
            </div>
            <p className="mt-4 text-xs text-charcoal-400">
              Save this reference — quote it if you call or WhatsApp us about your application.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="card p-6 sm:p-8" noValidate>
            <h2 className="font-serif text-2xl text-charcoal-900">Tailor Application</h2>
            <p className="mt-1 mb-6 text-sm text-charcoal-500">
              Fields marked * are required. We only use these details to evaluate your application.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="ta-name" className={labelCls}>Full name *</label>
                <input id="ta-name" type="text" required value={form.full_name} onChange={(e) => set('full_name', e.target.value)} className={inputCls} placeholder="e.g. Mohammed Irfan" />
              </div>
              <div>
                <label htmlFor="ta-mobile" className={labelCls}>Mobile number *</label>
                <input id="ta-mobile" type="tel" required inputMode="numeric" maxLength={10} value={form.mobile} onChange={(e) => set('mobile', e.target.value.replace(/\D/g, ''))} className={inputCls} placeholder="10-digit mobile" />
              </div>
              <div>
                <label htmlFor="ta-email" className={labelCls}>Email *</label>
                <input id="ta-email" type="email" required value={form.email} onChange={(e) => set('email', e.target.value)} className={inputCls} placeholder="you@example.com" />
              </div>
              <div>
                <label htmlFor="ta-locality" className={labelCls}>Your locality *</label>
                <input id="ta-locality" type="text" required value={form.locality} onChange={(e) => set('locality', e.target.value)} className={inputCls} placeholder="e.g. Tolichowki" />
              </div>
              <div>
                <label htmlFor="ta-areas" className={labelCls}>Areas you can serve</label>
                <input id="ta-areas" type="text" value={form.service_areas} onChange={(e) => set('service_areas', e.target.value)} className={inputCls} placeholder="e.g. Mehdipatnam, Banjara Hills" />
              </div>
              <div>
                <label htmlFor="ta-exp" className={labelCls}>Years of experience</label>
                <input id="ta-exp" type="text" value={form.experience_years} onChange={(e) => set('experience_years', e.target.value)} className={inputCls} placeholder="e.g. 6" />
              </div>
              <div>
                <label htmlFor="ta-rates" className={labelCls}>Expected rates</label>
                <input id="ta-rates" type="text" value={form.expected_rates} onChange={(e) => set('expected_rates', e.target.value)} className={inputCls} placeholder="e.g. Blouse ₹350 onwards" />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="ta-services" className={labelCls}>Services you offer</label>
                <input id="ta-services" type="text" value={form.services_offered} onChange={(e) => set('services_offered', e.target.value)} className={inputCls} placeholder="e.g. Blouse stitching, alterations, kurti, fall-pico" />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="ta-equipment" className={labelCls}>Equipment you have</label>
                <input id="ta-equipment" type="text" value={form.equipment} onChange={(e) => set('equipment', e.target.value)} className={inputCls} placeholder="e.g. 2 power sewing machines, overlock machine" />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="ta-portfolio" className={labelCls}>Portfolio links (optional)</label>
                <input id="ta-portfolio" type="url" value={form.portfolio_urls} onChange={(e) => set('portfolio_urls', e.target.value)} className={inputCls} placeholder="Instagram, WhatsApp catalogue or website link" />
              </div>
              <div>
                <label htmlFor="ta-idtype" className={labelCls}>ID type</label>
                <select id="ta-idtype" value={form.verification_id_type} onChange={(e) => set('verification_id_type', e.target.value)} className={inputCls}>
                  <option value="aadhaar">Aadhaar</option>
                  <option value="voter_id">Voter ID</option>
                  <option value="driving_licence">Driving Licence</option>
                  <option value="passport">Passport</option>
                </select>
              </div>
              <div>
                <label htmlFor="ta-idnum" className={labelCls}>ID number</label>
                <input id="ta-idnum" type="text" value={form.verification_id_number} onChange={(e) => set('verification_id_number', e.target.value)} className={inputCls} placeholder="For verification only" />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="ta-notes" className={labelCls}>Anything else we should know?</label>
                <textarea id="ta-notes" value={form.notes_from_tailor} onChange={(e) => set('notes_from_tailor', e.target.value)} rows={3} className={`${inputCls} resize-none`} placeholder="Work timings, home-based or shop, etc." />
              </div>
            </div>

            {error && (
              <div className="mt-4 flex gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
              </div>
            )}

            <button type="submit" disabled={submitting} className="btn-primary mt-6 w-full sm:w-auto sm:px-10">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
              {submitting ? 'Submitting…' : 'Submit Application'}
            </button>
          </form>
        )}
      </section>

      {/* Process steps */}
      <section className="mx-auto max-w-7xl px-4 pb-16 lg:px-8">
        <h2 className="mb-6 text-center font-serif text-2xl text-charcoal-900">What happens after you apply</h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card relative p-6">
              <span className="absolute -top-3 left-6 flex h-7 w-7 items-center justify-center rounded-full bg-forest-600 text-sm font-semibold text-ivory-50">
                {i + 1}
              </span>
              <h3 className="mt-2 font-semibold text-charcoal-900">{s.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-charcoal-500">{s.text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 flex items-center justify-center gap-2 text-center text-sm text-charcoal-400">
          <Clock className="h-4 w-4" /> Applications are usually reviewed within 2–3 working days.
        </p>
      </section>
    </div>
  );
}
