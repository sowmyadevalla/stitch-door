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

    const body = await req.json() as { task_id?: string };
    if (!body.task_id) {
      return new Response(JSON.stringify({ error: "task_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: task } = await supabase
      .from("delivery_tasks")
      .select("id, task_reference, task_type, pickup_address, destination_address, scheduled_date, scheduled_window, assignment_note, assigned_agent_id")
      .eq("id", body.task_id)
      .maybeSingle();
    if (!task) {
      return new Response(JSON.stringify({ error: "task_not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let agentEmail = "";
    let agentName = "";
    if (task.assigned_agent_id) {
      const { data: agent } = await supabase
        .from("delivery_agents")
        .select("name, auth_user_id")
        .eq("id", task.assigned_agent_id)
        .maybeSingle();
      if (agent?.auth_user_id) {
        const { data: user } = await supabase.auth.admin.getUserById(agent.auth_user_id);
        agentEmail = user?.user?.email || "";
      }
      agentName = agent?.name || "";
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    let delivery: { attempted: boolean; sent: boolean; detail: string } = {
      attempted: false, sent: false, detail: "",
    };

    if (!task.assigned_agent_id) {
      delivery = { attempted: false, sent: false, detail: "task is unassigned — no agent to notify" };
    } else if (!agentEmail) {
      delivery = { attempted: false, sent: false, detail: "agent has no login email on record" };
    } else if (!RESEND_API_KEY) {
      delivery = { attempted: false, sent: false, detail: "no email delivery service configured (RESEND_API_KEY missing) — email skipped" };
    } else {
      const schedule = task.scheduled_date
        ? new Date(task.scheduled_date).toLocaleDateString("en-IN", { dateStyle: "medium" }) + (task.scheduled_window ? ` · ${task.scheduled_window}` : "")
        : "Flexible";
      const typeLabel = task.task_type === "pickup" ? "Pickup task" : "Return delivery task";
      const html = `<!DOCTYPE html><html><body style="margin:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
          <div style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
            <div style="background:#2d5a3d;padding:20px 24px;"><h1 style="margin:0;font-size:20px;color:#fff;">StitchDoor</h1></div>
            <div style="padding:24px;">
              <h2 style="margin:0 0 4px;font-size:18px;color:#1f2937;">New delivery task</h2>
              <p style="margin:0 0 16px;color:#6b7280;font-size:14px;">Hi ${agentName || "Agent"}, StitchDoor has assigned you a new task. Sign in to your delivery dashboard to accept it.</p>
              <div style="background:#eef5f0;border-radius:8px;padding:12px 16px;margin-bottom:16px;">
                <p style="margin:0 0 2px;font-size:11px;letter-spacing:1px;color:#6b7280;text-transform:uppercase;">Task Reference</p>
                <p style="margin:0;font-size:22px;font-weight:700;color:#2d5a3d;">${task.task_reference}</p>
              </div>
              <table style="width:100%;border-collapse:collapse;">
                <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">Type</td><td style="padding:6px 0;color:#1f2937;font-size:13px;font-weight:600;text-align:right;">${typeLabel}</td></tr>
                <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">Schedule</td><td style="padding:6px 0;color:#1f2937;font-size:13px;font-weight:600;text-align:right;">${schedule}</td></tr>
              </table>
              <p style="margin:16px 0 0;color:#9ca3af;font-size:12px;line-height:1.5;">Open your StitchDoor delivery dashboard to respond. Full addresses and contact details are shown after you sign in.</p>
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
            to: agentEmail,
            subject: `New delivery task: ${task.task_reference}`,
            html,
          }),
        });
        if (res.ok) {
          delivery = { attempted: true, sent: true, detail: `email sent to ${agentEmail}` };
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
    await supabase.from("delivery_task_history").insert({
      task_id: task.id,
      actor: null,
      actor_role: "system",
      actor_label: "notification",
      action: "task_notification",
      details: delivery.detail,
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
