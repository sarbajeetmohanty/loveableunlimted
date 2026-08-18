// Supabase Edge Function: proxy-command
// POST /functions/v1/proxy-command
// Body: { command: string, session_id: string, license_key?: string, device_id?: string, payload?: any }
// Used for server-side commands: revoke, ping, push-message, etc.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { command, session_id, license_key, device_id, payload } = body;

    if (!command) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing command" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    switch (command) {
      // ----------------------------------------------------------
      case "ping": {
        // Liveness check — extension pings to confirm server is up
        return ok({ pong: true, ts: new Date().toISOString() });
      }

      // ----------------------------------------------------------
      case "check_status": {
        // Re-validate license without re-registering device
        if (!license_key) return err("Missing license_key");

        const { data: license } = await supabase
          .from("licenses")
          .select("status, expires_at, user_name")
          .eq("license_key", license_key)
          .single();

        if (!license) return ok({ valid: false, status: "not_found" });

        const expired = license.expires_at
          ? Date.now() >= new Date(license.expires_at).getTime()
          : false;

        return ok({
          valid: license.status === "active" && !expired,
          status: expired ? "expired" : license.status,
          expires_at: license.expires_at,
          user_name: license.user_name,
        });
      }

      // ----------------------------------------------------------
      case "revoke": {
        // Revoke a license (admin action — should be called from dashboard only)
        if (!license_key) return err("Missing license_key");

        const { error: revokeErr } = await supabase
          .from("licenses")
          .update({ status: "revoked" })
          .eq("license_key", license_key);

        if (revokeErr) throw revokeErr;

        return ok({ revoked: true, license_key });
      }

      // ----------------------------------------------------------
      case "deactivate_device": {
        // Remove a specific device binding
        if (!license_key || !device_id) return err("Missing license_key or device_id");

        const { error: devErr } = await supabase
          .from("license_devices")
          .delete()
          .eq("license_key", license_key)
          .eq("device_id", device_id);

        if (devErr) throw devErr;

        return ok({ deactivated: true });
      }

      // ----------------------------------------------------------
      case "get_notifications": {
        // Fetch latest notifications
        const { data: notifs } = await supabase
          .from("notifications")
          .select("*")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(20);

        return ok({ notifications: notifs ?? [] });
      }

      // ----------------------------------------------------------
      case "get_version": {
        // Get latest extension version info
        const { data: version } = await supabase
          .from("extension_versions")
          .select("version, changelog, file_path, original_file_name, is_alert_active")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        return ok({ version });
      }

      // ----------------------------------------------------------
      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown command: ${command}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (err: any) {
    console.error("proxy-command error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function ok(result: any) {
  return new Response(
    JSON.stringify({ success: true, result }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

function err(message: string) {
  return new Response(
    JSON.stringify({ success: false, error: message }),
    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
