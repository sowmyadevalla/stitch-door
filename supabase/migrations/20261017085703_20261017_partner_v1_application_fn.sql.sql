/*
# Partner workflow v1, part 2a: helper + public application function

- is_approved_partner(): SECURITY DEFINER helper; true when caller's auth user
  is an active tailoring partner. EXECUTE revoked from clients (used by policies).
- submit_tailor_application(jsonb): PUBLIC. Validates name/mobile/locality/services
  server-side, blocks duplicate open applications per mobile, writes an audit row,
  returns an application reference.
*/

CREATE OR REPLACE FUNCTION public.is_approved_partner()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tailoring_partners
    WHERE auth_user_id = auth.uid() AND is_active = true
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_approved_partner() FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_tailor_application(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text; v_mobile_raw text; v_mobile text; v_email text;
  v_locality text; v_areas text; v_exp text; v_services text;
  v_equipment text; v_rates text; v_portfolio text;
  v_id_type text; v_id_number text; v_notes text;
  v_ref text; v_app_id uuid;
BEGIN
  v_name      := NULLIF(trim(p_payload->>'full_name'), '');
  v_mobile_raw := NULLIF(trim(p_payload->>'mobile'), '');
  v_email     := NULLIF(trim(p_payload->>'email'), '');
  v_locality  := NULLIF(trim(p_payload->>'locality'), '');
  v_areas     := NULLIF(trim(p_payload->>'service_areas'), '');
  v_exp       := NULLIF(trim(p_payload->>'experience_years'), '');
  v_services  := NULLIF(trim(p_payload->>'services_offered'), '');
  v_equipment := NULLIF(trim(p_payload->>'equipment'), '');
  v_rates     := NULLIF(trim(p_payload->>'expected_rates'), '');
  v_portfolio := NULLIF(trim(p_payload->>'portfolio_urls'), '');
  v_id_type   := NULLIF(trim(p_payload->>'verification_id_type'), '');
  v_id_number := NULLIF(trim(p_payload->>'verification_id_number'), '');
  v_notes     := NULLIF(trim(p_payload->>'notes_from_tailor'), '');

  IF v_name IS NULL OR v_mobile_raw IS NULL OR v_locality IS NULL OR v_services IS NULL THEN
    RETURN jsonb_build_object('error', 'missing_fields');
  END IF;

  v_mobile := regexp_replace(v_mobile_raw, '\D', '', 'g');
  IF length(v_mobile) <> 10 OR v_mobile !~ '^[6-9]' THEN
    RETURN jsonb_build_object('error', 'invalid_mobile');
  END IF;
  IF v_email IS NOT NULL AND v_email <> '' AND v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RETURN jsonb_build_object('error', 'invalid_email');
  END IF;

  IF EXISTS (
    SELECT 1 FROM tailor_applications
    WHERE mobile = v_mobile AND status IN ('pending','under_review','more_info_required')
  ) THEN
    RETURN jsonb_build_object('error', 'duplicate');
  END IF;

  INSERT INTO tailor_applications (
    full_name, mobile, email, locality, service_areas, experience_years,
    services_offered, equipment, expected_rates, portfolio_urls,
    verification_id_type, verification_id_number, notes_from_tailor
  ) VALUES (
    v_name, v_mobile, COALESCE(v_email,''), v_locality, COALESCE(v_areas,''),
    COALESCE(v_exp,''), v_services, COALESCE(v_equipment,''), COALESCE(v_rates,''),
    COALESCE(v_portfolio,''), COALESCE(v_id_type,''), COALESCE(v_id_number,''),
    COALESCE(v_notes,'')
  ) RETURNING id, application_reference INTO v_app_id, v_ref;

  INSERT INTO partner_activity (actor, action, details)
  VALUES (auth.uid(), 'application_submitted', 'Application ' || v_ref || ' by ' || v_name);

  RETURN jsonb_build_object('application_id', v_app_id, 'application_reference', v_ref);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', 'server_error', 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_tailor_application(jsonb) TO anon, authenticated;