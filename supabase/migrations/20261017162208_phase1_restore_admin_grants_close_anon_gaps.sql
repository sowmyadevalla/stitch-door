/*
# Phase 1: restore admin EXECUTE grants + close anon gaps

Migration 20261017090334 revoked EXECUTE from PUBLIC on all admin/partner
management functions as defense in depth, but never re-granted to
`authenticated`, so signed-in admins got "permission denied". Every one of
these functions gates internally on is_admin(), so granting EXECUTE to
authenticated is safe — customers calling them simply get {"error":"only_admins"}.

Also: link_delivery_agent_account was left callable by `anon`; revoke it.
Notification-style functions keep their grants but now require a valid JWT
(verify_jwt = true in config.toml).
*/

-- Admin/partner management: signed-in users may attempt; internal is_admin() gate decides
GRANT EXECUTE ON FUNCTION public.admin_assign_booking(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_pending_declines() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_application(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_partner_account(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_partner_account(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_activity_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_offer_expiry(integer) TO authenticated;

-- Close the anon-callable gap on agent account linking (admin-only action)
REVOKE EXECUTE ON FUNCTION public.link_delivery_agent_account(uuid, uuid) FROM anon;

-- Notification helpers: only authenticated admins or the app's own flows call these;
-- function bodies already gate internally.
