import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { BusinessConfig, ServiceableArea } from './types';

const defaultConfig: BusinessConfig = {
  id: 1,
  brand_name: 'StitchDoor',
  tagline: 'Tailoring, without the trip.',
  whatsapp_number: '',
  contact_email: '',
  business_hours: 'Mon–Sat, 9 AM – 7 PM',
  pickup_delivery_fee: 0,
  free_delivery_threshold: null,
  cancellation_policy: 'Free cancellation before pickup. After pickup, charges may apply based on work completed.',
  privacy_policy_text: '',
  terms_text: '',
  facebook_url: '',
  instagram_url: '',
  twitter_url: '',
  service_area_note: 'Launching in selected areas of Hyderabad.',
  updated_at: '',
};

export function useBusinessConfig() {
  const [config, setConfig] = useState<BusinessConfig>(defaultConfig);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('business_config')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      if (data) setConfig(data as BusinessConfig);
      setLoading(false);
    })();
  }, []);

  return { config, loading };
}

export function useServiceableAreas() {
  const [areas, setAreas] = useState<ServiceableArea[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('serviceable_areas')
        .select('*')
        .eq('is_active', true)
        .order('locality');
      if (data) setAreas(data as ServiceableArea[]);
      setLoading(false);
    })();
  }, []);

  return { areas, loading };
}

export function isPincodeServiceable(pincode: string, areas: ServiceableArea[]): boolean {
  return areas.some((a) => a.pin_code === pincode && a.is_active);
}
