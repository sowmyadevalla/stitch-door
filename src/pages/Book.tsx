import { useState, useEffect, useMemo } from 'react';
import { CheckCircle, ChevronRight, ChevronLeft, Plus, Minus, Trash2, AlertCircle, Loader2, Ruler, Home, ClipboardCheck } from 'lucide-react';
import { Link } from '@/lib/router';
import { useServices } from '@/lib/services';
import { useBusinessConfig, useServiceableAreas, isPincodeServiceable } from '@/lib/config';
import { formatINR, PICKUP_WINDOWS } from '@/lib/constants';
import { validateIndianMobile, validatePincode, isWindowInPast, availableWindows, istNow } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { PhotoUploader, uploadBookingPhotos } from '@/components/PhotoUploader';
import type { CartItem, Service, MeasurementMode } from '@/lib/types';
import type { PhotoEntry } from '@/components/PhotoUploader';

const STEPS = ['Choose Service', 'Garment & Measurements', 'Address & Appointment', 'Review', 'Confirmation'];

// Measurement fields relevant per service category. Alterations and repairs
// only need fit guidance, not a full measurement set.
const MEASUREMENT_FIELDS = [
  { key: 'bust_chest', label: 'Bust / Chest (inches)' },
  { key: 'waist', label: 'Waist (inches)' },
  { key: 'hip', label: 'Hip (inches)' },
  { key: 'shoulder', label: 'Shoulder (inches)' },
  { key: 'sleeve_length', label: 'Sleeve length (inches)' },
  { key: 'length', label: 'Garment length (inches)' },
];
const FULL_SET = MEASUREMENT_FIELDS;
const ALTERATION_SET = [
  { key: 'length', label: 'Desired length (inches, optional)' },
  { key: 'waist', label: 'Waist (inches, optional)' },
];

const MEASUREMENT_SETS: Record<string, typeof MEASUREMENT_FIELDS> = {
  stitching: FULL_SET,
  custom: FULL_SET,
  transformation: FULL_SET,
  alterations: ALTERATION_SET,
  repairs: ALTERATION_SET,
};

const MEASUREMENT_MODES: { key: MeasurementMode; label: string; description: string; icon: typeof Ruler }[] = [
  { key: 'enter_now', label: 'I will provide my measurements', description: 'Enter them yourself — best for standard fits and repeat orders.', icon: Ruler },
  { key: 'home_visit', label: 'I need a tailor to take my measurements', description: 'A tailor visits your home, measures you, then work begins.', icon: Home },
  { key: 'at_pickup', label: 'Measure at pickup', description: 'Keep a well-fitting reference garment ready and our team will note measurements at pickup.', icon: ClipboardCheck },
];

function newCartItem(service: Service): CartItem {
  return {
    service,
    quantity: 1,
    garment_notes: '',
    answers: {},
    measurement_mode: 'enter_now',
    measurements: {},
    visit_preference: '',
  };
}

function measurementFieldsFor(service: Service) {
  return MEASUREMENT_SETS[service.category] || FULL_SET;
}

