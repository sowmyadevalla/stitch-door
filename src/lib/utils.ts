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
