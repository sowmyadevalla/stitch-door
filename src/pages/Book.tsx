import { useState, useEffect, useMemo } from 'react';
import { Scissors, Truck, CheckCircle, ClipboardList, ChevronRight, ChevronLeft, Plus, Minus, Trash2, AlertCircle, Loader2 } from 'lucide-react';
import { Link, useRouter } from '@/lib/router';
import { useServices } from '@/lib/services';
import { useBusinessConfig, useServiceableAreas, isPincodeServiceable } from '@/lib/config';
import { formatINR, PICKUP_WINDOWS } from '@/lib/constants';
import { validateIndianMobile, validatePincode } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { CartItem, Service } from '@/lib/types';

const STEPS = ['Choose Service', 'Garment Details', 'Customer Details', 'Price Summary', 'Confirmation'];

export function Book({ preselectedSlug }: { preselectedSlug?: string }) {
  const { services, loading } = useServices();
  const { config } = useBusinessConfig();
  const { areas } = useServiceableAreas();
  const { session } = useAuth();
  const { navigate } = useRouter();

  const [step, setStep] = useState(0);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    locality: '',
    pin_code: '',
    pickup_date: '',
    pickup_window: '',
    instructions: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [bookingRef, setBookingRef] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && preselectedSlug) {
      const svc = services.find((s) => s.slug === preselectedSlug);
      if (svc && !cart.find((c) => c.service.id === svc.id)) {
        addToCart(svc);
      }
    }
  }, [loading, preselectedSlug, services]);

  // Prefill from session user data
  useEffect(() => {
    if (session) {
      supabase.auth.getUser().then(({ data }) => {
        if (data.user) {
          setCustomer((prev) => ({
            ...prev,
            name: prev.name || data.user.user_metadata?.full_name || '',
            phone: prev.phone || data.user.user_metadata?.phone || '',
            email: prev.email || data.user.email || '',
          }));
        }
      });
    }
  }, [session]);

  function addToCart(service: Service) {
    setCart((prev) => [
      ...prev,
      { service, quantity: 1, garment_notes: '', answers: {} },
    ]);
  }

  function removeFromCart(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  function updateQuantity(index: number, delta: number) {
    setCart((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item
      )
    );
  }

  function updateNotes(index: number, notes: string) {
    setCart((prev) =>
      prev.map((item, i) => (i === index ? { ...item, garment_notes: notes } : item))
    );
  }

  function updateAnswer(index: number, question: string, answer: string) {
    setCart((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, answers: { ...item.answers, [question]: answer } } : item
      )
    );
  }

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.service.starting_price * item.quantity, 0),
    [cart]
  );
  const deliveryFee = config.pickup_delivery_fee || 0;
  const total = subtotal + deliveryFee;

  function validateStep(currentStep: number): boolean {
    const errs: Record<string, string> = {};
    if (currentStep === 0 && cart.length === 0) {
      errs.cart = 'Please select at least one service.';
    }
    if (currentStep === 2) {
      const phoneCheck = validateIndianMobile(customer.phone);
      if (!customer.name.trim()) errs.name = 'Full name is required.';
      if (!customer.phone.trim()) errs.phone = 'Mobile number is required.';
      else if (!phoneCheck.valid) errs.phone = 'Please enter a valid 10-digit Indian mobile number.';
      if (!customer.address.trim()) errs.address = 'Pickup address is required.';
      if (!customer.locality.trim()) errs.locality = 'Locality is required.';
      if (!customer.pin_code.trim()) errs.pin_code = 'PIN code is required.';
      else if (!validatePincode(customer.pin_code)) errs.pin_code = 'Enter a valid 6-digit PIN code.';
      if (!customer.pickup_date) errs.pickup_date = 'Preferred pickup date is required.';
      if (!customer.pickup_window) errs.pickup_window = 'Please select a pickup time window.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function nextStep() {
    if (validateStep(step)) {
      setStep((s) => Math.min(s + 1, 4));
    }
  }

  function prevStep() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function submitBooking() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { data: refData, error: refError } = await supabase.rpc('generate_booking_reference');
      if (refError || !refData) throw new Error('Could not generate booking reference.');
      const reference = refData as string;

      const phoneNormalized = validateIndianMobile(customer.phone).normalized;

      const { data: bookingData, error: bookingError } = await supabase
        .from('bookings')
        .insert({
          booking_reference: reference,
          user_id: session?.user?.id || null,
          customer_name: customer.name.trim(),
          customer_phone: phoneNormalized,
          customer_email: customer.email.trim(),
          pickup_address: customer.address.trim(),
          locality: customer.locality.trim(),
          pin_code: customer.pin_code.trim(),
          preferred_pickup_date: customer.pickup_date || null,
          preferred_pickup_window: customer.pickup_window,
          additional_instructions: customer.instructions.trim(),
          status: 'request_received',
          estimated_total: total,
          pickup_delivery_fee: deliveryFee,
          payment_status: 'pending',
          payment_method: 'manual',
        })
        .select('id')
        .single();

      if (bookingError || !bookingData) throw new Error('Failed to save booking. Please try again.');

      const bookingId = bookingData.id;
      const items = cart.map((item) => ({
        booking_id: bookingId,
        service_id: item.service.id,
        service_name: item.service.name,
        quantity: item.quantity,
        garment_notes: item.garment_notes + (Object.keys(item.answers).length > 0
          ? '\n' + Object.entries(item.answers).map(([k, v]) => `${k}: ${v}`).join('\n')
          : ''),
        unit_price: item.service.starting_price,
        line_total: item.service.starting_price * item.quantity,
      }));

      const { error: itemsError } = await supabase.from('booking_items').insert(items);
      if (itemsError) throw new Error('Failed to save booking items. Please try again.');

      const { error: historyError } = await supabase.from('booking_status_history').insert({
        booking_id: bookingId,
        status: 'request_received',
        note: 'Booking request submitted by customer.',
        is_internal: false,
      });
      if (historyError) throw new Error('Failed to create status history.');

      // Fire notification to admin (edge function — non-blocking, best-effort)
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        await fetch(`${supabaseUrl}/functions/v1/new-booking-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({
            record: {
              id: bookingId,
              booking_reference: reference,
              customer_name: customer.name.trim(),
              customer_phone: phoneNormalized,
              customer_email: customer.email.trim(),
              pickup_address: customer.address.trim(),
              locality: customer.locality.trim(),
              pin_code: customer.pin_code.trim(),
              preferred_pickup_date: customer.pickup_date || null,
              preferred_pickup_window: customer.pickup_window,
              additional_instructions: customer.instructions.trim(),
              estimated_total: total,
            },
          }),
        });
      } catch {
        // Notification failure should not block the booking confirmation
      }

      setBookingRef(reference);
      setStep(4);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  }

  const pincodeServiceable = customer.pin_code ? isPincodeServiceable(customer.pin_code, areas) : null;

  // Confirmation step
  if (step === 4 && bookingRef) {
    return <BookingConfirmation ref={bookingRef} customer={customer} total={total} config={config} />;
  }

  return (
    <div className="animate-fade-in">
      <section className="bg-forest-50 py-10">
        <div className="mx-auto max-w-4xl px-4 text-center lg:px-8">
          <h1 className="mb-2 text-3xl font-semibold text-charcoal-900">Book a Pickup</h1>
          <p className="text-charcoal-500">Tell us what you need — we'll handle the rest.</p>
        </div>
      </section>

      {/* Stepper */}
      <div className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          {STEPS.slice(0, 4).map((label, i) => (
            <div key={i} className="flex flex-1 items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                    i < step
                      ? 'bg-forest-600 text-ivory-50'
                      : i === step
                      ? 'bg-terracotta-500 text-ivory-50'
                      : 'bg-ivory-200 text-charcoal-400'
                  }`}
                >
                  {i < step ? <CheckCircle className="h-5 w-5" /> : i + 1}
                </div>
                <span className={`mt-1 hidden text-xs sm:block ${i <= step ? 'text-charcoal-700' : 'text-charcoal-400'}`}>
                  {label}
                </span>
              </div>
              {i < 3 && (
                <div className={`mx-2 h-0.5 flex-1 rounded ${i < step ? 'bg-forest-600' : 'bg-ivory-300'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step 0: Choose Service */}
        {step === 0 && (
          <div className="animate-fade-in">
            <h2 className="mb-4 text-xl font-semibold text-charcoal-800">Choose Your Service</h2>
            {loading ? (
              <div className="py-12 text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-forest-600" />
                <p className="mt-3 text-sm text-charcoal-500">Loading services...</p>
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {services.map((service) => {
                    const inCart = cart.find((c) => c.service.id === service.id);
                    return (
                      <button
                        key={service.id}
                        onClick={() => (inCart ? removeFromCart(cart.indexOf(inCart)) : addToCart(service))}
                        className={`card flex items-center gap-3 p-4 text-left transition-all ${
                          inCart ? 'ring-2 ring-forest-500' : 'hover:shadow-elevated'
                        }`}
                      >
                        <img src={service.image_url} alt={service.name} className="h-16 w-16 flex-shrink-0 rounded-lg object-cover" />
                        <div className="flex-1">
                          <h3 className="text-sm font-semibold text-charcoal-800">{service.name}</h3>
                          <p className="text-xs text-charcoal-500">{formatINR(service.starting_price)} onwards</p>
                        </div>
                        <div className={`flex h-6 w-6 items-center justify-center rounded-full ${inCart ? 'bg-forest-600 text-ivory-50' : 'bg-ivory-200 text-charcoal-400'}`}>
                          {inCart ? <CheckCircle className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {errors.cart && (
                  <p className="mt-3 flex items-center gap-1 text-sm text-terracotta-600">
                    <AlertCircle className="h-4 w-4" /> {errors.cart}
                  </p>
                )}
                {cart.length > 0 && (
                  <div className="mt-6 rounded-xl bg-forest-50 p-4">
                    <p className="mb-2 text-sm font-medium text-forest-700">{cart.length} service(s) selected</p>
                    <div className="space-y-1">
                      {cart.map((item, i) => (
                        <div key={i} className="flex justify-between text-sm text-charcoal-600">
                          <span>{item.service.name} × {item.quantity}</span>
                          <span>{formatINR(item.service.starting_price * item.quantity)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Step 1: Garment Details */}
        {step === 1 && (
          <div className="animate-fade-in">
            <h2 className="mb-4 text-xl font-semibold text-charcoal-800">Garment Details</h2>
            <p className="mb-6 text-sm text-charcoal-500">Tell us about each garment and what work is needed.</p>
            <div className="space-y-6">
              {cart.map((item, index) => (
                <div key={index} className="card p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <img src={item.service.image_url} alt={item.service.name} className="h-12 w-12 rounded-lg object-cover" />
                      <h3 className="font-semibold text-charcoal-800">{item.service.name}</h3>
                    </div>
                    <button onClick={() => removeFromCart(index)} className="text-charcoal-400 hover:text-terracotta-500">
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="mb-4">
                    <label className="label-field">Quantity</label>
                    <div className="flex items-center gap-3">
                      <button onClick={() => updateQuantity(index, -1)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-ivory-200 text-charcoal-600 hover:bg-ivory-300">
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-12 text-center font-semibold">{item.quantity}</span>
                      <button onClick={() => updateQuantity(index, 1)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-ivory-200 text-charcoal-600 hover:bg-ivory-300">
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {item.service.customization_questions.map((q, qi) => (
                    <div key={qi} className="mb-4">
                      <label className="label-field">{q.question}</label>
                      <input
                        type="text"
                        value={item.answers[q.question] || ''}
                        onChange={(e) => updateAnswer(index, q.question, e.target.value)}
                        className="input-field"
                        placeholder="Your answer..."
                      />
                    </div>
                  ))}

                  <div>
                    <label className="label-field">Garment & work notes</label>
                    <textarea
                      value={item.garment_notes}
                      onChange={(e) => updateNotes(index, e.target.value)}
                      rows={3}
                      className="input-field resize-none"
                      placeholder="Describe the garment, what needs to be done, and any specific preferences..."
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Customer Details */}
        {step === 2 && (
          <div className="animate-fade-in">
            <h2 className="mb-4 text-xl font-semibold text-charcoal-800">Customer Details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label-field">Full Name *</label>
                <input type="text" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} className="input-field" placeholder="Your full name" />
                {errors.name && <p className="mt-1 text-xs text-terracotta-600">{errors.name}</p>}
              </div>
              <div>
                <label className="label-field">Mobile Number *</label>
                <input type="tel" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} className="input-field" placeholder="10-digit mobile number" />
                {errors.phone && <p className="mt-1 text-xs text-terracotta-600">{errors.phone}</p>}
              </div>
              <div>
                <label className="label-field">Email (optional)</label>
                <input type="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} className="input-field" placeholder="your@email.com" />
              </div>
              <div>
                <label className="label-field">Locality *</label>
                <input type="text" value={customer.locality} onChange={(e) => setCustomer({ ...customer, locality: e.target.value })} className="input-field" placeholder="e.g. Kondapur, Gachibowli" />
                {errors.locality && <p className="mt-1 text-xs text-terracotta-600">{errors.locality}</p>}
              </div>
              <div className="sm:col-span-2">
                <label className="label-field">Complete Pickup Address *</label>
                <textarea value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} rows={3} className="input-field resize-none" placeholder="Flat / House no, building, street, landmark" />
                {errors.address && <p className="mt-1 text-xs text-terracotta-600">{errors.address}</p>}
              </div>
              <div>
                <label className="label-field">PIN Code *</label>
                <input type="text" value={customer.pin_code} onChange={(e) => setCustomer({ ...customer, pin_code: e.target.value })} className="input-field" placeholder="6-digit PIN code" maxLength={6} />
                {errors.pin_code && <p className="mt-1 text-xs text-terracotta-600">{errors.pin_code}</p>}
                {pincodeServiceable === false && !errors.pin_code && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-terracotta-600">
                    <AlertCircle className="h-3 w-3" /> We may not currently serve this PIN code. We'll confirm availability after you submit.
                  </p>
                )}
                {pincodeServiceable === true && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-forest-600">
                    <CheckCircle className="h-3 w-3" /> Great! We serve this area.
                  </p>
                )}
              </div>
              <div>
                <label className="label-field">Preferred Pickup Date *</label>
                <input
                  type="date"
                  value={customer.pickup_date}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setCustomer({ ...customer, pickup_date: e.target.value })}
                  className="input-field"
                />
                {errors.pickup_date && <p className="mt-1 text-xs text-terracotta-600">{errors.pickup_date}</p>}
              </div>
              <div className="sm:col-span-2">
                <label className="label-field">Preferred Pickup Time Window *</label>
                <div className="flex flex-wrap gap-2">
                  {PICKUP_WINDOWS.map((w) => (
                    <button
                      key={w}
                      onClick={() => setCustomer({ ...customer, pickup_window: w })}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                        customer.pickup_window === w
                          ? 'bg-forest-600 text-ivory-50'
                          : 'bg-ivory-200 text-charcoal-600 hover:bg-ivory-300'
                      }`}
                    >
                      {w}
                    </button>
                  ))}
                </div>
                {errors.pickup_window && <p className="mt-1 text-xs text-terracotta-600">{errors.pickup_window}</p>}
              </div>
              <div className="sm:col-span-2">
                <label className="label-field">Additional Instructions (optional)</label>
                <textarea value={customer.instructions} onChange={(e) => setCustomer({ ...customer, instructions: e.target.value })} rows={2} className="input-field resize-none" placeholder="Any special instructions for pickup or delivery..." />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Price Summary */}
        {step === 3 && (
          <div className="animate-fade-in">
            <h2 className="mb-4 text-xl font-semibold text-charcoal-800">Price Summary</h2>
            <div className="card mb-6 p-6">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-charcoal-500">Selected Services</h3>
              <div className="space-y-3">
                {cart.map((item, i) => (
                  <div key={i} className="flex justify-between border-b border-ivory-300 pb-3 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-charcoal-800">{item.service.name}</p>
                      <p className="text-xs text-charcoal-500">Qty: {item.quantity}</p>
                    </div>
                    <span className="text-sm font-medium text-charcoal-700">
                      {formatINR(item.service.starting_price * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-2 border-t border-ivory-300 pt-4">
                <div className="flex justify-between text-sm text-charcoal-600">
                  <span>Service Subtotal (estimate)</span>
                  <span>{formatINR(subtotal)}</span>
                </div>
                {deliveryFee > 0 && (
                  <div className="flex justify-between text-sm text-charcoal-600">
                    <span>Pickup & Delivery</span>
                    <span>{formatINR(deliveryFee)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-ivory-300 pt-2 text-base font-semibold text-charcoal-800">
                  <span>Total Estimate</span>
                  <span className="text-forest-700">{formatINR(total)}</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-terracotta-50 p-4">
              <p className="text-sm text-charcoal-600">
                <strong>Please note:</strong> This is an indicative estimate based on starting prices. The final amount will be confirmed before any work begins. No payment is required at this stage.
              </p>
            </div>

            {submitError && (
              <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">
                <p className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" /> {submitError}
                </p>
              </div>
            )}

            <div className="mt-6">
              <button
                onClick={submitBooking}
                disabled={submitting}
                className="btn-primary w-full"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    Confirm & Submit Booking
                  </>
                )}
              </button>
              <p className="mt-3 text-center text-xs text-charcoal-400">
                By submitting, you agree to our terms. We'll confirm the price and pickup details before starting any work.
              </p>
            </div>
          </div>
        )}

        {/* Navigation */}
        {step < 3 && (
          <div className="mt-8 flex items-center justify-between">
            <button
              onClick={prevStep}
              disabled={step === 0}
              className="btn-ghost disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            <button onClick={nextStep} className="btn-primary">
              Continue
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
        {step === 3 && (
          <div className="mt-4 flex items-center justify-between">
            <button onClick={prevStep} className="btn-ghost">
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function BookingConfirmation({
  ref: bookingRef,
  customer,
  total,
  config,
}: {
  ref: string;
  customer: { name: string; phone: string };
  total: number;
  config: { whatsapp_number: string };
}) {
  const whatsappMsg = `Hi StitchDoor, my booking reference is ${bookingRef}. I'd like to know the next steps.`;
  const whatsappNumber = config.whatsapp_number?.replace(/\D/g, '');

  return (
    <div className="animate-fade-in mx-auto max-w-2xl px-4 py-16 lg:px-8">
      <div className="card overflow-hidden p-8 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-forest-100">
          <CheckCircle className="h-10 w-10 text-forest-600" />
        </div>
        <h1 className="mb-2 text-2xl font-semibold text-charcoal-900">Booking Confirmed!</h1>
        <p className="mb-6 text-charcoal-500">Your request has been received. We'll contact you shortly to confirm the price and pickup details.</p>

        <div className="mb-6 rounded-xl bg-forest-50 p-6">
          <p className="mb-1 text-xs uppercase tracking-wider text-charcoal-500">Your Booking Reference</p>
          <p className="text-2xl font-bold tracking-wider text-forest-700">{bookingRef}</p>
          <p className="mt-2 text-xs text-charcoal-400">Save this reference to track your order status.</p>
        </div>

        <div className="mb-6 space-y-2 text-left">
          <div className="flex justify-between text-sm">
            <span className="text-charcoal-500">Name</span>
            <span className="font-medium text-charcoal-800">{customer.name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-charcoal-500">Estimated Total</span>
            <span className="font-medium text-charcoal-800">{formatINR(total)}</span>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/track" className="btn-primary">
            Track Your Order
          </Link>
          {whatsappNumber && (
            <a
              href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMsg)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary"
            >
              Contact on WhatsApp
            </a>
          )}
          <Link to="/" className="btn-ghost">
            Back to Home
          </Link>
        </div>

        <div className="mt-8 rounded-xl bg-ivory-200 p-4 text-left">
          <h3 className="mb-2 text-sm font-semibold text-charcoal-700">What happens next?</h3>
          <ol className="space-y-2 text-sm text-charcoal-600">
            <li>1. We review your request and prepare a price estimate.</li>
            <li>2. We contact you to confirm the price and pickup time.</li>
            <li>3. Our team picks up your garments at the scheduled time.</li>
            <li>4. Your tailoring partner completes the work with quality checks.</li>
            <li>5. We deliver your finished garments back to your door.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