export function Book({ preselectedSlug }: { preselectedSlug?: string }) {
  const { services, loading } = useServices();
  const { config } = useBusinessConfig();
  const { areas, loading: areasLoading } = useServiceableAreas();
  const { session } = useAuth();

  const [step, setStep] = useState(0);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState({
    name: '',
    phone: '',
    email: '',
    house_street: '',
    landmark: '',
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
  const [confirmationData, setConfirmationData] = useState<{
    items: { name: string; qty: number; total: number }[];
    date: string;
    window: string;
    total: number;
  } | null>(null);
  const [photosByItem, setPhotosByItem] = useState<Record<number, PhotoEntry[]>>({});
  const clientRequestId = useMemo(() => crypto.randomUUID(), []);

  useEffect(() => {
    if (!loading && preselectedSlug) {
      const svc = services.find((s) => s.slug === preselectedSlug);
      if (svc && !cart.find((c) => c.service.id === svc.id)) {
        setCart((prev) => [...prev, newCartItem(svc)]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setCart((prev) => [...prev, newCartItem(service)]);
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

  function updateMeasurementMode(index: number, mode: MeasurementMode) {
    setCart((prev) =>
      prev.map((item, i) => (i === index ? { ...item, measurement_mode: mode } : item))
    );
  }

  function updateMeasurement(index: number, key: string, value: string) {
    setCart((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, measurements: { ...item.measurements, [key]: value } } : item
      )
    );
  }

  function updateVisitPreference(index: number, value: string) {
    setCart((prev) =>
      prev.map((item, i) => (i === index ? { ...item, visit_preference: value } : item))
    );
  }

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.service.starting_price * item.quantity, 0),
    [cart]
  );
  const deliveryFee = config.pickup_delivery_fee || 0;
  const total = subtotal + deliveryFee;

  const pincodeServiceable = customer.pin_code
    ? isPincodeServiceable(customer.pin_code, areas)
    : null;
  const fullAddress = [
    customer.house_street.trim(),
    customer.landmark.trim(),
    customer.locality.trim(),
  ].filter(Boolean).join(', ');

  function validateStep(currentStep: number): boolean {
    const errs: Record<string, string> = {};
    if (currentStep === 0 && cart.length === 0) {
      errs.cart = 'Please select at least one service.';
    }
    if (currentStep === 1) {
      cart.forEach((item, index) => {
        const fields = measurementFieldsFor(item.service);
        if (item.measurement_mode === 'enter_now') {
          const hasAny = fields.some((f) => item.measurements[f.key]?.trim());
          const required = item.service.category === 'Blouse' || item.service.category === 'Custom' || item.service.category === 'Transformation';
          if (!hasAny && required) {
            errs[`measurements_${index}`] = `For ${item.service.name}, enter at least one measurement, or choose a tailor visit / measure at pickup instead.`;
          }
          Object.entries(item.measurements).forEach(([, v]) => {
            if (v.trim() && !/^\d{1,3}(\.\d)?$/.test(v.trim())) {
              errs[`measurements_${index}`] = `Measurements must be numbers (inches), e.g. 36 or 36.5 — please check ${item.service.name}.`;
            }
          });
        }
        if (item.measurement_mode === 'home_visit' && !item.visit_preference.trim()) {
          errs[`visit_${index}`] = `For ${item.service.name}, tell us your preferred days/time for the measurement visit.`;
        }
      });
    }
    if (currentStep === 2) {
      const phoneCheck = validateIndianMobile(customer.phone);
      if (!customer.name.trim()) errs.name = 'Full name is required.';
      if (!customer.phone.trim()) errs.phone = 'Mobile number is required.';
      else if (!phoneCheck.valid) errs.phone = 'Please enter a valid 10-digit Indian mobile number.';
      if (!customer.house_street.trim()) errs.house_street = 'House / flat number and street are required.';
      else if (customer.house_street.trim().length < 5) errs.house_street = 'Please enter your house/flat number and street name.';
      if (!customer.locality.trim()) errs.locality = 'Locality / area is required.';
      if (!customer.pin_code.trim()) errs.pin_code = 'PIN code is required.';
      else if (!validatePincode(customer.pin_code)) errs.pin_code = 'Enter a valid 6-digit PIN code.';
      else if (areas.length > 0 && pincodeServiceable === false) errs.pin_code = 'Sorry, we do not currently serve this PIN code. Try one of our service areas.';
      if (!customer.pickup_date) errs.pickup_date = 'Preferred pickup date is required.';
      else if (customer.pickup_date < istNow().date) errs.pickup_date = 'Please choose today or a future date.';
      if (!customer.pickup_window) errs.pickup_window = 'Please select a pickup time window.';
      else if (isWindowInPast(customer.pickup_date, customer.pickup_window)) {
        errs.pickup_window = 'That time window has already passed today. Please pick a later window or another date.';
      }
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
    // Revalidate at submit time: the clock may have moved past a window
    // the customer selected earlier, and availability may have changed.
    if (!validateStep(2)) {
      setStep(2);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const phoneNormalized = validateIndianMobile(customer.phone).normalized;

      const { data, error: rpcError } = await supabase.rpc('create_booking', {
        p_payload: {
          client_request_id: clientRequestId,
          customer_name: customer.name.trim(),
          customer_phone: phoneNormalized,
          customer_email: customer.email.trim(),
          pickup_address: fullAddress,
          locality: customer.locality.trim(),
          pin_code: customer.pin_code.trim(),
          preferred_pickup_date: customer.pickup_date || null,
          preferred_pickup_window: customer.pickup_window,
          additional_instructions: customer.instructions.trim(),
          items: cart.map((item) => {
            const measurementLines: string[] = [];
            if (item.measurement_mode === 'enter_now') {
              const entered = measurementFieldsFor(item.service).filter(
                (f) => item.measurements[f.key]?.trim()
              ).map((f) => `${f.label}: ${item.measurements[f.key].trim()}`);
              if (entered.length > 0) measurementLines.push(`Measurements (customer-provided):\n${entered.join('\n')}`);
            } else if (item.measurement_mode === 'home_visit') {
              measurementLines.push(`MEASUREMENTS PENDING — home measurement visit requested. Preferred: ${item.visit_preference.trim()}`);
            } else {
              measurementLines.push('MEASUREMENTS PENDING — to be taken at pickup (customer will bring reference garment).');
            }
            const answers = Object.entries(item.answers).map(([k, v]) => `${k}: ${v}`);
            return {
              service_id: item.service.id,
              quantity: item.quantity,
              garment_notes: [
                item.garment_notes.trim(),
                ...answers,
                ...measurementLines,
              ].filter(Boolean).join('\n'),
            };
          }),
        },
      });

      if (rpcError) throw new Error('Failed to save booking. Please try again.');

      const result = data as {
        error?: string;
        booking_reference?: string;
        tracking_token?: string;
        estimated_total?: number;
        duplicate?: boolean;
      };

      if (result?.error) {
        const messages: Record<string, string> = {
          missing_fields: 'Please fill in all required fields.',
          invalid_phone: 'Please enter a valid 10-digit Indian mobile number.',
          invalid_pincode: 'Please enter a valid 6-digit PIN code.',
          unservable_pincode: 'Sorry, we do not currently serve this PIN code. Please check our service areas.',
          invalid_slot: 'That pickup date or time window has already passed. Please go back and choose a future slot.',
          invalid_service: 'One of the selected services is no longer available. Please review your selection.',
          empty_items: 'Please select at least one service.',
          server_error: 'Something went wrong while saving. Please try again.',
        };
        throw new Error(messages[result.error] || 'Could not save the booking. Please try again.');
      }

      if (!result?.booking_reference) throw new Error('Could not save the booking. Please try again.');

      const reference = result.booking_reference;
      const bookingId = (data as { booking_id?: string }).booking_id || '';

      // Best-effort photo upload — booking is already saved if this fails
      try {
        const allPhotos = Object.values(photosByItem).flat();
        await uploadBookingPhotos(bookingId, result.tracking_token, allPhotos);
      } catch {
        // photo upload failure does not invalidate the booking
      }

      // Save the tracking token so the guest can track without re-verifying
      try {
        const stored = JSON.parse(localStorage.getItem('sd_tracking') || '{}');
        stored[reference] = { token: result.tracking_token, savedAt: Date.now() };
        localStorage.setItem('sd_tracking', JSON.stringify(stored));
      } catch {
        // tracking token storage is best-effort
      }

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
              pickup_address: fullAddress,
              locality: customer.locality.trim(),
              pin_code: customer.pin_code.trim(),
              preferred_pickup_date: customer.pickup_date || null,
              preferred_pickup_window: customer.pickup_window,
              additional_instructions: customer.instructions.trim(),
              estimated_total: result.estimated_total,
            },
          }),
        });
      } catch {
        // Notification failure should not block the booking confirmation
      }

      setConfirmationData({
        items: cart.map((item) => ({
          name: item.service.name,
          qty: item.quantity,
          total: item.service.starting_price * item.quantity,
        })),
        date: customer.pickup_date,
        window: customer.pickup_window,
        total: result.estimated_total ?? total,
      });
      setBookingRef(reference);
      setStep(4);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  }

  // Confirmation step
  if (step === 4 && bookingRef) {
    return (
      <BookingConfirmation
        bookingRef={bookingRef}
        confirmation={confirmationData}
        customerName={customer.name}
        hasToken={(() => {
          try {
            return Boolean(JSON.parse(localStorage.getItem('sd_tracking') || '{}')[bookingRef]?.token);
          } catch {
            return false;
          }
        })()}
      />
    );
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
        <div className="mb-8">
          <p className="mb-2 text-center text-xs font-medium uppercase tracking-wider text-charcoal-400 sm:hidden">
            Step {step + 1} of 4 · {STEPS[step]}
          </p>
          <div className="flex items-center justify-between">
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

        {/* Step 1: Garment Details & Measurements */}
        {step === 1 && (
          <div className="animate-fade-in">
            <h2 className="mb-4 text-xl font-semibold text-charcoal-800">Garment Details & Measurements</h2>
            <p className="mb-6 text-sm text-charcoal-500">
              Tell us about each garment, then choose how you'd like measurements taken.
            </p>
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

                  {/* Measurement mode selection */}
                  <div className="rounded-xl bg-ivory-200 p-4">
                    <label className="label-field">How should we take measurements?</label>
                    <div className="mt-2 space-y-2">
                      {MEASUREMENT_MODES.map((mode) => (
                        <button
                          key={mode.key}
                          type="button"
                          onClick={() => updateMeasurementMode(index, mode.key)}
                          className={`flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors ${
                            item.measurement_mode === mode.key
                              ? 'bg-forest-600 text-ivory-50'
                              : 'bg-ivory-50 hover:bg-ivory-300'
                          }`}
                        >
                          <mode.icon className={`mt-0.5 h-5 w-5 flex-shrink-0 ${item.measurement_mode === mode.key ? 'text-ivory-200' : 'text-forest-600'}`} />
                          <span>
                            <span className="block text-sm font-medium">{mode.label}</span>
                            <span className={`block text-xs ${item.measurement_mode === mode.key ? 'text-ivory-200' : 'text-charcoal-500'}`}>
                              {mode.description}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>

                    {item.measurement_mode === 'enter_now' && (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {measurementFieldsFor(item.service).map((f) => (
                          <div key={f.key}>
                            <label className="label-field">{f.label}</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={item.measurements[f.key] || ''}
                              onChange={(e) => updateMeasurement(index, f.key, e.target.value)}
                              className="input-field"
                              placeholder="e.g. 36"
                            />
                          </div>
                        ))}
                        <p className="text-xs text-charcoal-400 sm:col-span-2">
                          Enter at least one measurement. Leave out any you're unsure about — our tailor will verify at pickup.
                        </p>
                      </div>
                    )}

                    {item.measurement_mode === 'home_visit' && (
                      <div className="mt-4">
                        <label className="label-field">Preferred days & time for the visit *</label>
                        <input
                          type="text"
                          value={item.visit_preference}
                          onChange={(e) => updateVisitPreference(index, e.target.value)}
                          className="input-field"
                          placeholder="e.g. Weekday mornings, or Saturday after 4 PM"
                        />
                        {errors[`visit_${index}`] && (
                          <p className="mt-1 text-xs text-terracotta-600">{errors[`visit_${index}`]}</p>
                        )}
                        <p className="mt-1 text-xs text-charcoal-400">
                          A tailor will call you to fix an exact time within business hours ({config.business_hours}).
                          There is no extra charge for the measurement visit — it's included with your order.
                          Measurements are recorded as pending until the visit.
                        </p>
                      </div>
                    )}

                    {item.measurement_mode === 'at_pickup' && (
                      <p className="mt-4 rounded-lg bg-forest-50 p-3 text-xs text-charcoal-600">
                        Noted — our pickup team will record your measurements at pickup. Please keep a
                        well-fitting reference garment ready. Measurements are recorded as pending until then.
                      </p>
                    )}
                  </div>

                  <div className="mt-4">
                    <label className="label-field">Garment & work notes</label>
                    <textarea
                      value={item.garment_notes}
                      onChange={(e) => updateNotes(index, e.target.value)}
                      rows={3}
                      className="input-field resize-none"
                      placeholder="Describe the garment, what needs to be done, and any specific preferences..."
                    />
                  </div>

                  {errors[`measurements_${index}`] && (
                    <p className="mt-2 flex items-center gap-1 text-xs text-terracotta-600">
                      <AlertCircle className="h-3 w-3" /> {errors[`measurements_${index}`]}
                    </p>
                  )}

                  <div className="mt-4">
                    <PhotoUploader
                      photos={photosByItem[index] || []}
                      onChange={(entries) => setPhotosByItem((prev) => ({ ...prev, [index]: entries }))}
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
                <input type="tel" inputMode="numeric" autoComplete="tel" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} className="input-field" placeholder="10-digit mobile number" />
                {errors.phone && <p className="mt-1 text-xs text-terracotta-600">{errors.phone}</p>}
              </div>
              <div>
                <label className="label-field">Email (optional)</label>
                <input type="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} className="input-field" placeholder="your@email.com" />
              </div>
              <div>
                <label className="label-field">House / Flat No. & Street *</label>
                <input type="text" value={customer.house_street} onChange={(e) => setCustomer({ ...customer, house_street: e.target.value })} className="input-field" placeholder="e.g. Flat 402, Green Meadows, Road No. 12" autoComplete="street-address" />
                {errors.house_street && <p className="mt-1 text-xs text-terracotta-600">{errors.house_street}</p>}
              </div>
              <div>
                <label className="label-field">Landmark (optional)</label>
                <input type="text" value={customer.landmark} onChange={(e) => setCustomer({ ...customer, landmark: e.target.value })} className="input-field" placeholder="e.g. Near Botanical Garden metro" />
              </div>
              <div>
                <label className="label-field">Locality / Area *</label>
                <input type="text" value={customer.locality} onChange={(e) => setCustomer({ ...customer, locality: e.target.value })} className="input-field" placeholder="e.g. Kondapur, Gachibowli" />
                {errors.locality && <p className="mt-1 text-xs text-terracotta-600">{errors.locality}</p>}
              </div>
              <div>
                <label className="label-field">PIN Code *</label>
                <input type="text" inputMode="numeric" autoComplete="postal-code" value={customer.pin_code} onChange={(e) => setCustomer({ ...customer, pin_code: e.target.value })} className="input-field" placeholder="6-digit PIN code" maxLength={6} />
                {errors.pin_code && <p className="mt-1 text-xs text-terracotta-600">{errors.pin_code}</p>}
                {pincodeServiceable === false && !errors.pin_code && areas.length > 0 && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-terracotta-600">
                    <AlertCircle className="h-3 w-3" /> We do not serve this PIN code yet — please check our service areas.
                  </p>
                )}
                {pincodeServiceable === true && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-forest-600">
                    <CheckCircle className="h-3 w-3" /> Great! We serve this area — pickup, measurement visits, and return delivery are all available here{deliveryFee > 0 ? ` (pickup & delivery: ${formatINR(deliveryFee)})` : ' (pickup & delivery are currently free)'}.
                  </p>
                )}
              </div>
              <div className="sm:col-span-2">
                <div className="rounded-xl bg-forest-50 p-4">
                  <p className="text-sm font-medium text-forest-800">Areas we currently serve</p>
                  {areasLoading ? (
                    <p className="mt-1 text-xs text-charcoal-400">Checking...</p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {areas.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setCustomer((prev) => ({ ...prev, pin_code: a.pin_code, locality: prev.locality || a.locality }))}
                          className="rounded-full bg-ivory-50 px-3 py-1 text-xs text-charcoal-600 transition-colors hover:bg-forest-100 hover:text-forest-700"
                        >
                          {a.locality} · {a.pin_code}
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="mt-2 text-xs text-charcoal-400">Tap an area to fill its PIN code. Not listed? We're expanding — write to us and we'll notify you.</p>
                </div>
              </div>
              <div>
                <label className="label-field">Preferred Pickup Date *</label>
                <input
                  type="date"
                  value={customer.pickup_date}
                  min={istNow().date}
                  onChange={(e) => {
                    const date = e.target.value;
                    setCustomer((prev) => ({
                      ...prev,
                      pickup_date: date,
                      // If the previously chosen window has passed for the new date, clear it
                      pickup_window: date && customer.pickup_window && isWindowInPast(date, customer.pickup_window) ? '' : customer.pickup_window,
                    }));
                  }}
                  className="input-field"
                />
                {errors.pickup_date && <p className="mt-1 text-xs text-terracotta-600">{errors.pickup_date}</p>}
              </div>
              <div className="sm:col-span-2">
                <label className="label-field">Preferred Pickup Time Window *</label>
                {customer.pickup_date && availableWindows(customer.pickup_date).length === 0 ? (
                  <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
                    All of today's pickup windows have passed. Please choose tomorrow or a later date.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {(customer.pickup_date ? availableWindows(customer.pickup_date) : PICKUP_WINDOWS).map((w) => (
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
                )}
                {errors.pickup_window && <p className="mt-1 text-xs text-terracotta-600">{errors.pickup_window}</p>}
                {customer.pickup_date && availableWindows(customer.pickup_date).length > 0 && availableWindows(customer.pickup_date).length < PICKUP_WINDOWS.length && (
                  <p className="mt-1 text-xs text-charcoal-400">Earlier windows today have already passed — only upcoming times are shown.</p>
                )}
              </div>
              <div className="sm:col-span-2">
                <label className="label-field">Additional Instructions (optional)</label>
                <textarea value={customer.instructions} onChange={(e) => setCustomer({ ...customer, instructions: e.target.value })} rows={2} className="input-field resize-none" placeholder="Any special instructions for pickup or delivery..." />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Review & Confirm */}
        {step === 3 && (
          <div className="animate-fade-in">
            <h2 className="mb-4 text-xl font-semibold text-charcoal-800">Review Your Booking</h2>

            {/* Services */}
            <div className="card mb-4 p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-charcoal-500">Your Services</h3>
                <button onClick={() => setStep(0)} className="text-xs font-medium text-forest-600 hover:underline">Edit</button>
              </div>
              <div className="space-y-3">
                {cart.map((item, i) => (
                  <div key={i} className="border-b border-ivory-300 pb-3 last:border-0">
                    <div className="flex justify-between">
                      <div>
                        <p className="text-sm font-medium text-charcoal-800">{item.service.name}</p>
                        <p className="text-xs text-charcoal-500">Qty: {item.quantity}</p>
                        {item.garment_notes && <p className="mt-1 text-xs text-charcoal-400">{item.garment_notes}</p>}
                      </div>
                      <span className="text-sm font-medium text-charcoal-700">
                        {formatINR(item.service.starting_price * item.quantity)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-charcoal-500">
                      Measurements:{' '}
                      {item.measurement_mode === 'enter_now'
                        ? measurementFieldsFor(item.service).some((f) => item.measurements[f.key]?.trim())
                          ? measurementFieldsFor(item.service).filter((f) => item.measurements[f.key]?.trim())
                              .map((f) => `${f.label.replace(/ \(inches\)/, '')} ${item.measurements[f.key]}`)
                              .join(', ')
                          : 'provided at pickup'
                        : item.measurement_mode === 'home_visit'
                        ? `Home visit requested (${item.visit_preference})`
                        : 'at pickup'}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-2 border-t border-ivory-300 pt-4">
                <div className="flex justify-between text-sm text-charcoal-600">
                  <span>Service Subtotal (estimate)</span>
                  <span>{formatINR(subtotal)}</span>
                </div>
                {deliveryFee > 0 ? (
                  <div className="flex justify-between text-sm text-charcoal-600">
                    <span>Pickup & Delivery</span>
                    <span>{formatINR(deliveryFee)}</span>
                  </div>
                ) : (
                  <div className="flex justify-between text-sm text-forest-600">
                    <span>Pickup & Delivery</span>
                    <span className="font-medium">Free</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-ivory-300 pt-2 text-base font-semibold text-charcoal-800">
                  <span>Total Estimate</span>
                  <span className="text-forest-700">{formatINR(total)}</span>
                </div>
              </div>
            </div>

            {/* Pickup details */}
            <div className="card mb-4 p-6">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-charcoal-500">Pickup Details</h3>
                <button onClick={() => setStep(2)} className="text-xs font-medium text-forest-600 hover:underline">Edit</button>
              </div>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-charcoal-400">Name</dt><dd className="text-charcoal-800">{customer.name}</dd></div>
                <div><dt className="text-xs text-charcoal-400">Mobile</dt><dd className="text-charcoal-800">{customer.phone}</dd></div>
                {customer.email && <div><dt className="text-xs text-charcoal-400">Email</dt><dd className="text-charcoal-800">{customer.email}</dd></div>}
                <div><dt className="text-xs text-charcoal-400">Preferred Pickup</dt><dd className="text-charcoal-800">{customer.pickup_date} · {customer.pickup_window}</dd></div>
                <div className="sm:col-span-2"><dt className="text-xs text-charcoal-400">Address</dt><dd className="text-charcoal-800">{fullAddress} — {customer.pin_code}</dd></div>
                {customer.instructions && <div className="sm:col-span-2"><dt className="text-xs text-charcoal-400">Instructions</dt><dd className="text-charcoal-800">{customer.instructions}</dd></div>}
              </dl>
              {Object.values(photosByItem).flat().length > 0 && (
                <div className="mt-3 border-t border-ivory-300 pt-3">
                  <p className="text-xs text-charcoal-400">{Object.values(photosByItem).flat().filter(p => p.status !== 'error').length} garment photo(s) attached</p>
                </div>
              )}
            </div>

            <div className="rounded-xl bg-terracotta-50 p-4">
              <p className="text-sm text-charcoal-600">
                <strong>Please note:</strong> This is an indicative estimate based on starting prices. The final amount will be confirmed with you before any work begins — no payment is required at this stage. You pay after delivery (cash or UPI).
              </p>
            </div>

            {submitError && (
              <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">
                <p className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" /> {submitError}
                </p>
                <p className="mt-2 text-xs text-red-600">
                  Your details are still here — you can safely press Confirm again.
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
  bookingRef,
  confirmation,
  customerName,
  hasToken,
}: {
  bookingRef: string;
  confirmation: {
    items: { name: string; qty: number; total: number }[];
    date: string;
    window: string;
    total: number;
  } | null;
  customerName: string;
  hasToken: boolean;
}) {
  const whatsappMsg = `Hi StitchDoor, my booking reference is ${bookingRef}. I'd like to know the next steps.`;

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

        {confirmation && (
          <div className="mb-6 space-y-2 rounded-xl bg-ivory-200 p-4 text-left">
            {confirmation.items.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-charcoal-600">{item.name} × {item.qty}</span>
                <span className="font-medium text-charcoal-800">{formatINR(item.total)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-ivory-300 pt-2 text-sm">
              <span className="text-charcoal-500">Preferred Pickup</span>
              <span className="font-medium text-charcoal-800">{confirmation.date} · {confirmation.window}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-charcoal-500">Estimated Total</span>
              <span className="font-semibold text-forest-700">{formatINR(confirmation.total)}</span>
            </div>
          </div>
        )}

        <div className="flex flex-wrap justify-center gap-3">
          {hasToken ? (
            <Link to={`/track?ref=${bookingRef}`} className="btn-primary">
              Track This Order
            </Link>
          ) : (
            <Link to="/track" className="btn-primary">
              Track Your Order
            </Link>
          )}
          <a
            href={`https://wa.me/?text=${encodeURIComponent(whatsappMsg)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
          >
            Contact on WhatsApp
          </a>
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
        <p className="mt-4 text-xs text-charcoal-400">Booking for: {customerName}</p>
      </div>
    </div>
  );
}
