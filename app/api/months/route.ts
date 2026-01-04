import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing Supabase env vars");
  return { url, anon };
}

function getBearer(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] || null;
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function authedSupabase(req: Request) {
  const token = getBearer(req);
  if (!token) return { sb: null as any, user: null, error: "Unauthorized" };

  const { url, anon } = getEnv();

  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return { sb, user: null, error: "Unauthorized" };

  return { sb, user: data.user, error: null };
}

export async function GET(req: Request) {
  try {
    const { sb, user, error } = await authedSupabase(req);
    if (error || !user) return jsonError("Unauthorized", 401);

    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month");
    if (!month) return jsonError("Missing month");

    const { data, error: qErr } = await sb
      .from("months")
      .select("id,user_id,month,currency,budget,assets,liabilities")
      .eq("user_id", user.id)
      .eq("month", month)
      .maybeSingle();

    if (qErr) return jsonError(qErr.message, 500);

    // If no row yet, return a default shape (keeps UI stable)
    if (!data) {
      return NextResponse.json({
        id: 0,
        user_id: user.id,
        month,
        currency: "GHS",
        budget: 0,
        assets: 0,
        liabilities: 0,
      });
    }

    return NextResponse.json(data);
  } catch (e: any) {
    return jsonError(e?.message || "Server error", 500);
  }
}

export async function PUT(req: Request) {
  try {
    const { sb, user, error } = await authedSupabase(req);
    if (error || !user) return jsonError("Unauthorized", 401);

    const body = await req.json().catch(() => null);
    if (!body) return jsonError("Invalid JSON body");

    const month = String(body.month || "").trim();
    const currency = String(body.currency || "GHS").trim().toUpperCase();
    const budget = Number(body.budget);

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return jsonError("Invalid month");
    if (!Number.isFinite(budget) || budget < 0) return jsonError("Invalid budget");

    const payload = {
      user_id: user.id,
      month,
      currency,
      budget,
      updated_at: new Date().toISOString(),
    };

    const { data, error: upErr } = await sb
      .from("months")
      .upsert(payload, { onConflict: "user_id,month" })
      .select("id,user_id,month,currency,budget,assets,liabilities")
      .single();

    if (upErr) return jsonError(upErr.message, 500);

    return NextResponse.json(data);
  } catch (e: any) {
    return jsonError(e?.message || "Server error", 500);
  }
}