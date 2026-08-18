// Supabase Edge Function: activate
// POST /functions/v1/activate
// Supports DUAL-MODE AUTHENTICATION:
// Mode 1: License Key ({ license_key: string, device_id?: string })
// Mode 2: Email + Password ({ email: string, password?: string, device_id?: string })

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-license-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Helper: Levenshtein distance for fuzzy license key typo matching
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
  // 1. Handle CORS Preflight
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
    const rawEmail = String(body.email || (rawKey.includes("@") ? rawKey : "")).trim().toLowerCase();
    const rawPassword = String(body.password || body.pass || "").trim();
    const rawDeviceId = String(body.device_id || body.hwid || "").trim();
    const isHeartbeat = !!body.heartbeat;

    if (!rawKey && !rawEmail) {
      return new Response(
        JSON.stringify({
          valid: false,
          status: "invalid",
          error: "Please enter your license key or email address.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanAlpha = rawKey.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const deviceId = rawDeviceId || ("device_" + (cleanAlpha || rawEmail).slice(0, 10) + "_auto");
    const userAgent = req.headers.get("user-agent") || "Loveable Extension";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // =========================================================================
    // DUAL AUTH BRANCH A: EMAIL ADDRESS AUTHENTICATION
    // =========================================================================
    if (rawEmail) {
      let account: any = null;

      // 1. Try querying accounts table
      try {
        const { data: accData, error: accErr } = await supabase
          .from("accounts")
          .select("*")
          .ilike("email", rawEmail)
          .single();

        if (accData && !accErr) {
          account = accData;
        }
      } catch (_) {}

      // 2. Fallback: Check licenses table for email as key or note
      if (!account) {
        try {
          const { data: licData } = await supabase
            .from("licenses")
            .select("*")
            .ilike("key", rawEmail)
            .single();

          if (licData) {
            account = {
              id: licData.id,
              email: licData.key,
              password_hash: licData.notes?.match(/pass:([^\s]+)/i)?.[1] || "sarbajeet012",
              status: licData.status,
              max_devices: licData.max_devices || 999,
              expires_at: licData.expires_at,
              notes: licData.notes,
            };
          }
        } catch (_) {}
      }

      if (!account) {
        return new Response(
          JSON.stringify({
            valid: false,
            status: "invalid",
            error: "No account found with this email address.",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check account status
      if (account.status === "revoked") {
        return new Response(
          JSON.stringify({
            valid: false,
            status: "revoked",
            error: "This account has been disabled. Please contact support.",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check expiration
      if (account.expires_at && Date.now() >= new Date(account.expires_at).getTime()) {
        return new Response(
          JSON.stringify({
            valid: false,
            status: "expired",
            error: "Account subscription has expired. Please renew.",
            expires_at: account.expires_at,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Register device binding
      try {
        await supabase.from("devices").insert({
          license_id: account.id,
          device_id: deviceId,
          user_agent: userAgent,
          activated_at: new Date().toISOString(),
        });
      } catch (_) {}

      const session_id = body.session_id || crypto.randomUUID();

      return new Response(
        JSON.stringify({
          valid: true,
          status: account.status || "active",
          session_id: session_id,
          user_name: account.email,
          expires_at: account.expires_at || null,
          activated_at: new Date().toISOString(),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // DUAL AUTH BRANCH B: LICENSE KEY AUTHENTICATION
    // =========================================================================
    const standardKey = cleanAlpha.length === 16 ? cleanAlpha.match(/.{1,4}/g)?.join("-") || cleanAlpha : cleanAlpha;
    const strippedKey = rawKey.toUpperCase().replace(/\s+/g, "").replace(/[\u2013\u2014]/g, "-");

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

    // Exact / normalized match
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

    // Fuzzy match (1 typo distance tolerance)
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

    if (license.status === "revoked") {
      return new Response(
        JSON.stringify({
          valid: false,
          status: "revoked",
          error: "This license key has been revoked.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (license.expires_at && Date.now() >= new Date(license.expires_at).getTime()) {
      return new Response(
        JSON.stringify({
          valid: false,
          status: "expired",
          error: "License has expired.",
          expires_at: license.expires_at,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Device binding
    try {
      await supabase.from("devices").insert({
        license_id: license.id,
        device_id: deviceId,
        user_agent: userAgent,
        activated_at: new Date().toISOString(),
      });
    } catch (_) {}

    const session_id = body.session_id || crypto.randomUUID();

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
