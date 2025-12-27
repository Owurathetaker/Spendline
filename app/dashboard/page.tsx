"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type MonthRow = {
  id: number;
  user_id: string;
  month: string; // "YYYY-MM"
  currency: string | null;
  budget: number | null;
  liabilities: number | null;
  created_at?: string | null;
  updated_at?: string | null;
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

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState<string>("");

  const [month, setMonth] = useState<string>(ymNow());
  const [monthRow, setMonthRow] = useState<MonthRow | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [currencyInput, setCurrencyInput] = useState("GHS");
  const [budgetInput, setBudgetInput] = useState<string>("0");

  const [expAmount, setExpAmount] = useState<string>("");
  const [expCategory, setExpCategory] = useState<(typeof CATEGORIES)[number]>("Other");
  const [expDesc, setExpDesc] = useState<string>("");

  const [assetAmount, setAssetAmount] = useState<string>("");
  const [assetNote, setAssetNote] = useState<string>("");

  const spentTotal = useMemo(
    () => expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [expenses]
  );
  const assetsTotal = useMemo(
    () => assets.reduce((s, a) => s + (Number(a.amount) || 0), 0),
    [assets]
  );

  const budget = Number(monthRow?.budget || 0);
  const liabilities = Number(monthRow?.liabilities || 0);
  const remaining = budget - spentTotal;
  const netWorth = assetsTotal - liabilities;

  const currency = (monthRow?.currency || "GHS").toUpperCase();

  const progressPct = useMemo(() => {
    if (budget <= 0) return 0;
    const pct = Math.round((spentTotal / budget) * 100);
    return Math.max(0, Math.min(100, pct));
  }, [spentTotal, budget]);

  async function ensureMonthRow(targetMonth: string) {
    // Try fetch the month row
    const mr = await supabase
      .from("months")
      .select("id,user_id,month,currency,budget,liabilities,created_at,updated_at")
      .eq("month", targetMonth)
      .single();

    if (!mr.error && mr.data) return mr.data as MonthRow;

    // Row missing (common code from PostgREST for "no rows")
    // Some versions use PGRST116; some return 406 with different code. We’ll treat “no data” as insert.
    const ins = await supabase
      .from("months")
      .insert({
        month: targetMonth,
        currency: "GHS",
        budget: 0,
        liabilities: 0,
      })
      .select("id,user_id,month,currency,budget,liabilities,created_at,updated_at")
      .single();

    if (ins.error) throw ins.error;
    return ins.data as MonthRow;
  }

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData?.user) {
        window.location.href = "/login";
        return;
      }
      setEmail(userData.user.email || "");

      const mrow = await ensureMonthRow(month);
      setMonthRow(mrow);
      setCurrencyInput((mrow.currency || "GHS").toUpperCase());
      setBudgetInput(String(Number(mrow.budget || 0)));

      const ex = await supabase
        .from("expenses")
        .select("id,user_id,month,amount,category,description,occurred_at")
        .eq("month", month)
        .order("occurred_at", { ascending: false })
        .limit(50);

      if (ex.error) throw ex.error;
      setExpenses((ex.data || []) as ExpenseRow[]);

      const as = await supabase
        .from("asset_events")
        .select("id,user_id,month,amount,note,created_at")
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

  async function saveBudget() {
    if (!monthRow) return;
    setBusy(true);
    setError(null);
    try {
      const b = Number(budgetInput || 0);
      const ccy = (currencyInput || "GHS").toUpperCase().slice(0, 3);

      const upd = await supabase
        .from("months")
        .update({
          budget: isFinite(b) ? b : 0,
          currency: ccy,
          updated_at: new Date().toISOString(),
        })
        .eq("id", monthRow.id)
        .select("id,user_id,month,currency,budget,liabilities,created_at,updated_at")
        .single();

      if (upd.error) throw upd.error;
      setMonthRow(upd.data as MonthRow);
    } catch (e: any) {
      setError(e?.message || "Could not save budget.");
    } finally {
      setBusy(false);
    }
  }

  async function addExpense() {
    setBusy(true);
    setError(null);
    try {
      const amt = Number(expAmount);
      if (!isFinite(amt) || amt <= 0) throw new Error("Enter a valid expense amount.");

      const ins = await supabase
        .from("expenses")
        .insert({
          month,
          amount: amt,
          category: expCategory,
          description: expDesc.trim() ? expDesc.trim() : null,
          occurred_at: new Date().toISOString(),
        })
        .select("id,user_id,month,amount,category,description,occurred_at")
        .single();

      if (ins.error) throw ins.error;

      setExpenses((prev) => [ins.data as ExpenseRow, ...prev]);
      setExpAmount("");
      setExpDesc("");
      setExpCategory("Other");
    } catch (e: any) {
      setError(e?.message || "Could not add expense.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteExpense(id: number) {
    setBusy(true);
    setError(null);
    try {
      const del = await supabase.from("expenses").delete().eq("id", id);
      if (del.error) throw del.error;
      setExpenses((prev) => prev.filter((x) => x.id !== id));
    } catch (e: any) {
      setError(e?.message || "Could not delete expense.");
    } finally {
      setBusy(false);
    }
  }

  async function addAsset() {
    setBusy(true);
    setError(null);
    try {
      const amt = Number(assetAmount);
      if (!isFinite(amt) || amt <= 0) throw new Error("Enter a valid asset amount.");

      const ins = await supabase
        .from("asset_events")
        .insert({
          month,
          amount: amt,
          note: assetNote.trim() ? assetNote.trim() : null,
          created_at: new Date().toISOString(),
        })
        .select("id,user_id,month,amount,note,created_at")
        .single();

      if (ins.error) throw ins.error;

      setAssets((prev) => [ins.data as AssetRow, ...prev]);
      setAssetAmount("");
      setAssetNote("");
    } catch (e: any) {
      setError(e?.message || "Could not add asset.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAsset(id: number) {
    setBusy(true);
    setError(null);
    try {
      const del = await supabase.from("asset_events").delete().eq("id", id);
      if (del.error) throw del.error;
      setAssets((prev) => prev.filter((x) => x.id !== id));
    } catch (e: any) {
      setError(e?.message || "Could not delete asset.");
    } finally {
      setBusy(false);
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
            {/* Overview cards */}
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card title="Budget" value={`${currency} ${budget.toLocaleString()}`} />
              <Card title="Spent" value={`${currency} ${spentTotal.toLocaleString()}`} />
              <Card title="Remaining" value={`${currency} ${remaining.toLocaleString()}`} />
              <Card title="Net Worth" value={`${currency} ${netWorth.toLocaleString()}`} />
            </div>

            {/* Budget editor */}
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-bold">Edit budget</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-1">
                  <p className="text-xs text-slate-500 mb-1">Currency</p>
                  <input
                    value={currencyInput}
                    onChange={(e) => setCurrencyInput(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    placeholder="GHS"
                  />
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs text-slate-500 mb-1">Budget</p>
                  <input
                    value={budgetInput}
                    onChange={(e) => setBudgetInput(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    placeholder="0"
                    inputMode="decimal"
                  />
                </div>
              </div>
              <button
                onClick={saveBudget}
                disabled={busy}
                className="mt-3 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {busy ? "Saving…" : "Save budget"}
              </button>
            </div>

            {/* Progress + achievements */}
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
                  Next: saving goals + milestone rewards.
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
                    <span className="text-xs text-slate-500">
                      {expenses.length >= 5 ? "Unlocked" : "Soon"}
                    </span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>💪 Add first asset</span>
                    <span className="text-xs text-slate-500">
                      {assets.length >= 1 ? "Unlocked" : "Soon"}
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Input panels */}
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {/* Add expense */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-bold">Log expense</p>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Amount</p>
                    <input
                      value={expAmount}
                      onChange={(e) => setExpAmount(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      placeholder="0"
                      inputMode="decimal"
                    />
                  </div>

                  <div>
                    <p className="text-xs text-slate-500 mb-1">Category</p>
                    <select
                      value={expCategory}
                      onChange={(e) => setExpCategory(e.target.value as any)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <p className="text-xs text-slate-500 mb-1">Description (optional)</p>
                    <input
                      value={expDesc}
                      onChange={(e) => setExpDesc(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      placeholder="e.g. Lunch"
                    />
                  </div>
                </div>

                <button
                  onClick={addExpense}
                  disabled={busy}
                  className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {busy ? "Saving…" : "Add expense"}
                </button>
              </div>

              {/* Add asset */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-bold">Add asset</p>

                <div className="mt-3 grid gap-3">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Amount</p>
                    <input
                      value={assetAmount}
                      onChange={(e) => setAssetAmount(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      placeholder="0"
                      inputMode="decimal"
                    />
                  </div>

                  <div>
                    <p className="text-xs text-slate-500 mb-1">Note (optional)</p>
                    <input
                      value={assetNote}
                      onChange={(e) => setAssetNote(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      placeholder="e.g. Savings deposit"
                    />
                  </div>
                </div>

                <button
                  onClick={addAsset}
                  disabled={busy}
                  className="mt-3 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {busy ? "Saving…" : "Add asset"}
                </button>
              </div>
            </div>

            {/* Tables */}
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-bold">Recent expenses</p>
                {expenses.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">No expenses yet.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {expenses.slice(0, 15).map((e) => (
                      <li
                        key={e.id}
                        className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">
                            {(e.category || "Other").toUpperCase()}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {e.description || "—"}
                          </p>
                        </div>

                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold">
                            {currency} {Number(e.amount).toLocaleString()}
                          </p>
                          <p className="text-xs text-slate-500">
                            {(e.occurred_at || "").slice(0, 10)}
                          </p>

                          <button
                            onClick={() => deleteExpense(e.id)}
                            disabled={busy}
                            className="mt-2 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
                          >
                            Delete
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
                    {assets.slice(0, 15).map((a) => (
                      <li
                        key={a.id}
                        className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">ASSET</p>
                          <p className="text-xs text-slate-500 truncate">{a.note || "—"}</p>
                        </div>

                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold">
                            {currency} {Number(a.amount).toLocaleString()}
                          </p>
                          <p className="text-xs text-slate-500">
                            {(a.created_at || "").slice(0, 10)}
                          </p>

                          <button
                            onClick={() => deleteAsset(a.id)}
                            disabled={busy}
                            className="mt-2 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
                          >
                            Delete
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
                Need to test auth?{" "}
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