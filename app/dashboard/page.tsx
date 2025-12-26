"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type MonthRow = {
  id: number;
  user_id: string;
  month: string;
  currency: string;
  budget: number | null;
  assets: number | null;
  liabilities: number | null;
};

type ExpenseRow = {
  id: number;
  user_id: string;
  month: string;
  amount: number;
  category: string;
  description: string | null;
  occurred_at: string;
};

type AssetEventRow = {
  id: number;
  user_id: string;
  month: string;
  amount: number;
  note: string | null;
  created_at: string;
};

const CATEGORIES = [
  "Food & Dining",
  "Transport",
  "Entertainment",
  "Shopping",
  "Bills & Utilities",
  "Health",
  "Subscriptions",
  "Other",
];

const CURRENCIES: Record<string, string> = {
  USD: "$",
  GHS: "₵",
  EUR: "€",
  GBP: "£",
  NGN: "₦",
};

function monthKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function money(amount: number, code: string) {
  const s = CURRENCIES[code] ?? "$";
  return `${s}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [month, setMonth] = useState(monthKey());
  const [currency, setCurrency] = useState<keyof typeof CURRENCIES>("GHS");
  const [budget, setBudget] = useState<number>(0);

  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [assets, setAssets] = useState<AssetEventRow[]>([]);

  const [expAmount, setExpAmount] = useState<number>(0);
  const [expCategory, setExpCategory] = useState(CATEGORIES[0]);
  const [expDesc, setExpDesc] = useState("");

  const [assetAmount, setAssetAmount] = useState<number>(0);
  const [assetNote, setAssetNote] = useState("");

  const [msg, setMsg] = useState<string | null>(null);

  const spent = useMemo(() => expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0), [expenses]);
  const assetsTotal = useMemo(() => assets.reduce((s, a) => s + (Number(a.amount) || 0), 0), [assets]);
  const remaining = useMemo(() => (Number(budget) || 0) - spent, [budget, spent]);

  async function loadAll(uid: string, m: string) {
    setMsg(null);
    setLoading(true);

    // Ensure month row exists
    const { data: existing, error: selErr } = await supabase
      .from("months")
      .select("*")
      .eq("user_id", uid)
      .eq("month", m)
      .maybeSingle();

    if (selErr) {
      setLoading(false);
      setMsg(`months select error: ${selErr.message}`);
      return;
    }

    let monthRow: MonthRow | null = existing as MonthRow | null;

    if (!monthRow) {
      const { data: inserted, error: insErr } = await supabase
        .from("months")
        .insert({
          user_id: uid,
          month: m,
          currency: "GHS",
          budget: 0,
          assets: 0,
          liabilities: 0,
        })
        .select("*")
        .single();

      if (insErr) {
        setLoading(false);
        setMsg(`months insert error: ${insErr.message}`);
        return;
      }

      monthRow = inserted as MonthRow;
    }

    setCurrency((monthRow.currency as any) || "GHS");
    setBudget(Number(monthRow.budget || 0));

    // Expenses
    const { data: exp, error: expErr } = await supabase
      .from("expenses")
      .select("*")
      .eq("user_id", uid)
      .eq("month", m)
      .order("occurred_at", { ascending: false })
      .limit(200);

    if (expErr) {
      setLoading(false);
      setMsg(`expenses select error: ${expErr.message}`);
      return;
    }

    // Assets events
    const { data: asEv, error: asErr } = await supabase
      .from("asset_events")
      .select("*")
      .eq("user_id", uid)
      .eq("month", m)
      .order("created_at", { ascending: false })
      .limit(200);

    if (asErr) {
      setLoading(false);
      setMsg(`asset_events select error: ${asErr.message}`);
      return;
    }

    setExpenses((exp || []) as ExpenseRow[]);
    setAssets((asEv || []) as AssetEventRow[]);
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user) {
        router.push("/login");
        return;
      }
      const uid = data.user.id;
      setUserId(uid);
      await loadAll(uid, month);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (userId) loadAll(userId, month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  async function saveBudget() {
    if (!userId) return;
    setMsg(null);
    const { error } = await supabase
      .from("months")
      .update({ budget: Number(budget) || 0, currency })
      .eq("user_id", userId)
      .eq("month", month);

    if (error) {
      setMsg(`Save budget failed: ${error.message}`);
      return;
    }
    await loadAll(userId, month);
  }

  async function addExpense() {
    if (!userId) return;
    setMsg(null);

    const amt = Number(expAmount) || 0;
    if (amt <= 0) {
      setMsg("Expense amount must be > 0");
      return;
    }

    const { error } = await supabase.from("expenses").insert({
      user_id: userId,
      month,
      amount: amt,
      category: expCategory,
      description: expDesc.trim() || null,
      occurred_at: new Date().toISOString(),
    });

    if (error) {
      setMsg(`Add expense failed: ${error.message}`);
      return;
    }

    setExpAmount(0);
    setExpDesc("");
    await loadAll(userId, month);
  }

  async function deleteExpense(id: number) {
    setMsg(null);
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) {
      setMsg(`Delete expense failed: ${error.message}`);
      return;
    }
    if (userId) await loadAll(userId, month);
  }

  async function addAsset() {
    if (!userId) return;
    setMsg(null);

    const amt = Number(assetAmount) || 0;
    if (amt <= 0) {
      setMsg("Asset amount must be > 0");
      return;
    }

    const { error } = await supabase.from("asset_events").insert({
      user_id: userId,
      month,
      amount: amt,
      note: assetNote.trim() || null,
      created_at: new Date().toISOString(),
    });

    if (error) {
      setMsg(`Add asset failed: ${error.message}`);
      return;
    }

    setAssetAmount(0);
    setAssetNote("");
    await loadAll(userId, month);
  }

  async function deleteAsset(id: number) {
    setMsg(null);
    const { error } = await supabase.from("asset_events").delete().eq("id", id);
    if (error) {
      setMsg(`Delete asset failed: ${error.message}`);
      return;
    }
    if (userId) await loadAll(userId, month);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <main style={{ maxWidth: 960, margin: "36px auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>Spendline</h1>
          <p style={{ opacity: 0.7, marginTop: 6 }}>Simple monthly budget + expenses + assets.</p>
        </div>
        <button onClick={logout} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd" }}>
          Log out
        </button>
      </div>

      <hr style={{ margin: "18px 0", opacity: 0.2 }} />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
        <div style={{ display: "grid", gap: 6 }}>
          <label style={{ fontSize: 12, opacity: 0.7 }}>Month</label>
          <input
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            placeholder="YYYY-MM"
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", width: 140 }}
          />
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label style={{ fontSize: 12, opacity: 0.7 }}>Currency</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as any)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", width: 140 }}
          >
            {Object.keys(CURRENCIES).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "grid", gap: 6, flex: 1, minWidth: 220 }}>
          <label style={{ fontSize: 12, opacity: 0.7 }}>Monthly budget</label>
          <input
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
            type="number"
            min={0}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
          />
        </div>

        <button
          onClick={saveBudget}
          style={{ padding: "10px 14px", borderRadius: 10, border: "none", fontWeight: 800, cursor: "pointer" }}
        >
          Save
        </button>
      </div>

      {msg && <p style={{ marginTop: 12, color: "crimson" }}>{msg}</p>}
      {loading && <p style={{ marginTop: 12, opacity: 0.7 }}>Loading…</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginTop: 18 }}>
        <Card title="Budget" value={money(Number(budget) || 0, currency)} />
        <Card title="Spent" value={money(spent, currency)} />
        <Card title="Remaining" value={money(remaining, currency)} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16, marginTop: 20 }}>
        <section style={panelStyle}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>Log expense</h2>
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            <input
              value={expAmount}
              onChange={(e) => setExpAmount(Number(e.target.value))}
              type="number"
              min={0}
              placeholder="Amount"
              style={inputStyle}
            />
            <select value={expCategory} onChange={(e) => setExpCategory(e.target.value)} style={inputStyle}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input value={expDesc} onChange={(e) => setExpDesc(e.target.value)} placeholder="Description (optional)" style={inputStyle} />
            <button onClick={addExpense} style={primaryBtn}>
              Add expense
            </button>
          </div>
        </section>

        <section style={panelStyle}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>Stack assets</h2>
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            <input
              value={assetAmount}
              onChange={(e) => setAssetAmount(Number(e.target.value))}
              type="number"
              min={0}
              placeholder="Amount"
              style={inputStyle}
            />
            <input value={assetNote} onChange={(e) => setAssetNote(e.target.value)} placeholder="Note (optional)" style={inputStyle} />
            <button onClick={addAsset} style={primaryBtn}>
              Add asset
            </button>
          </div>
        </section>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16, marginTop: 16 }}>
        <section style={panelStyle}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>Recent expenses</h2>
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {expenses.length === 0 ? (
              <p style={{ opacity: 0.7 }}>No expenses yet.</p>
            ) : (
              expenses.slice(0, 12).map((e) => (
                <Row
                  key={e.id}
                  left={`${e.category}${e.description ? " • " + e.description : ""}`}
                  right={money(Number(e.amount) || 0, currency)}
                  meta={(e.occurred_at || "").slice(0, 10)}
                  onDelete={() => deleteExpense(e.id)}
                />
              ))
            )}
          </div>
        </section>

        <section style={panelStyle}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>Recent assets</h2>
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {assets.length === 0 ? (
              <p style={{ opacity: 0.7 }}>No assets yet.</p>
            ) : (
              assets.slice(0, 12).map((a) => (
                <Row
                  key={a.id}
                  left={a.note || "Asset add"}
                  right={money(Number(a.amount) || 0, currency)}
                  meta={(a.created_at || "").slice(0, 10)}
                  onDelete={() => deleteAsset(a.id)}
                />
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 14 }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{title}</div>
      <div style={{ marginTop: 6, fontSize: 22, fontWeight: 900 }}>{value}</div>
    </div>
  );
}

function Row({
  left,
  right,
  meta,
  onDelete,
}: {
  left: string;
  right: string;
  meta: string;
  onDelete: () => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto auto",
        gap: 10,
        alignItems: "center",
        border: "1px solid #eee",
        borderRadius: 12,
        padding: "10px 10px",
      }}
    >
      <div>
        <div style={{ fontWeight: 800 }}>{left}</div>
        <div style={{ fontSize: 12, opacity: 0.65 }}>{meta}</div>
      </div>
      <div style={{ fontWeight: 900 }}>{right}</div>
      <button onClick={onDelete} style={{ border: "1px solid #ddd", borderRadius: 10, padding: "6px 10px" }}>
        🗑️
      </button>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 14,
};

const inputStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  border: "1px solid #ddd",
};

const primaryBtn: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  border: "none",
  fontWeight: 900,
  cursor: "pointer",
};