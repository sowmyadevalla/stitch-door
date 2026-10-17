import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BUCKET = "booking-photos";
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_PHOTOS_PER_BOOKING = 5;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp"]);

interface Body {
  action?: "upload" | "confirm" | "list";
  booking_id?: string;
  tracking_token?: string;
  files?: { name?: string; size?: number; type?: string }[];
  paths?: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json() as Body;
    const action = body.action;
    const bookingId = body.booking_id;
    if (!action || !bookingId) {
      return new Response(JSON.stringify({ error: "action and booking_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- authorize: session JWT (owner/admin) or guest tracking token ---
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    let authUserId: string | null = null;
    let isAdmin = false;

    if (jwt && jwt !== "null") {
      const { data: userData } = await admin.auth.getUser(jwt);
      const user = userData?.user;
      if (user) {
        authUserId = user.id;
        const { data: prof } = await admin
          .from("admin_profiles").select("is_admin").eq("id", user.id).maybeSingle();
        isAdmin = !!prof?.is_admin;
      }
    }

    const { data: booking } = await admin
      .from("bookings").select("id, user_id").eq("id", bookingId).maybeSingle();
    if (!booking) {
      return new Response(JSON.stringify({ error: "booking_not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let authorized = isAdmin
      || (authUserId !== null && booking.user_id === authUserId);

    if (!authorized && body.tracking_token) {
      const { data: access } = await admin
        .from("booking_access").select("booking_id").eq("booking_id", bookingId)
        .eq("token", body.tracking_token).maybeSingle();
      authorized = !!access;
    }

    if (!authorized) {
      return new Response(JSON.stringify({ error: "not_authorized" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- actions ---
    if (action === "upload") {
      const { count } = await admin
        .from("booking_photos").select("id", { count: "exact", head: true })
        .eq("booking_id", bookingId);
      const remaining = MAX_PHOTOS_PER_BOOKING - (count || 0);
      if (remaining <= 0) {
        return new Response(JSON.stringify({ error: "too_many_photos", max: MAX_PHOTOS_PER_BOOKING }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const files = (body.files || []).slice(0, remaining);
      const results = [];
      for (const f of files) {
        const ext = (f.name || "").split(".").pop()?.toLowerCase() || "";
        if (!ALLOWED_TYPES.has(f.type || "") || !ALLOWED_EXT.has(ext) || (f.size || 0) > MAX_FILE_BYTES || (f.size || 0) <= 0) {
          results.push({ ok: false, name: f.name, detail: "Invalid type or size (JPG/PNG/WebP, max 5 MB)" });
          continue;
        }
        const path = `${bookingId}/${crypto.randomUUID()}.${ext}`;
        const { data: signed, error } = await admin.storage
          .from(BUCKET).createSignedUploadUrl(path);
        if (error || !signed) {
          results.push({ ok: false, name: f.name, detail: error?.message || "Could not create upload URL" });
          continue;
        }
        results.push({ ok: true, name: f.name, path, token: signed.token, url: signed.signedUrl });
      }
      return new Response(JSON.stringify({ uploads: results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "confirm") {
      const paths = (body.paths || []).slice(0, MAX_PHOTOS_PER_BOOKING);
      const inserted = [];
      for (const p of paths) {
        if (typeof p !== "string" || !p.startsWith(`${bookingId}/`)) {
          inserted.push({ ok: false, path: p, detail: "Invalid path" });
          continue;
        }
        const { data: obj } = await admin.storage.from(BUCKET).list(bookingId, {
          search: p.split("/").pop(),
        });
        if (!obj || obj.length === 0) {
          inserted.push({ ok: false, path: p, detail: "Object not found in storage" });
          continue;
        }
        const ext = p.split(".").pop()?.toLowerCase() || "";
        const meta = obj[0];
        if ((meta.metadata?.size || 0) > MAX_FILE_BYTES || !ALLOWED_EXT.has(ext)) {
          inserted.push({ ok: false, path: p, detail: "File violates limits" });
          continue;
        }
        const { error } = await admin.from("booking_photos").insert({
          booking_id: bookingId,
          storage_path: p,
          original_name: "",
          file_size: meta.metadata?.size || 0,
          uploaded_by: authUserId,
        });
        inserted.push({ ok: !error, path: p, detail: error?.message || "saved" });
      }
      return new Response(JSON.stringify({ confirmed: inserted }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list") {
      const { data: photos } = await admin
        .from("booking_photos").select("id, storage_path, original_name, file_size, created_at")
        .eq("booking_id", bookingId).order("created_at");
      const withUrls = [];
      for (const p of photos || []) {
        const { data: url } = await admin.storage.from(BUCKET)
          .createSignedUrl(p.storage_path, 600);
        withUrls.push({ ...p, url: url?.signedUrl || null });
      }
      return new Response(JSON.stringify({ photos: withUrls }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "unknown_action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
