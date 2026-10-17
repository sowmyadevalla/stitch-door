import { useState } from 'react';
import { Mail, Phone, Clock, MapPin, MessageCircle, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useBusinessConfig } from '@/lib/config';
import { validateIndianMobile } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

export function Contact() {
  const { config } = useBusinessConfig();
  const [form, setForm] = useState({ name: '', phone: '', message: '' });
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [phoneError, setPhoneError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const phoneCheck = validateIndianMobile(form.phone);
    if (!phoneCheck.valid) {
      setPhoneError('Please enter a valid 10-digit Indian mobile number (e.g. 98765 43210).');
      return;
    }
    setPhoneError(null);
    setStatus('submitting');
    const { error } = await supabase.from('contact_messages').insert({
      name: form.name.trim().slice(0, 120),
      phone: phoneCheck.normalized,
      message: form.message.trim().slice(0, 5000),
    });
    if (error) {
      setStatus('error');
    } else {
      setStatus('success');
      setForm({ name: '', phone: '', message: '' });
    }
  }

  const whatsappNumber = config.whatsapp_number?.replace(/\D/g, '');

  return (
    <div className="animate-fade-in">
      <section className="bg-forest-50 py-12">
        <div className="mx-auto max-w-4xl px-4 text-center lg:px-8">
          <h1 className="mb-3 text-4xl font-semibold text-charcoal-900">Contact Us</h1>
          <p className="text-charcoal-500">We are here to help. Reach out anytime.</p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-12 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Contact Info */}
          <div className="space-y-4">
            <div className="card p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-forest-100 text-forest-600">
                  <Phone className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-charcoal-800">WhatsApp / Phone</h3>
                  <p className="text-sm text-charcoal-500">{config.whatsapp_number || 'To be configured'}</p>
                </div>
              </div>
            </div>

            <div className="card p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-forest-100 text-forest-600">
                  <Mail className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-charcoal-800">Email</h3>
                  <p className="text-sm text-charcoal-500">{config.contact_email || 'To be configured'}</p>
                </div>
              </div>
            </div>

            <div className="card p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-forest-100 text-forest-600">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-charcoal-800">Business Hours</h3>
                  <p className="text-sm text-charcoal-500">{config.business_hours}</p>
                </div>
              </div>
            </div>

            <div className="card p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-forest-100 text-forest-600">
                  <MapPin className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-charcoal-800">Service Area</h3>
                  <p className="text-sm text-charcoal-500">{config.service_area_note}</p>
                </div>
              </div>
            </div>

            {whatsappNumber && (
              <a
                href={`https://wa.me/${whatsappNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary w-full"
              >
                <MessageCircle className="h-4 w-4" />
                Chat on WhatsApp
              </a>
            )}
          </div>

          {/* Contact Form */}
          <div className="card p-6">
            <h2 className="mb-4 text-lg font-semibold text-charcoal-800">Send a Message</h2>
            {status === 'success' ? (
              <div className="py-8 text-center">
                <CheckCircle className="mx-auto mb-3 h-12 w-12 text-forest-600" />
                <p className="text-sm text-charcoal-600">Thank you for your message. We will get back to you soon.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label-field">Your Name *</label>
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" required />
                </div>
                <div>
                  <label className="label-field">Phone Number *</label>
                  <input type="tel" inputMode="numeric" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input-field" placeholder="10-digit mobile number" required />
                  {phoneError && <p className="mt-1 text-xs text-terracotta-600">{phoneError}</p>}
                </div>
                <div>
                  <label className="label-field">Message *</label>
                  <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={4} className="input-field resize-none" required />
                </div>
                {status === 'error' && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                    <AlertCircle className="h-4 w-4" /> Sorry, something went wrong sending your message. Please try again or reach us on WhatsApp.
                  </div>
                )}
                <button type="submit" disabled={status === 'submitting'} className="btn-primary w-full">
                  {status === 'submitting' && <Loader2 className="h-4 w-4 animate-spin" />}
                  Send Message
                </button>
                <p className="text-xs text-charcoal-400">
                  For an immediate response, please use WhatsApp.
                </p>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
