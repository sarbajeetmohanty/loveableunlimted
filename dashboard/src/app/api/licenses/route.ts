import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/server";

function generateKey() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const seg = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${seg()}-${seg()}-${seg()}-${seg()}`;
}

export async function GET() {
  try {
    const supabase = createAdminClient();

    // Fetch licenses
    const { data: licenses, error } = await supabase
      .from("licenses")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Fetch devices to calculate device counts per license
    let deviceCounts: Record<string, number> = {};
    try {
      const { data: devices } = await supabase
        .from("devices")
        .select("license_id");

      for (const d of devices || []) {
        if (d.license_id) {
          deviceCounts[d.license_id] = (deviceCounts[d.license_id] || 0) + 1;
        }
      }
    } catch (_) {}

    // Fetch plans
    let plansMap: Record<string, any> = {};
    try {
      const { data: plans } = await supabase.from("plans").select("*");
      for (const p of plans || []) {
        plansMap[p.id] = p;
      }
    } catch (_) {}

    const enriched = (licenses || []).map((lic) => {
      const licenseKey = lic.key || lic.license_key || "";
      const plan = lic.plan_id ? plansMap[lic.plan_id] : null;

      return {
        ...lic,
        license_key: licenseKey,
        plan_name: plan?.display_name || plan?.name || null,
        device_count: deviceCounts[lic.id] || 0,
      };
    });

    return NextResponse.json({ success: true, data: enriched, plans: Object.values(plansMap) });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { user_name, days, lifetime, max_devices, notes, count, plan_id } = body;

    const numKeys = Math.min(Math.max(parseInt(count) || 1, 1), 100);
    const expires_at = lifetime
      ? "2126-08-18T00:00:00.000Z"
      : new Date(Date.now() + (parseInt(days) || 30) * 86400000).toISOString();

    const noteText = [user_name?.trim(), notes?.trim()].filter(Boolean).join(" — ") || null;

    const rows = Array.from({ length: numKeys }, () => ({
      key: generateKey(),
      status: "active",
      plan_id: plan_id || "4505f8ec-d9c9-4272-8aed-dd323c358702", // default monthly
      max_devices: Math.max(parseInt(max_devices) || 1, 1),
      expires_at,
      notes: noteText,
    }));

    const supabase = createAdminClient();
    const { data, error } = await supabase.from("licenses").insert(rows).select();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { license_key, id, status } = body;

    if ((!license_key && !id) || !status) {
      return NextResponse.json({ success: false, error: "Missing license identifier or status" }, { status: 400 });
    }

    const supabase = createAdminClient();
    let query = supabase.from("licenses").update({ status });

    if (id) {
      query = query.eq("id", id);
    } else {
      query = query.ilike("key", license_key.trim().toUpperCase());
    }

    const { data, error } = await query.select();
    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const license_key = searchParams.get("license_key");

    if (!id && !license_key) {
      return NextResponse.json({ success: false, error: "Missing id or license_key parameter" }, { status: 400 });
    }

    const supabase = createAdminClient();

    if (id) {
      try {
        await supabase.from("devices").delete().eq("license_id", id);
      } catch (_) {}
      const { error } = await supabase.from("licenses").delete().eq("id", id);
      if (error) throw error;
    } else if (license_key) {
      const cleanKey = license_key.trim().toUpperCase();
      const { data: lic } = await supabase.from("licenses").select("id").ilike("key", cleanKey).single();
      if (lic) {
        try {
          await supabase.from("devices").delete().eq("license_id", lic.id);
        } catch (_) {}
        const { error } = await supabase.from("licenses").delete().eq("id", lic.id);
        if (error) throw error;
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
