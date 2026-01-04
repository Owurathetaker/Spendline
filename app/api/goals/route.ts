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
      .from("saving_goals")
      .select("id,user_id,month,title,target_amount,saved_amount,created_at,updated_at")
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
    const title = String(body.title || "").trim();
    const target_amount = Number(body.target_amount);

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return jsonError("Invalid month");
    if (!title) return jsonError("Missing title");
    if (!Number.isFinite(target_amount) || target_amount <= 0)
      return jsonError("Invalid target_amount");

    const now = new Date().toISOString();

    const { data, error: insErr } = await sb
      .from("saving_goals")
      .insert({
        user_id: user.id,
        month,
        title,
        target_amount,
        saved_amount: 0,
        created_at: now,
        updated_at: now,
      })
      .select("id,user_id,month,title,target_amount,saved_amount,created_at,updated_at")
      .single();

    if (insErr) return jsonError(insErr.message, 500);
    return NextResponse.json(data);
  } catch (e: any) {
    return jsonError(e?.message || "Server error", 500);
  }
}

export async function PATCH(req: Request) {
  try {
    const { sb, user, error } = await authedSupabase(req);
    if (error || !user) return jsonError("Unauthorized", 401);

    const body = await req.json().catch(() => null);
    if (!body) return jsonError("Invalid JSON body");

    const id = Number(body.id);
    if (!Number.isFinite(id) || id <= 0) return jsonError("Invalid id");

    const now = new Date().toISOString();

    // Two modes:
    // 1) edit: { id, title, target_amount }
    // 2) add progress: { id, add_amount }
    if (body.add_amount != null) {
      const add_amount = Number(body.add_amount);
      if (!Number.isFinite(add_amount) || add_amount <= 0)
        return jsonError("Invalid add_amount");

      const { data: existing, error: findErr } = await sb
        .from("saving_goals")
        .select("id,saved_amount,target_amount")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

      if (findErr) return jsonError(findErr.message, 500);

      const saved = Number(existing?.saved_amount || 0);
      const target = Number(existing?.target_amount || 0);
      const capped = target > 0 ? Math.min(add_amount, Math.max(0, target - saved)) : add_amount;
      const newSaved = saved + capped;

      const { data, error: upErr } = await sb
        .from("saving_goals")
        .update({ saved_amount: newSaved, updated_at: now })
        .eq("id", id)
        .eq("user_id", user.id)
        .select("id,user_id,month,title,target_amount,saved_amount,created_at,updated_at")
        .single();

      if (upErr) return jsonError(upErr.message, 500);
      return NextResponse.json(data);
    }

    const title = body.title != null ? String(body.title).trim() : null;
    const target_amount = body.target_amount != null ? Number(body.target_amount) : null;

    if (title != null && !title) return jsonError("Invalid title");
    if (target_amount != null && (!Number.isFinite(target_amount) || target_amount <= 0))
      return jsonError("Invalid target_amount");

    const patch: any = { updated_at: now };
    if (title != null) patch.title = title;
    if (target_amount != null) patch.target_amount = target_amount;

    const { data, error: upErr } = await sb
      .from("saving_goals")
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id,user_id,month,title,target_amount,saved_amount,created_at,updated_at")
      .single();

    if (upErr) return jsonError(upErr.message, 500);
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
    const id = Number(searchParams.get("id"));
    if (!Number.isFinite(id) || id <= 0) return jsonError("Invalid id");

    const { error: delErr } = await sb
      .from("saving_goals")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (delErr) return jsonError(delErr.message, 500);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return jsonError(e?.message || "Server error", 500);
  }
}