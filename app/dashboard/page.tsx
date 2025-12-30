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

type SavingGoalRow = {
  id: number;
  user_id: string;
  month: string;
  title: string;
  target_amount: number | null;
  saved_amount: number | null;
  created_at: string | null;
  updated_at: string | null;
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

function clampPct(v: number) {
  return Math.max(0, Math.min(100, v));
}

function parseMonth(ym: string) {
  // ym = "YYYY-MM"
  const [yy, mm] = ym.split("-").map((x) => Number(x));
  if (!yy || !mm) return null;
  return { y: yy, m: mm };
}

function daysInMonth(ym: string) {
  const p = parseMonth(ym);
  if (!p) return 30;
  // JS months are 0-based; day 0 of next month = last day of this month
  return new Date(p.y, p.m, 0).getDate();
}

function monthCompare(a: string, b: string) {
  // returns -1 if a<b, 0 equal, 1 if a>b
  const pa = parseMonth(a);
  const pb = parseMonth(b);
  if (!pa || !pb) return 0;
  const va = pa.y * 100 + pa.m;
  const vb = pb.y * 100 + pb.m;
  return va === vb ? 0 : va < vb ? -1 : 1;
}

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [month, setMonth] = useState(ymNow());

  const [monthRow, setMonthRow] = useState<MonthRow | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [goals, setGoals] = useState<SavingGoalRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Inputs (editable)
  const [currencyInput, setCurrencyInput] = useState("GHS");
  const [budgetInput, setBudgetInput] = useState("0");

  const [expAmount, setExpAmount] = useState("");
  const [expCategory, setExpCategory] =
    useState<(typeof CATEGORIES)[number]>("Other");
  const [expDesc, setExpDesc] = useState("");

  const [assetAmount, setAssetAmount] = useState("");
  const [assetNote, setAssetNote] = useState("");

  // Goals inputs
  const [goalName, setGoalName] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [goalAddId, setGoalAddId] = useState<number | null>(null);
  const [goalAddAmount, setGoalAddAmount] = useState("");

  const spentTotal = useMemo(
    () => expenses.reduce((s, e) => s + n(e.amount), 0),
    [expenses]
  );

  const assetsTotal = useMemo(
    () => assets.reduce((s, a) => s + n(a.amount), 0),
    [assets]
  );

  const budget = n(monthRow?.budget);
  const liabilities = n(monthRow?.liabilities);
  const remaining = budget - spentTotal;
  const netWorth = assetsTotal - liabilities;
  const currency = (monthRow?.currency || currencyInput || "GHS").toUpperCase();

  const progressPct = useMemo(() => {
    if (budget <= 0) return 0;
    return clampPct(Math.round((spentTotal / budget) * 100));
  }, [spentTotal, budget]);

  function monthSafe() {
    return typeof month === "string" && month.trim() ? month : ymNow();
  }

  // ✅ Option A: Achievements are computed in-app (no database writes/reads)
  const achievements = useMemo(() => {
    const expCount = expenses.length;
    const assetCount = assets.length;
    const goalCount = goals.length;

    const goal50 = goals.some((g) => {
      const t = n(g.target_amount);
      const s = n(g.saved_amount);
      return t > 0 && s / t >= 0.5;
    });

    const goal100 = goals.some((g) => {
      const t = n(g.target_amount);
      const s = n(g.saved_amount);
      return t > 0 && s >= t;
    });

    let tier = "🥉 Bronze — Getting started";
    if (goal100) tier = "🥇 Gold — Goal completed";
    else if (expCount >= 10) tier = "🥈 Silver — Consistent tracker";

    return [
      { title: "✅ First login", detail: "You’re in. That’s step one." },
      {
        title: expCount >= 5 ? "🏁 Track 5 expenses" : "🏁 Track 5 expenses (locked)",
        detail: `${Math.min(expCount, 5)}/5 logged this month`,
      },
      {
        title: expCount >= 10 ? "🥈 Track 10 expenses" : "🥈 Track 10 expenses (locked)",
        detail: `${Math.min(expCount, 10)}/10 logged this month`,
      },
      {
        title: assetCount >= 1 ? "💪 Add first asset" : "💪 Add first asset (locked)",
        detail: assetCount >= 1 ? "Asset tracking started" : "Add any asset to unlock",
      },
      {
        title: goalCount >= 1 ? "🎯 Create your first saving goal" : "🎯 Create your first saving goal (locked)",
        detail: goalCount >= 1 ? "Goals are live" : "Create a goal to unlock",
      },
      {
        title: goal50 ? "🚀 Hit 50% on a goal" : "🚀 Hit 50% on a goal (locked)",
        detail: goal50 ? "Halfway there" : "Build your saved amount to 50%",
      },
      {
        title: goal100 ? "🏆 Complete a goal" : "🏆 Complete a goal (locked)",
        detail: goal100 ? "You finished a goal" : "Reach 100% on any goal",
      },
      { title: "🏅 Tier badge", detail: tier },
    ];
  }, [expenses, assets, goals]);

  // --- Mini analytics (fills the big empty space) ---
  const analytics = useMemo(() => {
    const ym = monthSafe();
    const nowYm = ymNow();
    const cmp = monthCompare(ym, nowYm);
    const dim = daysInMonth(ym);

    const today = new Date();
    const dayOfMonth = today.getDate();

    const daysElapsed =
      cmp === 0 ? Math.max(1, Math.min(dayOfMonth, dim)) : cmp < 0 ? dim : 0;

    const daysLeft =
      cmp === 0 ? Math.max(0, dim - dayOfMonth) : cmp < 0 ? 0 : dim;

    const avgDailySpend = daysElapsed > 0 ? Math.round(spentTotal / daysElapsed) : 0;

    const projectedSpend =
      daysElapsed > 0 ? Math.round((spentTotal / daysElapsed) * dim) : 0;

    // Top category by total
    const totalsByCat = new Map<string, number>();
    for (const e of expenses) {
      const cat = (e.category || "Other").trim() || "Other";
      totalsByCat.set(cat, (totalsByCat.get(cat) || 0) + n(e.amount));
    }

    let topCategory = "—";
    let topCategoryTotal = 0;
    for (const [cat, total] of totalsByCat.entries()) {
      if (total > topCategoryTotal) {
        topCategoryTotal = total;
        topCategory = cat;
      }
    }

    return {
      topCategory,
      avgDailySpend,
      daysLeft,
      projectedSpend,
      dim,
    };
  }, [expenses, spentTotal, month]);

  // --- Next moves (actions that jump/focus inputs) ---
  function focusById(id: string) {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => el?.focus(), 250);
  }

  const nextMoves = useMemo(() => {
    const moves: { title: string; detail: string; action: () => void }[] = [];

    if (budget <= 0) {
      moves.push({
        title: "Set a budget for this month",
        detail: "Even a rough number gives you direction.",
        action: () => focusById("budget-input"),
      });
    }

    if (expenses.length === 0) {
      moves.push({
        title: "Log your first expense",
        detail: "Start with one. Momentum follows.",
        action: () => focusById("exp-amount"),
      });
    } else if (expenses.length < 5) {
      moves.push({
        title: "Reach 5 expenses logged",
        detail: `${expenses.length}/5 so far — quick win.`,
        action: () => focusById("exp-amount"),
      });
    }

    if (assets.length === 0) {
      moves.push({
        title: "Add your first asset",
        detail: "Savings count. Cash counts. Start somewhere.",
        action: () => focusById("asset-amount"),
      });
    }

    if (goals.length === 0) {
      moves.push({
        title: "Create a saving goal",
        detail: "Give your money a destination.",
        action: () => focusById("goal-name"),
      });
    }

    // show up to 3 to keep it clean
    return moves.slice(0, 3);
  }, [budget, expenses.length, assets.length, goals.length]);

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

      // 1) Ensure month row exists
      const mr = await supabase
        .from("months")
        .select("id,user_id,month,currency,budget,assets,liabilities")
        .eq("user_id", user.id)
        .eq("month", monthSafe())
        .maybeSingle();

      if (mr.error) throw mr.error;

      if (!mr.data) {
        const ins = await supabase
          .from("months")
          .insert({
            user_id: user.id,
            month: monthSafe(),
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

      // 2) Expenses
      const ex = await supabase
        .from("expenses")
        .select("id,user_id,month,amount,category,description,occurred_at")
        .eq("user_id", user.id)
        .eq("month", monthSafe())
        .order("occurred_at", { ascending: false })
        .limit(50);

      if (ex.error) throw ex.error;
      setExpenses((ex.data || []) as ExpenseRow[]);

      // 3) Assets
      const asq = await supabase
        .from("asset_events")
        .select("id,user_id,month,amount,note,created_at")
        .eq("user_id", user.id)
        .eq("month", monthSafe())
        .order("created_at", { ascending: false })
        .limit(50);

      if (asq.error) throw asq.error;
      setAssets((asq.data || []) as AssetRow[]);

      // 4) Goals
      const gq = await supabase
        .from("saving_goals")
        .select("id,user_id,month,title,target_amount,saved_amount,created_at,updated_at")
        .eq("user_id", user.id)
        .eq("month", monthSafe())
        .order("created_at", { ascending: false });

      if (gq.error) throw gq.error;
      setGoals((gq.data || []) as SavingGoalRow[]);
    } catch (e: any) {
      const msg =
        e?.message || e?.error_description || e?.details || "Something went wrong.";
      setError(String(msg));
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
        .eq("month", monthSafe());

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
        user_id: user.id,
        month: monthSafe(),
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
        user_id: user.id,
        month: monthSafe(),
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

  async function createGoal() {
    setError(null);
    try {
      const user = await requireUser();
      if (!user) return;

      const name = goalName.trim();
      const target = n(goalTarget);

      if (!name) throw new Error("Enter a goal name.");
      if (target <= 0) throw new Error("Enter a target amount greater than 0.");

      const ins = await supabase.from("saving_goals").insert({
        user_id: user.id,
        month: monthSafe(),
        title: name,
        target_amount: target,
        saved_amount: 0,
        updated_at: new Date().toISOString(),
      });

      if (ins.error) throw ins.error;

      setGoalName("");
      setGoalTarget("");
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to create goal.");
    }
  }

  async function addToGoal(goalId: number) {
    setError(null);
    try {
      const user = await requireUser();
      if (!user) return;

      const amt = n(goalAddAmount);
      if (amt <= 0) throw new Error("Enter an amount greater than 0.");

      const g = goals.find((x) => x.id === goalId);
      if (!g) throw new Error("Goal not found.");

      const newSaved = n(g.saved_amount) + amt;

      const up = await supabase
        .from("saving_goals")
        .update({ saved_amount: newSaved, updated_at: new Date().toISOString() })
        .eq("id", goalId)
        .eq("user_id", user.id);

      if (up.error) throw up.error;

      setGoalAddId(null);
      setGoalAddAmount("");
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to add progress.");
    }
  }

  async function deleteGoal(goalId: number) {
    setError(null);
    try {
      const user = await requireUser();
      if (!user) return;

      const del = await supabase
        .from("saving_goals")
        .delete()
        .eq("id", goalId)
        .eq("user_id", user.id);

      if (del.error) throw del.error;
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to delete goal.");
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
            <p className="text-sm font-semibold">{monthSafe()}</p>
          </div>

          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-full sm:w-auto rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
        </div>

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

                {/* Mini analytics + Next moves (fills the space) */}
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] text-slate-500">Top category</p>
                    <p className="mt-1 text-sm font-extrabold">
                      {(analytics.topCategory || "—").toString()}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] text-slate-500">Avg daily spend</p>
                    <p className="mt-1 text-sm font-extrabold">
                      {currency} {analytics.avgDailySpend.toLocaleString()}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] text-slate-500">Days left</p>
                    <p className="mt-1 text-sm font-extrabold">
                      {analytics.daysLeft}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-500">
                    Projected spend:{" "}
                    <span className="font-semibold text-slate-700">
                      {currency} {analytics.projectedSpend.toLocaleString()}
                    </span>{" "}
                    <span className="text-slate-400">(simple estimate)</span>
                  </p>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => focusById("exp-amount")}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                    >
                      + Log expense
                    </button>
                    <button
                      onClick={() => focusById("asset-amount")}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                    >
                      + Add asset
                    </button>
                    <button
                      onClick={() => focusById("goal-name")}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                    >
                      + Create goal
                    </button>
                  </div>
                </div>

                {nextMoves.length > 0 && (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-xs font-bold text-slate-700">Next move</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      {nextMoves.map((m, i) => (
                        <button
                          key={i}
                          onClick={m.action}
                          className="text-left rounded-xl border border-slate-200 bg-slate-50 p-3 hover:bg-slate-100"
                        >
                          <div className="text-sm font-semibold">{m.title}</div>
                          <div className="mt-1 text-xs text-slate-500">{m.detail}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <p className="mt-3 text-xs text-slate-400">
                  Goals + rewards are computed (no DB writes).
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-bold">Achievements</p>
                <ul className="mt-3 space-y-2 text-sm text-slate-700">
                  {achievements.map((a, i) => (
                    <li key={i} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold">{a.title}</div>
                        <div className="text-xs text-slate-500 truncate">{a.detail}</div>
                      </div>
                    </li>
                  ))}
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
                  id="budget-input"
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
                  id="exp-amount"
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
                  id="asset-amount"
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

            {/* Goals + lists */}
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {/* Goals */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-bold">Saving goals</p>

                <div className="mt-3 grid gap-2">
                  <input
                    id="goal-name"
                    value={goalName}
                    onChange={(e) => setGoalName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    placeholder="Goal name (e.g. Emergency Fund)"
                  />
                  <input
                    value={goalTarget}
                    onChange={(e) => setGoalTarget(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    placeholder="Target amount"
                    inputMode="decimal"
                  />
                  <button
                    onClick={createGoal}
                    className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700"
                  >
                    Create goal
                  </button>
                </div>

                {goals.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-500">No goals yet. Create one above.</p>
                ) : (
                  <ul className="mt-4 space-y-2">
                    {goals.map((g) => {
                      const target = n(g.target_amount);
                      const saved = n(g.saved_amount);
                      const p =
                        target <= 0 ? 0 : clampPct(Math.round((saved / target) * 100));

                      return (
                        <li key={g.id} className="rounded-xl border border-slate-200 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-extrabold">{g.title}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                {currency} {saved.toLocaleString()} / {currency}{" "}
                                {target.toLocaleString()} • {p}%
                              </p>
                            </div>

                            <button
                              onClick={() => deleteGoal(g.id)}
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold hover:bg-slate-50"
                              title="Delete goal"
                            >
                              🗑️
                            </button>
                          </div>

                          <div className="mt-3 h-3 w-full rounded-full bg-slate-100">
                            <div
                              className="h-3 rounded-full bg-emerald-500"
                              style={{ width: `${p}%` }}
                            />
                          </div>

                          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                            <input
                              value={goalAddId === g.id ? goalAddAmount : ""}
                              onFocus={() => setGoalAddId(g.id)}
                              onChange={(e) => setGoalAddAmount(e.target.value)}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                              placeholder="Add amount"
                              inputMode="decimal"
                            />
                            <button
                              onClick={() => addToGoal(g.id)}
                              className="w-full sm:w-auto rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white hover:bg-slate-800"
                            >
                              Add
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Expenses + assets lists */}
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
                          <p className="truncate text-xs text-slate-500">{e.description || "—"}</p>
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

                <p className="mt-6 text-sm font-bold">Recent assets</p>
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