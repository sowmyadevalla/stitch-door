import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Service } from './types';

export function useServices(availableOnly = true) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .order('display_order', { ascending: true });
      if (error) {
        setError(error.message);
      } else if (data) {
        const filtered = availableOnly
          ? (data as Service[]).filter((s) => s.is_available)
          : (data as Service[]);
        setServices(filtered);
      }
      setLoading(false);
    })();
  }, [availableOnly]);

  return { services, loading, error };
}

export function useService(slug: string) {
  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();
      if (error) {
        setError(error.message);
      } else {
        setService(data as Service | null);
      }
      setLoading(false);
    })();
  }, [slug]);

  return { service, loading, error };
}
