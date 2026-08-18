// Supabase Edge Function: activate
// POST /functions/v1/activate
// Body: { license_key: string, device_id: string, heartbeat?: boolean, session_id?: string }
// Handles license key activation, device binding in `devices` table, and returns session tokens for Bundlee Extension

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-license-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ valid: false, status: "error", error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const rawKey = body.license_key || body.key || "";
    const rawDeviceId = body.device_id || body.hwid || "";
    const isHeartbeat = !!body.heartbeat;

    if (!rawKey || (!rawDeviceId && !isHeartbeat)) {
      return new Response(
        JSON.stringify({
          valid: false,
          status: "invalid",
          error: "Missing license key or device id",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sanitize key (trim, uppercase, remove redundant whitespace)
    const cleanKey = String(rawKey).trim().toUpperCase();
    const deviceId = String(rawDeviceId || "browser_client").trim();
    const userAgent = req.headers.get("user-agent") || "Loveable Extension";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 1. Fetch license by key (checking 'key' column)
    let { data: license, error: licErr } = await supabase
      .from("licenses")
      .select("*")
      .ilike("key", cleanKey)
      .single();

    // Fallback: check 'license_key' column if 'key' was not found
    if (!license && licErr) {
      const fallback = await supabase
        .from("licenses")
        .select("*")
        .ilike("license_key", cleanKey)
        .single();
      if (fallback.data) {
        license = fallback.data;
        licErr = null;
      }
    }

    if (licErr || !license) {
      return new Response(
        JSON.stringify({
          valid: false,
          status: "invalid",
          error: "Invalid license key. Please check your key and try again.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Check if revoked
    if (license.status === "revoked") {
      return new Response(
        JSON.stringify({
          valid: false,
          status: "revoked",
          error: "This license key has been revoked. Please contact support.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Check expiration (null or far-future = Lifetime)
    if (license.expires_at) {
      const expiry = new Date(license.expires_at).getTime();
      if (Date.now() >= expiry) {
        if (license.status !== "expired") {
          await supabase
            .from("licenses")
            .update({ status: "expired" })
            .eq("id", license.id);
        }

        return new Response(
          JSON.stringify({
            valid: false,
            status: "expired",
            error: "License has expired. Please renew to continue.",
            expires_at: license.expires_at,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 4. Device Binding & Limit Verification
    let existingDevices: any[] = [];
    try {
      const { data: devRows } = await supabase
        .from("devices")
        .select("*")
        .eq("license_id", license.id);
      existingDevices = devRows || [];
    } catch (_) {}

    const deviceList = existingDevices.map((d: any) => d.device_id);
    const isKnownDevice = deviceList.includes(deviceId);

    if (!isKnownDevice && deviceId) {
      const maxDevices = license.max_devices || 1;
      if (deviceList.length >= maxDevices) {
        return new Response(
          JSON.stringify({
            valid: false,
            status: "device_limit",
            error: `Device limit reached (max ${maxDevices} device${maxDevices > 1 ? "s" : ""}).`,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Register new device in `devices` table
      try {
        await supabase.from("devices").insert({
          license_id: license.id,
          device_id: deviceId,
          user_agent: userAgent,
          activated_at: new Date().toISOString(),
        });
      } catch (insertErr) {
        console.error("Device insert error:", insertErr);
      }

      // Set activated_at on license if not yet set
      if (!license.activated_at) {
        await supabase
          .from("licenses")
          .update({ activated_at: new Date().toISOString(), status: "active" })
          .eq("id", license.id);
      }
    }

    // 5. Generate secure session UUID
    const session_id = body.session_id || crypto.randomUUID();

    // 6. Return response matching extension expectations
    // Extension checks: if (_0x1000a3 && _0x1000a3['valid'] && _0x1000a3['session_id'])
    return new Response(
      JSON.stringify({
        valid: true,
        status: license.status || "active",
        session_id: session_id,
        user_name: license.notes || license.user_name || null,
        expires_at: license.expires_at || null,
        activated_at: license.activated_at || new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Activate function error:", err);
    return new Response(
      JSON.stringify({ valid: false, status: "error", error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
