import type { BookingStatus, PaymentStatus } from './types';

export const STATUS_FLOW: { key: BookingStatus; label: string; description: string }[] = [
  { key: 'request_received', label: 'Request Received', description: 'We have received your booking request.' },
  { key: 'awaiting_confirmation', label: 'Awaiting Price Confirmation', description: 'We are preparing your price estimate.' },
  { key: 'price_confirmed', label: 'Price Confirmed', description: 'The final price has been confirmed.' },
  { key: 'pickup_scheduled', label: 'Pickup Scheduled', description: 'Your pickup has been scheduled.' },
  { key: 'picked_up', label: 'Picked Up', description: 'Your garments have been picked up.' },
  { key: 'at_tailoring_partner', label: 'At Tailoring Partner', description: 'Your garments are with the tailoring partner.' },
  { key: 'quality_check', label: 'Quality Check', description: 'Your completed order is being quality checked.' },
  { key: 'ready_for_delivery', label: 'Ready for Delivery', description: 'Your order is ready and on its way back.' },
  { key: 'delivered', label: 'Delivered', description: 'Your order has been delivered.' },
  { key: 'cancelled', label: 'Cancelled', description: 'This booking has been cancelled.' },
];

export const STATUS_LABELS: Record<BookingStatus, string> = STATUS_FLOW.reduce(
  (acc, s) => ({ ...acc, [s.key]: s.label }),
  {} as Record<BookingStatus, string>
);

export const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  pending: 'Pending',
  partial: 'Partially Paid',
  paid: 'Paid',
  refunded: 'Refunded',
};

export const PICKUP_WINDOWS = [
  '9 AM – 11 AM',
  '11 AM – 1 PM',
  '1 PM – 3 PM',
  '3 PM – 5 PM',
  '5 PM – 7 PM',
];

export const SERVICE_CATEGORIES = [
  'All',
  'Alterations',
  'Blouse',
  'Repairs',
  'Transformation',
  'Custom',
];

export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function getStatusIndex(status: BookingStatus): number {
  if (status === 'cancelled') return -1;
  return STATUS_FLOW.findIndex((s) => s.key === status);
}
