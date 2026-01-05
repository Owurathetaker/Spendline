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
      .from("asset_events")
      .select("id,user_id,month,amount,note,created_at")
      .eq("user_id", user.id)
      .eq("month", month)
      .order("created_at", { ascending: false })
      .limit(200);

    if (qErr) return jsonError(qErr.message, 500);
    return NextResponse.json(data || []);
  } catch (e: any) {
    return jsonError(e?.message || "Server error", 500);
  }
}

export async function POST(req: Request) {
  try {
    const { sb, user, error } = await authedSupabase(req);
    if (error || !user) return jsonError("Unauthorized", 401);

    const body = await req.json().catch(() => null);
    if (!body) return jsonError("Invalid JSON body");

    const month = String(body.month || "").trim();
    const amount = Number(body.amount);
    const note = body.note != null ? String(body.note) : null;
    const created_at = body.created_at ? String(body.created_at) : new Date().toISOString();

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return jsonError("Invalid month");
    if (!Number.isFinite(amount) || amount <= 0) return jsonError("Invalid amount");

    const { data, error: insErr } = await sb
      .from("asset_events")
      .insert({ user_id: user.id, month, amount, note, created_at })
      .select("id,user_id,month,amount,note,created_at")
      .single();

    if (insErr) return jsonError(insErr.message, 500);
    return NextResponse.json(data);
  } catch (e: any) {
    return jsonError(e?.message || "Server error", 500);
  }
}

export async function DELETE(req: Request) {
  try {
    const { sb, user, error } = await authedSupabase(req);
    if (error || !user) return jsonError("Unauthorized", 401);

    const { searchParams } = new URL(req.url);
    const id = (searchParams.get("id") || "").trim();

    if (!id) return jsonError("Invalid id");

    const { error: delErr } = await sb
      .from("asset_events")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (delErr) return jsonError(delErr.message, 500);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return jsonError(e?.message || "Server error", 500);
  }
}