import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function buildEmailHtml(opts: {
  brandName: string;
  heading: string;
  intro: string;
  bookingRef: string;
  statusLabel?: string;
  rows: { label: string; value: string }[];
  itemsText?: string;
  nextSteps?: string[];
  footerNote: string;
}): string {
  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:6px 0;color:#6b7280;font-size:13px;">${label}</td>
      <td style="padding:6px 0;color:#1f2937;font-size:13px;font-weight:600;text-align:right;">${value}</td>
    </tr>`;

  const steps = opts.nextSteps?.length
    ? `<h3 style="margin:0 0 8px;font-size:14px;color:#1f2937;">What happens next?</h3>
       <ol style="margin:0;padding-left:18px;color:#4b5563;font-size:13px;line-height:1.6;">
         ${opts.nextSteps.map((s) => `<li>${s}</li>`).join("")}
       </ol>`
    : "";

  const items = opts.itemsText
    ? `<h3 style="margin:0 0 8px;font-size:14px;color:#1f2937;">Your services</h3>
       <div style="background:#faf9f5;border-radius:8px;padding:12px 14px;color:#374151;font-size:13px;line-height:1.6;white-space:pre-line;">${opts.itemsText}</div>`
    : "";

  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
      <div style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <div style="background:#2d5a3d;padding:20px 24px;">
          <h1 style="margin:0;font-size:20px;color:#ffffff;">${opts.brandName}</h1>
        </div>
        <div style="padding:24px;">
          <h2 style="margin:0 0 4px;font-size:18px;color:#1f2937;">${opts.heading}</h2>
          <p style="margin:0 0 16px;color:#6b7280;font-size:14px;">${opts.intro}</p>

          <div style="background:#eef5f0;border-radius:8px;padding:12px 16px;margin-bottom:16px;">
            <p style="margin:0 0 2px;font-size:11px;letter-spacing:1px;color:#6b7280;text-transform:uppercase;">Booking Reference</p>
            <p style="margin:0;font-size:22px;font-weight:700;color:#2d5a3d;">${opts.bookingRef}</p>
            ${opts.statusLabel ? `<p style="margin:6px 0 0;font-size:12px;color:#374151;">Status: <strong>${opts.statusLabel}</strong></p>` : ""}
          </div>

          <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
            ${opts.rows.map((r) => row(r.label, r.value)).join("")}
          </table>

          ${items}
          <div style="margin-top:16px;">${steps}</div>

          <div style="margin-top:20px;border-top:1px solid #e5e7eb;padding-top:14px;">
            <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;">${opts.footerNote}</p>
          </div>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

interface BookingPayload {
  id?: string;
  booking_reference?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  pickup_address?: string;
  locality?: string;
  pin_code?: string;
  preferred_pickup_date?: string | null;
  preferred_pickup_window?: string;
  additional_instructions?: string;
  estimated_total?: number;
}

interface NotificationRequest {
  type?: "new_booking" | "status_update";
  record?: BookingPayload;
  booking?: BookingPayload;
  status?: string;
}

function formatINR(amt: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amt);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: adminData } = await supabase
      .from("admin_profiles")
      .select("id")
      .eq("is_admin", true)
      .limit(1)
      .maybeSingle();

    let adminEmail = "";
    if (adminData?.id) {
      const { data: user } = await supabase.auth.admin.getUserById(adminData.id);
      adminEmail = user?.user?.email || "";
    }

    const { data: config } = await supabase
      .from("business_config")
      .select("contact_email, whatsapp_number, brand_name")
      .eq("id", 1)
      .maybeSingle();

    const brandName = config?.brand_name || "StitchDoor";
    const notifyEmail = config?.contact_email || adminEmail;
    const whatsappNumber = config?.whatsapp_number || "";

    const body = await req.json() as NotificationRequest;
    const booking = body.record || body.booking || (body as BookingPayload);
    if (!booking?.booking_reference) {
      return new Response(JSON.stringify({ error: "booking_reference required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ref = booking.booking_reference;
    const customerName = booking.customer_name || "Customer";
    const customerPhone = booking.customer_phone || "N/A";
    const customerEmail = booking.customer_email || "";
    const address = `${booking.pickup_address || ""}, ${booking.locality || ""} ${booking.pin_code || ""}`.trim();
    const pickupDate = booking.preferred_pickup_date || "Not specified";
    const pickupWindow = booking.preferred_pickup_window || "Not specified";
    const estimatedTotal = booking.estimated_total ?? 0;

    let itemsText = "";
    if (booking.id) {
      const { data: items } = await supabase
        .from("booking_items")
        .select("service_name, quantity, garment_notes, line_total")
        .eq("booking_id", booking.id);
      if (items?.length) {
        itemsText = items
          .map((i: { service_name: string; quantity: number; garment_notes: string; line_total: number }) =>
            `${i.service_name} × ${i.quantity} — ${formatINR(i.line_total)}${i.garment_notes ? `\n   Notes: ${i.garment_notes}` : ""}`
          )
          .join("\n");
      }
    }

    const isNewBooking = (body.type || "new_booking") === "new_booking";
    const statusLabel = body.status ? body.status.replace(/_/g, " ") : undefined;

    const adminSubject = isNewBooking
      ? `New Booking: ${ref} — ${customerName}`
      : `Status Update: ${ref} — ${statusLabel}`;

    const adminHtml = buildEmailHtml({
      brandName,
      heading: isNewBooking ? "New booking received" : "Booking status updated",
      intro: isNewBooking
        ? `${customerName} has requested a pickup. Review the details and confirm the price with them before starting any work.`
        : `${customerName}'s booking status changed to "${statusLabel}".`,
      bookingRef: ref,
      statusLabel,
      rows: [
        { label: "Customer", value: customerName },
        { label: "Phone", value: customerPhone },
        ...(customerEmail ? [{ label: "Email", value: customerEmail }] : []),
        { label: "Pickup", value: `${pickupDate} · ${pickupWindow}` },
        { label: "Address", value: address },
        { label: "Estimated Total", value: formatINR(estimatedTotal) },
      ],
      itemsText: itemsText || undefined,
      footerNote: "Manage this booking in your StitchDoor admin dashboard.",
    });

    const customerHtml = customerEmail ? buildEmailHtml({
      brandName,
      heading: isNewBooking ? "We've received your booking" : "Your order status has been updated",
      intro: isNewBooking
        ? `Hi ${customerName}, thank you for choosing ${brandName}. We'll confirm the final price and pickup time before any work begins. No payment is required now.`
        : `Hi ${customerName}, the status of your order has been updated.`,
      bookingRef: ref,
      statusLabel,
      rows: isNewBooking ? [
        { label: "Name", value: customerName },
        { label: "Pickup", value: `${pickupDate} · ${pickupWindow}` },
        { label: "Estimated Total", value: formatINR(estimatedTotal) },
      ] : [
        { label: "Status", value: statusLabel || "Updated" },
      ],
      itemsText: itemsText || undefined,
      nextSteps: isNewBooking ? [
        "We review your request and prepare a price estimate.",
        "We contact you to confirm the price and pickup time.",
        "Our team picks up your garments at the scheduled time.",
        "Your tailoring partner completes the work with quality checks.",
        "We deliver your finished garments back to your door.",
      ] : undefined,
      footerNote: `Questions? Contact us on WhatsApp${whatsappNumber ? ` at ${whatsappNumber}` : ""}.`,
    }) : "";

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const emailResults: { to: string; ok: boolean; detail: string }[] = [];

    if (RESEND_API_KEY) {
      // Update the from-address to a verified domain once you add one in Resend.
      const FROM = "StitchDoor <onboarding@resend.dev>";
      const send = async (to: string, subject: string, html: string) => {
        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ from: FROM, to, subject, html }),
          });
          if (!res.ok) {
            const detail = await res.text();
            return { to, ok: false, detail: `HTTP ${res.status}: ${detail.slice(0, 300)}` };
          }
          const json = await res.json() as { id?: string };
          return { to, ok: true, detail: json.id || "sent" };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return { to, ok: false, detail: msg.slice(0, 300) };
        }
      };

      if (notifyEmail) emailResults.push(await send(notifyEmail, adminSubject, adminHtml));
      if (customerEmail && customerHtml) emailResults.push(await send(customerEmail, adminSubject, customerHtml));
    } else {
      emailResults.push({ to: notifyEmail || "(no admin email configured)", ok: false, detail: "RESEND_API_KEY not configured — email skipped, booking unaffected" });
      if (customerEmail) emailResults.push({ to: customerEmail, ok: false, detail: "RESEND_API_KEY not configured — email skipped, booking unaffected" });
    }

    if (booking.id) {
      await supabase.from("booking_status_history").insert({
        booking_id: booking.id,
        status: body.status || "request_received",
        note: `Email notification: ${emailResults.map((r) => `${r.to}: ${r.ok ? "sent" : `skipped (${r.detail.slice(0, 100)})`}`).join("; ")}`,
        is_internal: true,
        created_by: null,
      });
    }

    return new Response(
      JSON.stringify({ success: true, emails: emailResults }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
