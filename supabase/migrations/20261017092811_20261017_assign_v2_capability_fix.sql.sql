/*
# Assignment workflow v2, part 8: fix capability matching

The first version required the whole booked service name (e.g. "blouse
stitching") to appear verbatim inside a partner's capability list ("blouse,
alterations"), which wrongly excluded matching partners.

New rule: split the booked service name into words; the partner's capabilities
match if ANY word of 3+ characters from ANY booked service name appears in the
capabilities text (case-insensitive). This handles names like "Blouse
stitching" vs capability "blouse" without over-matching short words like "on".
*/

CREATE OR REPLACE FUNCTION public.partner_matches_booking(p_booking_id uuid)
RETURNS TABLE (
  partner_id uuid,
  partner_name text,
  partner_code text,
  partner_locality text,
  partner_phone text,
  eligible boolean,
  reasons jsonb,
  match_score integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b bookings%ROWTYPE;
  v_pin text;
  v_service_names text[];
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'only_admins';
  END IF;

  SELECT * INTO b FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_not_found';
  END IF;

  v_pin := NULLIF(trim(b.pin_code), '');
  SELECT array_agg(DISTINCT lower(trim(bi.service_name)))
    INTO v_service_names
    FROM booking_items bi
    WHERE bi.booking_id = p_booking_id AND NULLIF(trim(bi.service_name), '') IS NOT NULL;

  RETURN QUERY
  SELECT
    tp.id,
    tp.name,
    tp.partner_code,
    tp.locality,
    tp.phone,
    (tp.is_active AND tp.is_accepting_orders) AS eligible,
    jsonb_build_array() ||
      CASE WHEN NOT tp.is_active THEN to_jsonb(ARRAY['Excluded: partner account is inactive']) ELSE to_jsonb(ARRAY[]::text[]) END ||
      CASE WHEN tp.is_active AND NOT tp.is_accepting_orders THEN to_jsonb(ARRAY['Excluded: partner has paused new orders']) ELSE to_jsonb(ARRAY[]::text[]) END ||
      CASE
        WHEN NULLIF(trim(tp.service_pin_codes), '') IS NOT NULL AND v_pin IS NOT NULL AND NOT (
          v_pin = ANY(string_to_array(replace(tp.service_pin_codes, ' ', ''), ','))
        ) THEN to_jsonb(ARRAY['Excluded: does not serve PIN ' || v_pin])
        ELSE to_jsonb(ARRAY[]::text[])
      END ||
      CASE
        WHEN NULLIF(trim(tp.capabilities), '') IS NOT NULL AND v_service_names IS NOT NULL AND NOT EXISTS (
          SELECT 1
          FROM unnest(v_service_names) AS s,
               regexp_split_to_table(s, '[^a-zA-Z]+') AS w
          WHERE length(w) >= 3 AND position(w IN lower(tp.capabilities)) > 0
        ) THEN to_jsonb(ARRAY['Excluded: capabilities do not cover the booked services'])
        ELSE to_jsonb(ARRAY[]::text[])
      END ||
      CASE WHEN NULLIF(trim(tp.service_pin_codes), '') IS NULL OR v_pin IS NULL THEN
        to_jsonb(ARRAY['Note: area coverage not recorded on one side — confirm manually'])
      ELSE to_jsonb(ARRAY[]::text[]) END ||
      CASE WHEN NULLIF(trim(tp.capabilities), '') IS NULL OR v_service_names IS NULL THEN
        to_jsonb(ARRAY['Note: service capabilities not recorded on one side — confirm manually'])
      ELSE to_jsonb(ARRAY[]::text[]) END
    AS reasons,
    CASE WHEN (tp.is_active AND tp.is_accepting_orders) THEN 1 ELSE 0 END AS match_score
  FROM tailoring_partners tp
  ORDER BY match_score DESC, tp.name ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.partner_matches_booking(uuid) FROM PUBLIC, anon, authenticated;