// Supabase Edge Function: activate
// POST /functions/v1/activate
// Body: { license_key: string, device_id: string, heartbeat?: boolean, session_id?: string }
// Handles license key activation, fuzzy/normalized key matching, device binding in `devices` table, and returns session tokens for Loveable Unlimited Extension

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-license-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Helper: Compute Levenshtein distance for typo tolerance (distance <= 1)
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

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
    const rawKey = String(body.license_key || body.key || "").trim();
    const rawDeviceId = String(body.device_id || body.hwid || "").trim();
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

    // Normalized alphanumeric string (e.g. "M9VT33A5VGHWPLXT")
    const cleanAlpha = rawKey.toUpperCase().replace(/[^A-Z0-9]/g, "");
    // Standard formatted string (e.g. "M9VT-33A5-VGHW-PLXT")
    const standardKey = cleanAlpha.length === 16 ? cleanAlpha.match(/.{1,4}/g)?.join("-") || cleanAlpha : cleanAlpha;
    // Spaces stripped but preserving dashes (e.g. "M9VT-33A5-VGHW-PLXT")
    const strippedKey = rawKey.toUpperCase().replace(/\s+/g, "").replace(/[\u2013\u2014]/g, "-");

    const deviceId = rawDeviceId || "browser_client";
    const userAgent = req.headers.get("user-agent") || "Loveable Extension";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 1. Fetch all licenses to perform robust normalization and typo-tolerant matching
    const { data: allLicenses, error: licErr } = await supabase
      .from("licenses")
      .select("*");

    if (licErr || !allLicenses || allLicenses.length === 0) {
      return new Response(
        JSON.stringify({
          valid: false,
          status: "invalid",
          error: "No licenses found in database.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step A: Exact / Normalized Match
    let license = allLicenses.find((l: any) => {
      const dbKey = String(l.key || l.license_key || "").toUpperCase();
      const dbCleanAlpha = dbKey.replace(/[^A-Z0-9]/g, "");
      return (
        dbKey === rawKey.toUpperCase() ||
        dbKey === strippedKey ||
        dbKey === standardKey ||
        dbCleanAlpha === cleanAlpha
      );
    });

    // Step B: Fuzzy / Typo-Tolerant Match (e.g. 1-character typo like N instead of W or O instead of 0)
    if (!license && cleanAlpha.length >= 12) {
      license = allLicenses.find((l: any) => {
        const dbKey = String(l.key || l.license_key || "").toUpperCase();
        const dbCleanAlpha = dbKey.replace(/[^A-Z0-9]/g, "");
        if (Math.abs(dbCleanAlpha.length - cleanAlpha.length) <= 1) {
          return levenshtein(cleanAlpha, dbCleanAlpha) <= 1;
        }
        return false;
      });
    }

    if (!license) {
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
