import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json() as { offer_id?: string };
    if (!body.offer_id) {
      return new Response(JSON.stringify({ error: "offer_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: offer } = await supabase
      .from("partner_offers")
      .select("id, booking_id, partner_id, expires_at, assignment_note")
      .eq("id", body.offer_id)
      .maybeSingle();
    if (!offer) {
      return new Response(JSON.stringify({ error: "offer_not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: booking }, { data: partner }] = await Promise.all([
      supabase.from("bookings").select("booking_reference, customer_name, locality, pin_code, preferred_pickup_date, preferred_pickup_window").eq("id", offer.booking_id).maybeSingle(),
      supabase.from("tailoring_partners").select("name, auth_user_id").eq("id", offer.partner_id).maybeSingle(),
    ]);

    let partnerEmail = "";
    if (partner?.auth_user_id) {
      const { data: user } = await supabase.auth.admin.getUserById(partner.auth_user_id);
      partnerEmail = user?.user?.email || "";
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    let delivery: { attempted: boolean; sent: boolean; detail: string } = {
      attempted: false, sent: false, detail: "",
    };

    if (!partnerEmail) {
      delivery = { attempted: false, sent: false, detail: "partner has no login email on record" };
    } else if (!RESEND_API_KEY) {
      delivery = { attempted: false, sent: false, detail: "no email delivery service configured (RESEND_API_KEY missing) — email skipped" };
    } else {
      const expiry = offer.expires_at
        ? new Date(offer.expires_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
        : "No deadline";
      const html = `<!DOCTYPE html><html><body style="margin:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
          <div style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
            <div style="background:#2d5a3d;padding:20px 24px;"><h1 style="margin:0;font-size:20px;color:#fff;">StitchDoor</h1></div>
            <div style="padding:24px;">
              <h2 style="margin:0 0 4px;font-size:18px;color:#1f2937;">New order offer</h2>
              <p style="margin:0 0 16px;color:#6b7280;font-size:14px;">Hi ${partner?.name || "Partner"}, StitchDoor has offered you a new order. Sign in to your partner dashboard to accept or decline it.</p>
              <div style="background:#eef5f0;border-radius:8px;padding:12px 16px;margin-bottom:16px;">
                <p style="margin:0 0 2px;font-size:11px;letter-spacing:1px;color:#6b7280;text-transform:uppercase;">Booking Reference</p>
                <p style="margin:0;font-size:22px;font-weight:700;color:#2d5a3d;">${booking?.booking_reference || ""}</p>
              </div>
              <table style="width:100%;border-collapse:collapse;">
                <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">Customer</td><td style="padding:6px 0;color:#1f2937;font-size:13px;font-weight:600;text-align:right;">${booking?.customer_name || ""}</td></tr>
                <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">Area</td><td style="padding:6px 0;color:#1f2937;font-size:13px;font-weight:600;text-align:right;">${booking?.locality || ""} ${booking?.pin_code || ""}</td></tr>
                <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">Pickup</td><td style="padding:6px 0;color:#1f2937;font-size:13px;font-weight:600;text-align:right;">${booking?.preferred_pickup_date || "Flexible"} · ${booking?.preferred_pickup_window || ""}</td></tr>
                <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">Respond by</td><td style="padding:6px 0;color:#1f2937;font-size:13px;font-weight:600;text-align:right;">${expiry}</td></tr>
              </table>
              <p style="margin:16px 0 0;color:#9ca3af;font-size:12px;line-height:1.5;">Open your StitchDoor partner dashboard to respond. Offers left until the deadline expire automatically.</p>
            </div>
          </div>
        </div>
      </body></html>`;
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "StitchDoor <onboarding@resend.dev>",
            to: partnerEmail,
            subject: `New order offer: ${booking?.booking_reference || ""}`,
            html,
          }),
        });
        if (res.ok) {
          delivery = { attempted: true, sent: true, detail: `email sent to ${partnerEmail}` };
        } else {
          const t = await res.text();
          delivery = { attempted: true, sent: false, detail: `email send failed (HTTP ${res.status}): ${t.slice(0, 200)}` };
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        delivery = { attempted: true, sent: false, detail: `email send failed: ${msg.slice(0, 200)}` };
      }
    }

    // Honest audit trail: records both sends and skips.
    await supabase.from("partner_activity").insert({
      actor: null,
      actor_role: "system",
      actor_label: "notification",
      action: "offer_notification",
      details: `${booking?.booking_reference || offer.booking_id}: ${delivery.detail}`,
    });

    return new Response(JSON.stringify({ success: true, notified: delivery.sent, detail: delivery.detail }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
