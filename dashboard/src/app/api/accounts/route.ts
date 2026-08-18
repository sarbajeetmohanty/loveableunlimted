import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createAdminClient();

  try {
    // 1. Try querying public.accounts
    const { data: accounts, error: accErr } = await supabase
      .from("accounts")
      .select("*, plans(name)")
      .order("created_at", { ascending: false });

    if (!accErr && accounts) {
      return NextResponse.json({
        success: true,
        data: accounts.map((acc: any) => ({
          ...acc,
          plan_name: acc.plans?.name || "Pro Unlimited",
        })),
      });
    }

    // 2. Fallback: return accounts stored in licenses table with email keys
    const { data: licenses } = await supabase
      .from("licenses")
      .select("*, plans(name)")
      .ilike("key", "%@%")
      .order("created_at", { ascending: false });

    return NextResponse.json({
      success: true,
      data: (licenses || []).map((lic: any) => ({
        id: lic.id,
        email: lic.key,
        password_hash: lic.notes?.match(/pass:([^\s]+)/i)?.[1] || "••••••••",
        status: lic.status,
        max_devices: lic.max_devices,
        expires_at: lic.expires_at,
        created_at: lic.created_at,
        plan_name: lic.plans?.name || "Monthly Plan",
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = createAdminClient();

  try {
    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "").trim();
    const plan_id = body.plan_id;
    const max_devices = body.max_devices || 5;
    const expires_at = body.expires_at || null;
    const notes = body.notes || `Account created for ${email}`;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email and password are required" },
        { status: 400 }
      );
    }

    // 1. Try inserting into accounts table
    const { data: accData, error: accErr } = await supabase
      .from("accounts")
      .insert({
        email,
        password_hash: password,
        plan_id: plan_id || null,
        status: "active",
        max_devices,
        expires_at,
        notes,
      })
      .select();

    if (!accErr && accData) {
      return NextResponse.json({ success: true, data: accData });
    }

    // 2. Fallback: insert into licenses table using email as key
    const { data: licData, error: licErr } = await supabase
      .from("licenses")
      .insert({
        key: email,
        plan_id: plan_id || null,
        status: "active",
        max_devices,
        expires_at,
        notes: `${notes} | pass:${password}`,
      })
      .select();

    if (licErr) {
      return NextResponse.json({ success: false, error: licErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: licData });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
