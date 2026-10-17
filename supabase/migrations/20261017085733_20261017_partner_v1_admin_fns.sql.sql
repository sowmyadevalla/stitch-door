/*
# Partner workflow v1, part 2b: admin review + account linking

- admin_review_application(uuid, text, text): ADMIN only. Sets status to one of
  pending/under_review/more_info_required/approved/rejected, records reviewer and
  timestamp, writes audit row. EXECUTE revoked from anon/authenticated.
- create_partner_account(uuid, text, text): ADMIN validation helper for the email
  + password the admin chooses when onboarding an approved applicant.
- link_partner_account(uuid, uuid): ADMIN only. Links an existing Supabase Auth
  user (created by the admin) to a new tailoring_partners row with a partner code.
*/

CREATE OR REPLACE FUNCTION public.admin_review_application(p_app_id uuid, p_new_status text, p_notes text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed text[] := ARRAY['pending','under_review','more_info_required','approved','rejected'];
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'only_admins');
  END IF;
  IF NOT (p_new_status = ANY(v_allowed)) THEN
    RETURN jsonb_build_object('error', 'invalid_status');
  END IF;

  UPDATE tailor_applications
    SET status = p_new_status,
        review_notes = COALESCE(p_notes, ''),
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        updated_at = now()
    WHERE id = p_app_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  INSERT INTO partner_activity (actor, action, details)
  VALUES (auth.uid(), 'application_reviewed', 'Status set to ' || p_new_status);

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_review_application(uuid, text, text) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_partner_account(p_app_id uuid, p_email text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  app tailor_applications%ROWTYPE;
  v_email text;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'only_admins');
  END IF;

  SELECT * INTO app FROM tailor_applications WHERE id = p_app_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF app.status <> 'approved' THEN RETURN jsonb_build_object('error', 'not_approved'); END IF;

  v_email := lower(trim(p_email));
  IF v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RETURN jsonb_build_object('error', 'invalid_email');
  END IF;
  IF length(COALESCE(p_password, '')) < 8 THEN
    RETURN jsonb_build_object('error', 'weak_password');
  END IF;

  RETURN jsonb_build_object('validated', true, 'email', v_email);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_partner_account(uuid, text, text) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.link_partner_account(p_app_id uuid, p_auth_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  app tailor_applications%ROWTYPE;
  v_partner_id uuid;
  v_code text;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'only_admins');
  END IF;

  SELECT * INTO app FROM tailor_applications WHERE id = p_app_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF app.status <> 'approved' THEN RETURN jsonb_build_object('error', 'not_approved'); END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_auth_user_id) THEN
    RETURN jsonb_build_object('error', 'auth_user_not_found');
  END IF;

  IF EXISTS (SELECT 1 FROM tailoring_partners WHERE auth_user_id = p_auth_user_id) THEN
    RETURN jsonb_build_object('error', 'already_linked');
  END IF;

  v_code := 'TP' || upper(substr(md5(p_auth_user_id::text || clock_timestamp()::text), 1, 6));

  INSERT INTO tailoring_partners (name, phone, locality, specialties, is_active, auth_user_id, partner_code)
  VALUES (app.full_name, app.mobile, app.locality, app.services_offered, true, p_auth_user_id, v_code)
  RETURNING id INTO v_partner_id;

  UPDATE tailor_applications SET updated_at = now() WHERE id = p_app_id;

  INSERT INTO partner_activity (actor, action, details)
  VALUES (auth.uid(), 'partner_account_created', 'Partner code ' || v_code);

  RETURN jsonb_build_object('partner_id', v_partner_id, 'partner_code', v_code);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.link_partner_account(uuid, uuid) FROM anon, authenticated;