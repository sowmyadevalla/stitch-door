export interface Service {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  image_url: string;
  starting_price: number;
  estimated_turnaround: string;
  is_available: boolean;
  display_order: number;
  customization_questions: CustomizationQuestion[];
  created_at: string;
  updated_at: string;
}

export interface CustomizationQuestion {
  question: string;
  type: string;
}

export interface Booking {
  id: string;
  booking_reference: string;
  user_id: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  pickup_address: string;
  locality: string;
  pin_code: string;
  preferred_pickup_date: string | null;
  preferred_pickup_window: string;
  additional_instructions: string;
  status: BookingStatus;
  estimated_total: number;
  confirmed_amount: number | null;
  pickup_delivery_fee: number;
  payment_status: PaymentStatus;
  payment_method: string;
  assigned_partner_id: string | null;
  admin_notes: string;
  cancellation_reason: string;
  created_at: string;
  updated_at: string;
}

export interface BookingItem {
  id: string;
  booking_id: string;
  service_id: string | null;
  service_name: string;
  quantity: number;
  garment_notes: string;
  unit_price: number;
  line_total: number;
  created_at: string;
}

export interface BookingWithItems extends Booking {
  booking_items: BookingItem[];
}

export interface BookingStatusHistory {
  id: string;
  booking_id: string;
  status: BookingStatus;
  note: string;
  is_internal: boolean;
  created_by: string | null;
  created_at: string;
}

export interface BusinessConfig {
  id: number;
  brand_name: string;
  tagline: string;
  whatsapp_number: string;
  contact_email: string;
  business_hours: string;
  pickup_delivery_fee: number;
  free_delivery_threshold: number | null;
  cancellation_policy: string;
  privacy_policy_text: string;
  terms_text: string;
  facebook_url: string;
  instagram_url: string;
  twitter_url: string;
  service_area_note: string;
  updated_at: string;
}

export interface ServiceableArea {
  id: string;
  pin_code: string;
  locality: string;
  is_active: boolean;
  created_at: string;
}

export interface TailoringPartner {
  id: string;
  name: string;
  phone: string;
  locality: string;
  specialties: string;
  is_active: boolean;
  created_at: string;
  auth_user_id: string | null;
  service_pin_codes: string;
  capabilities: string;
  is_accepting_orders: boolean;
  partner_code: string | null;
}

export type TailorApplicationStatus =
  | 'pending'
  | 'under_review'
  | 'more_info_required'
  | 'approved'
  | 'rejected';

export interface TailorApplication {
  id: string;
  application_reference: string;
  full_name: string;
  mobile: string;
  email: string;
  locality: string;
  service_areas: string;
  experience_years: string;
  services_offered: string;
  equipment: string;
  expected_rates: string;
  portfolio_urls: string;
  verification_id_type: string;
  verification_id_number: string;
  notes_from_tailor: string;
  status: TailorApplicationStatus;
  review_notes: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type PartnerOfferStatus = 'pending' | 'accepted' | 'rejected' | 'expired';

export interface PartnerOffer {
  id: string;
  booking_id: string;
  partner_id: string;
  status: PartnerOfferStatus;
  offered_at: string;
  responded_at: string | null;
}

export interface PartnerActivity {
  id: string;
  actor: string | null;
  action: string;
  details: string;
  created_at: string;
}

export type PartnerStage =
  | 'picked_up'
  | 'at_tailoring_partner'
  | 'quality_check'
  | 'ready_for_delivery';

export type BookingStatus =
  | 'request_received'
  | 'awaiting_confirmation'
  | 'price_confirmed'
  | 'pickup_scheduled'
  | 'picked_up'
  | 'at_tailoring_partner'
  | 'quality_check'
  | 'ready_for_delivery'
  | 'delivered'
  | 'cancelled';

export type PaymentStatus = 'pending' | 'partial' | 'paid' | 'refunded';

export interface CartItem {
  service: Service;
  quantity: number;
  garment_notes: string;
  answers: Record<string, string>;
}
