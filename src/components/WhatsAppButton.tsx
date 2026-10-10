import { MessageCircle } from 'lucide-react';
import { useBusinessConfig } from '@/lib/config';

export function WhatsAppButton({ bookingRef }: { bookingRef?: string }) {
  const { config } = useBusinessConfig();
  const number = config.whatsapp_number?.replace(/\D/g, '');
  if (!number) return null;

  const message = bookingRef
    ? `Hi StitchDoor, I have a booking with reference ${bookingRef}. I'd like to ask about it.`
    : `Hi StitchDoor, I'd like to know more about your services.`;

  return (
    <a
      href={`https://wa.me/${number}?text=${encodeURIComponent(message)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-forest-600 text-ivory-50 shadow-elevated transition-all duration-300 hover:bg-forest-700 hover:scale-105"
      aria-label="Contact on WhatsApp"
    >
      <MessageCircle className="h-6 w-6" />
    </a>
  );
}
