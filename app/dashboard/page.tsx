"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type MonthRow = {
  id: number;
  user_id: string;
  month: string; // YYYY-MM
  currency: string | null;
  budget: number | null;
  assets: number | null;
  liabilities: number | null;
};

type ExpenseRow = {
  id: number;
  user_id: string;
  month: string;
  amount: number;
  category: string | null;
  description: string | null;
  occurred_at: string | null;
};

type AssetRow = {
  id: number;
  user_id: string;
  month: string;
  amount: number;
  note: string | null;
  created_at: string | null;
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
] as const;

function ymNow() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function n(x: any) {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [month, setMonth] = useState(ymNow());

  const [monthRow, setMonthRow] = useState<MonthRow | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Inputs (editable)
  const [currencyInput, setCurrencyInput] = useState("GHS");
  const [budgetInput, setBudgetInput] = useState("0");

  const [expAmount, setExpAmount] = useState("");
  const [expCategory, setExpCategory] = useState<(typeof CATEGORIES)[number]>("Other");
  const [expDesc, setExpDesc] = useState("");

  const [assetAmount, setAssetAmount] = useState("");
  const [assetNote, setAssetNote] = useState("");

  const spentTotal = useMemo(() => expenses.reduce((s, e) => s + n(e.amount), 0), [expenses]);
  const assetsTotal = useMemo(() => assets.reduce((s, a) => s + n(a.amount), 0), [assets]);
  const budget = n(monthRow?.budget);
  const liabilities = n(monthRow?.liabilities);
  const remaining = budget - spentTotal;
  const netWorth = assetsTotal - liabilities;
  const currency = (monthRow?.currency || currencyInput || "GHS").toUpperCase();

  const progressPct = useMemo(() => {
    if (budget <= 0) return 0;
    const pct = Math.round((spentTotal / budget) * 100);
    return Math.max(0, Math.min(100, pct));
  }, [spentTotal, budget]);

  async function requireUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) {
      window.location.href = "/login";
      return null;
    }
    return data.user;
  }

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const user = await requireUser();
      if (!user) return;

      setEmail(user.email || "");

      // 1) Ensure month row exists (RLS-safe: always include user_id)
      const mr = await supabase
        .from("months")
        .select("id,user_id,month,currency,budget,assets,liabilities")
        .eq("user_id", user.id)
        .eq("month", month)
        .maybeSingle();

      if (mr.error) throw mr.error;

      if (!mr.data) {
        const ins = await supabase
          .from("months")
          .insert({
            user_id: user.id,
            month,
            currency: "GHS",
            budget: 0,
            assets: 0,
            liabilities: 0,
          })
          .select("id,user_id,month,currency,budget,assets,liabilities")
          .single();

        if (ins.error) throw ins.error;
        setMonthRow(ins.data as MonthRow);
        setCurrencyInput(String(ins.data.currency || "GHS").toUpperCase());
        setBudgetInput(String(ins.data.budget ?? 0));
      } else {
        setMonthRow(mr.data as MonthRow);
        setCurrencyInput(String(mr.data.currency || "GHS").toUpperCase());
        setBudgetInput(String(mr.data.budget ?? 0));
      }

      // 2) Expenses (filter by user_id too, even though RLS already does it)
      const ex = await supabase
        .from("expenses")
        .select("id,user_id,month,amount,category,description,occurred_at")
        .eq("user_id", user.id)
        .eq("month", month)
        .order("occurred_at", { ascending: false })
        .limit(50);

      if (ex.error) throw ex.error;
      setExpenses((ex.data || []) as ExpenseRow[]);

      // 3) Assets
      const as = await supabase
        .from("asset_events")
        .select("id,user_id,month,amount,note,created_at")
        .eq("user_id", user.id)
        .eq("month", month)
        .order("created_at", { ascending: false })
        .limit(50);

      if (as.error) throw as.error;
      setAssets((as.data || []) as AssetRow[]);
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function saveMonthSettings() {
    setError(null);
    try {
      const user = await requireUser();
      if (!user) return;

      const patch = {
        currency: currencyInput.toUpperCase(),
        budget: n(budgetInput),
      };

      const up = await supabase
        .from("months")
        .update(patch)
        .eq("user_id", user.id)
        .eq("month", month);

      if (up.error) throw up.error;
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to save month settings.");
    }
  }

  async function addExpense() {
    setError(null);
    try {
      const user = await requireUser();
      if (!user) return;

      const amt = n(expAmount);
      if (amt <= 0) throw new Error("Enter an expense amount greater than 0.");

      const ins = await supabase.from("expenses").insert({
        user_id: user.id, // ✅ REQUIRED for your RLS policy
        month,
        amount: amt,
        category: expCategory,
        description: expDesc.trim() || null,
        occurred_at: new Date().toISOString(),
      });

      if (ins.error) throw ins.error;

      setExpAmount("");
      setExpDesc("");
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to add expense.");
    }
  }

  async function deleteExpense(expenseId: number) {
    setError(null);
    try {
      const user = await requireUser();
      if (!user) return;

      const del = await supabase
        .from("expenses")
        .delete()
        .eq("id", expenseId)
        .eq("user_id", user.id);

      if (del.error) throw del.error;
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to delete expense.");
    }
  }

  async function addAsset() {
    setError(null);
    try {
      const user = await requireUser();
      if (!user) return;

      const amt = n(assetAmount);
      if (amt <= 0) throw new Error("Enter an asset amount greater than 0.");

      const ins = await supabase.from("asset_events").insert({
        user_id: user.id, // ✅ REQUIRED for your RLS policy
        month,
        amount: amt,
        note: assetNote.trim() || null,
        created_at: new Date().toISOString(),
      });

      if (ins.error) throw ins.error;

      setAssetAmount("");
      setAssetNote("");
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to add asset.");
    }
  }

  async function deleteAsset(assetId: number) {
    setError(null);
    try {
      const user = await requireUser();
      if (!user) return;

      const del = await supabase
        .from("asset_events")
        .delete()
        .eq("id", assetId)
        .eq("user_id", user.id);

      if (del.error) throw del.error;
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to delete asset.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto max-w-5xl px-4 py-8">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Spendline</h1>
            <p className="text-sm text-slate-500">
              Quiet money control — track what leaves, stack what stays.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-slate-500">Signed in</p>
              <p className="text-sm font-semibold">{email || "—"}</p>
            </div>
            <button
              onClick={logout}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
            >
              Log out
            </button>
          </div>
        </div>

        {/* Month picker */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <p className="text-xs text-slate-500">Month</p>
            <p className="text-sm font-semibold">{month}</p>
          </div>

          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-full sm:w-auto rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
        </div>

        {/* Loading / error */}
        {loading && (
          <div className="mt-6 rounded-2xl border border-slate-200 p-4">
            <p className="text-sm text-slate-600">Loading dashboard…</p>
          </div>
        )}

        {!loading && error && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-700">Error</p>
            <p className="mt-1 text-sm text-red-700">{error}</p>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Overview */}
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card title="Budget" value={`${currency} ${budget.toLocaleString()}`} />
              <Card title="Spent" value={`${currency} ${spentTotal.toLocaleString()}`} />
              <Card title="Remaining" value={`${currency} ${remaining.toLocaleString()}`} />
              <Card title="Net Worth" value={`${currency} ${netWorth.toLocaleString()}`} />
            </div>

            {/* Progress + Achievements */}
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold">Monthly Budget Progress</p>
                  <p className="text-sm text-slate-600">{progressPct}%</p>
                </div>
                <div className="mt-3 h-3 w-full rounded-full bg-slate-100">
                  <div
                    className="h-3 rounded-full bg-emerald-500"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Next: saving goals + reward milestones.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-bold">Achievements</p>
                <ul className="mt-3 space-y-2 text-sm text-slate-700">
                  <li className="flex items-center justify-between">
                    <span>✅ First login</span>
                    <span className="text-xs text-slate-500">Unlocked</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>🏁 Track 5 expenses</span>
                    <span className="text-xs text-slate-500">Soon</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>💪 Add first asset</span>
                    <span className="text-xs text-slate-500">Soon</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Controls */}
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              {/* Month settings */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-bold">Month settings</p>

                <label className="mt-3 block text-xs text-slate-500">Currency</label>
                <input
                  value={currencyInput}
                  onChange={(e) => setCurrencyInput(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="GHS"
                />

                <label className="mt-3 block text-xs text-slate-500">Budget</label>
                <input
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="0"
                  inputMode="decimal"
                />

                <button
                  onClick={saveMonthSettings}
                  className="mt-4 w-full rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700"
                >
                  Save
                </button>
              </div>

              {/* Add expense */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-bold">Log expense</p>

                <label className="mt-3 block text-xs text-slate-500">Amount</label>
                <input
                  value={expAmount}
                  onChange={(e) => setExpAmount(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="0"
                  inputMode="decimal"
                />

                <label className="mt-3 block text-xs text-slate-500">Category</label>
                <select
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value as any)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                <label className="mt-3 block text-xs text-slate-500">Description (optional)</label>
                <input
                  value={expDesc}
                  onChange={(e) => setExpDesc(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="e.g. lunch"
                />

                <button
                  onClick={addExpense}
                  className="mt-4 w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white hover:bg-slate-800"
                >
                  Add expense
                </button>
              </div>

              {/* Add asset */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-bold">Stack asset</p>

                <label className="mt-3 block text-xs text-slate-500">Amount</label>
                <input
                  value={assetAmount}
                  onChange={(e) => setAssetAmount(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="0"
                  inputMode="decimal"
                />

                <label className="mt-3 block text-xs text-slate-500">Note (optional)</label>
                <input
                  value={assetNote}
                  onChange={(e) => setAssetNote(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="e.g. savings"
                />

                <button
                  onClick={addAsset}
                  className="mt-4 w-full rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700"
                >
                  Add asset
                </button>
              </div>
            </div>

            {/* Lists */}
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-bold">Recent expenses</p>
                {expenses.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">No expenses yet.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {expenses.slice(0, 10).map((e) => (
                      <li
                        key={e.id}
                        className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">
                            {(e.category || "Other").toUpperCase()}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {e.description || "—"}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-400">
                            {(e.occurred_at || "").slice(0, 10)}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold">
                            {currency} {n(e.amount).toLocaleString()}
                          </p>
                          <button
                            onClick={() => deleteExpense(e.id)}
                            className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold hover:bg-slate-50"
                            title="Delete"
                          >
                            🗑️
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-bold">Recent assets</p>
                {assets.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">No assets yet.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {assets.slice(0, 10).map((a) => (
                      <li
                        key={a.id}
                        className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">ASSET</p>
                          <p className="truncate text-xs text-slate-500">{a.note || "—"}</p>
                          <p className="mt-1 text-[11px] text-slate-400">
                            {(a.created_at || "").slice(0, 10)}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold">
                            {currency} {n(a.amount).toLocaleString()}
                          </p>
                          <button
                            onClick={() => deleteAsset(a.id)}
                            className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold hover:bg-slate-50"
                            title="Delete"
                          >
                            🗑️
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="mt-10 text-center text-xs text-slate-500">
              <p>
                Auth links:{" "}
                <Link className="underline" href="/login">
                  Login
                </Link>{" "}
                •{" "}
                <Link className="underline" href="/signup">
                  Signup
                </Link>
              </p>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{title}</p>
      <p className="mt-1 text-lg font-extrabold tracking-tight">{value}</p>
    </div>
  );
}