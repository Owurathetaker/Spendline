import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function n(x: any) {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const month = String(body?.month || "").trim();
    const amount = n(body?.amount);
    const category = body?.category ? String(body.category) : null;
    const description = body?.description ? String(body.description) : null;
    const occurred_at = body?.occurred_at ? String(body.occurred_at) : new Date().toISOString();

    if (!month) return NextResponse.json({ error: "Missing month" }, { status: 400 });
    if (amount <= 0) return NextResponse.json({ error: "Amount must be > 0" }, { status: 400 });

    const ins = await supabase.from("expenses").insert({
      user_id: auth.user.id,
      month,
      amount,
      category,
      description,
      occurred_at,
    });

    if (ins.error) throw ins.error;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to create expense" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const supabase = await createClient();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const id = n(body?.id);
    const amount = n(body?.amount);
    const category = body?.category ? String(body.category) : null;
    const description = body?.description ? String(body.description) : null;

    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    if (amount <= 0) return NextResponse.json({ error: "Amount must be > 0" }, { status: 400 });

    const up = await supabase
      .from("expenses")
      .update({
        amount,
        category,
        description,
      })
      .eq("id", id)
      .eq("user_id", auth.user.id);

    if (up.error) throw up.error;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to update expense" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = await createClient();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = n(searchParams.get("id"));

    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const del = await supabase
      .from("expenses")
      .delete()
      .eq("id", id)
      .eq("user_id", auth.user.id);

    if (del.error) throw del.error;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to delete expense" },
      { status: 500 }
    );
  }
}