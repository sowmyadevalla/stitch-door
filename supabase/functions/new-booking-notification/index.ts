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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get admin email from business_config or admin_profiles
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

    // Also check business_config for contact email
    const { data: config } = await supabase
      .from("business_config")
      .select("contact_email, whatsapp_number, brand_name")
      .eq("id", 1)
      .maybeSingle();

    const notifyEmail = config?.contact_email || adminEmail;
    const brandName = config?.brand_name || "StitchDoor";
    const whatsappNumber = config?.whatsapp_number || "";

    // Parse the booking data from the request body
    const body = await req.json();
    const booking = body.record || body;

    // Build notification message
    const ref = booking.booking_reference || "Unknown";
    const customerName = booking.customer_name || "Unknown";
    const customerPhone = booking.customer_phone || "N/A";
    const customerEmail = booking.customer_email || "N/A";
    const address = `${booking.pickup_address || ""}, ${booking.locality || ""}, ${booking.pin_code || ""}`;
    const pickupDate = booking.preferred_pickup_date || "Not specified";
    const pickupWindow = booking.preferred_pickup_window || "Not specified";
    const estimatedTotal = booking.estimated_total || 0;
    const instructions = booking.additional_instructions || "None";

    // Fetch booking items
    let itemsText = "No items data";
    if (booking.id) {
      const { data: items } = await supabase
        .from("booking_items")
        .select("service_name, quantity, garment_notes, line_total")
        .eq("booking_id", booking.id);
      if (items && items.length > 0) {
        itemsText = items
          .map(
            (i: any) =>
              `• ${i.service_name} × ${i.quantity} — ₹${i.line_total}${i.garment_notes ? `\n  Notes: ${i.garment_notes}` : ""}`
          )
          .join("\n");
      }
    }

    // Format as INR
    const formatINR = (amt: number) =>
      new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amt);

    // Log the notification to the database (status history)
    if (booking.id) {
      await supabase.from("booking_status_history").insert({
        booking_id: booking.id,
        status: "request_received",
        note: `New booking notification processed. Notify email: ${notifyEmail || "none configured"}`,
        is_internal: true,
      });
    }

    // Build the notification payload
    const notification = {
      booking_reference: ref,
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_email: customerEmail,
      address,
      pickup_date: pickupDate,
      pickup_window: pickupWindow,
      estimated_total: formatINR(estimatedTotal),
      instructions,
      items: itemsText,
      notify_email: notifyEmail,
      whatsapp_number: whatsappNumber,
      brand_name: brandName,
      timestamp: new Date().toISOString(),
    };

    // If we have an admin email, we'd send via an email provider
    // For now, we store the notification and return it so the frontend can show it
    // When you configure an email service (Resend, SendGrid, etc.), uncomment below:
    //
    // if (notifyEmail) {
    //   const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    //   if (RESEND_API_KEY) {
    //     const emailRes = await fetch("https://api.resend.com/emails", {
    //       method: "POST",
    //       headers: {
    //         "Authorization": `Bearer ${RESEND_API_KEY}`,
    //         "Content-Type": "application/json",
    //       },
    //       body: JSON.stringify({
    //         from: "StitchDoor <notifications@stitchdoor.com>",
    //         to: [notifyEmail],
    //         subject: `New Booking: ${ref} — ${customerName}`,
    //         text: `New booking received!\n\nReference: ${ref}\nCustomer: ${customerName}\nPhone: ${customerPhone}\nEmail: ${customerEmail}\nAddress: ${address}\nPickup: ${pickupDate} (${pickupWindow})\nEstimated Total: ${formatINR(estimatedTotal)}\n\nServices:\n${itemsText}\n\nInstructions: ${instructions}\n\nReview this booking in your admin dashboard.`,
    //       }),
    //     });
    //   }
    // }

    return new Response(JSON.stringify({ success: true, notification }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
