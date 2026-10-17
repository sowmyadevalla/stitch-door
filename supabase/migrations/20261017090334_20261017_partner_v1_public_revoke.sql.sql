/*
# Partner workflow v1, part 2f: revoke PUBLIC execute on admin functions

Functions in Postgres grant EXECUTE to PUBLIC by default, so revoking from
anon/authenticated alone leaves the functions callable. All admin functions
already gate internally on is_admin(), so this is defense in depth: remove the
PUBLIC grant on every admin-only partner function. submit_tailor_application,
partner_respond_offer and partner_update_stage keep PUBLIC/anon access because
the public application form and the partner dashboard call them.
*/

REVOKE EXECUTE ON FUNCTION public.admin_review_application(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_partner_account(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.link_partner_account(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_assign_booking(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.partner_activity_list() FROM PUBLIC;