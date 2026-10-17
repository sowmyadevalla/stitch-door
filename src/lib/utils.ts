import { PICKUP_WINDOWS } from './constants';

export function validateIndianMobile(input: string): { valid: boolean; normalized: string } {
  let phone = input.replace(/\s|-/g, '');
  if (phone.startsWith('+91')) phone = phone.slice(3);
  if (phone.startsWith('91') && phone.length === 12) phone = phone.slice(2);
  if (phone.startsWith('0')) phone = phone.slice(1);
  if (phone.length === 10 && /^[6-9]\d{9}$/.test(phone)) {
    return { valid: true, normalized: phone };
  }
  return { valid: false, normalized: input };
}

export function validatePincode(input: string): boolean {
  return /^[1-9]\d{5}$/.test(input.trim());
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Not specified';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const WINDOW_END_MINUTES: Record<string, number> = {
  '9 AM – 11 AM': 11 * 60,
  '11 AM – 1 PM': 13 * 60,
  '1 PM – 3 PM': 15 * 60,
  '3 PM – 5 PM': 17 * 60,
  '5 PM – 7 PM': 19 * 60,
};

// Current date/time in the business timezone (Asia/Kolkata)
export function istNow(): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  const hour = parseInt(get('hour'), 10) % 24;
  const minute = parseInt(get('minute'), 10);
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: hour * 60 + minute,
  };
}

export function isWindowInPast(dateStr: string, windowLabel: string): boolean {
  const now = istNow();
  if (dateStr < now.date) return true;
  if (dateStr > now.date) return false;
  const end = WINDOW_END_MINUTES[windowLabel];
  if (end === undefined) return false;
  return end <= now.minutes;
}

export function availableWindows(dateStr: string): string[] {
  return PICKUP_WINDOWS.filter((w) => !isWindowInPast(dateStr, w));
}
