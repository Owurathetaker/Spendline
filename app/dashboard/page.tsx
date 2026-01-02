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

const QUICK_AMOUNTS = [100, 250, 500, 1000, 2000] as const;

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

function currencySymbol(code: string) {
  switch ((code || "").toUpperCase()) {
    case "USD":
      return "$";
    case "GHS":
      return "₵";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    default:
      return (code || "").toUpperCase() ? `${code.toUpperCase()} ` : "";
  }
}

function parseMonth(ym: string) {
  const [yy, mm] = ym.split("-").map((x) => Number(x));
  if (!yy || !mm) return null;
  return { y: yy, m: mm };
}

function daysInMonth(ym: string) {
  const p = parseMonth(ym);
  if (!p) return 30;
  return new Date(p.y, p.m, 0).getDate();
}

function monthCompare(a: string, b: string) {
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
  const [nudge, setNudge] = useState<string | null>(null);
 
function pushNudge(msg: string) {
  setNudge(msg);
  window.setTimeout(() => setNudge(null), 2500);
}

  // Inputs
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
  // Create goal inline errors
  const [goalNameErr, setGoalNameErr] = useState<string | null>(null);
  const [goalTargetErr, setGoalTargetErr] = useState<string | null>(null);

  // Optional edit states
  const [editingExpenseId, setEditingExpenseId] = useState<number | null>(null);
  const [editExpAmount, setEditExpAmount] = useState("");
  const [editExpCategory, setEditExpCategory] =
    useState<(typeof CATEGORIES)[number]>("Other");
  const [editExpDesc, setEditExpDesc] = useState("");

  const [editingGoalId, setEditingGoalId] = useState<number | null>(null);
  const [editGoalTitle, setEditGoalTitle] = useState("");
  const [editGoalTarget, setEditGoalTarget] = useState("");

  // ✅ Guard rails: 5 saving states
  const [savingMonthSettings, setSavingMonthSettings] = useState(false);
  const [savingExpenseId, setSavingExpenseId] = useState<number | "new" | null>(
    null
  );
  const [savingAssetId, setSavingAssetId] = useState<number | "new" | null>(
    null
  );
  const [savingGoalCreate, setSavingGoalCreate] = useState(false);
  const [savingGoalId, setSavingGoalId] = useState<number | null>(null);

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
  const symbol = currencySymbol(currency);

  const fmtMoney = (amount: number) => `${symbol}${n(amount).toLocaleString()}`;

  const progressPct = useMemo(() => {
    if (budget <= 0) return 0;
    return clampPct(Math.round((spentTotal / budget) * 100));
  }, [spentTotal, budget]);

  function monthSafe() {
    return typeof month === "string" && month.trim() ? month : ymNow();
  }

  // Goal helpers (safe)
  function goalProgress(g: SavingGoalRow) {
    const target = Math.max(0, n(g.target_amount));
    const saved = Math.max(0, n(g.saved_amount));
    const pct = target <= 0 ? 0 : clampPct(Math.round((saved / target) * 100));
    const remainingAmt = Math.max(0, target - saved);
    const complete = target > 0 && saved >= target;
    return { target, saved, pct, remaining: remainingAmt, complete };
  }

  // Option A sorting: incomplete first, then highest progress, then newest
  const sortedGoals = useMemo(() => {
    const copy = [...goals];

    copy.sort((a, b) => {
      const pa = goalProgress(a);
      const pb = goalProgress(b);

      if (pa.complete !== pb.complete) return pa.complete ? 1 : -1;
      if (pb.pct !== pa.pct) return pb.pct - pa.pct;

      const da = new Date(a.created_at || 0).getTime();
      const db = new Date(b.created_at || 0).getTime();
      return db - da;
    });

    return copy;
  }, [goals]);

  // ===== Next Move (top goal action engine) =====
  const nextMove = useMemo(() => {
    if (!sortedGoals || sortedGoals.length === 0) return null;

    const top =
      sortedGoals.find((g) => !goalProgress(g).complete) || sortedGoals[0];

    const p = goalProgress(top);

    if (p.target <= 0) {
      return {
        goal: top,
        line: "Set a target amount for this goal to unlock progress nudges.",
        suggestedAmount: 0,
      };
    }

    const halfPoint = Math.ceil(p.target * 0.5);

    if (p.complete) {
      return {
        goal: top,
        line: "This goal is complete.",
        suggestedAmount: 0,
      };
    }

    if (p.pct < 50) {
      const need = Math.max(0, halfPoint - p.saved);
      return {
        goal: top,
        line: `Add ${fmtMoney(need)} to reach 50% on “${top.title}”.`,
        suggestedAmount: need,
      };
    }

    const need = Math.max(0, p.target - p.saved);
    return {
      goal: top,
      line: `You’re ${fmtMoney(need)} away from completing “${top.title}”.`,
      suggestedAmount: need,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedGoals, symbol]);

  function jumpToGoalInput(goalId: number) {
    setGoalAddId(goalId);

    const sug =
      nextMove?.goal?.id === goalId ? nextMove?.suggestedAmount ?? 0 : 0;
    if (sug > 0) setGoalAddAmount(String(sug));

    setTimeout(() => {
      document
        .getElementById("goals-section")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      const el = document.getElementById(
        `goal-add-${goalId}`
      ) as HTMLInputElement | null;
      el?.focus();
    }, 50);
  }

  // Quick/Smart add: preset only (no auto-add)
  function presetGoalAmount(goalId: number, amount: number) {
    setGoalAddId(goalId);
    setGoalAddAmount(String(amount));

    setTimeout(() => {
      const el = document.getElementById(
        `goal-add-${goalId}`
      ) as HTMLInputElement | null;
      el?.focus();
      el?.select?.();
    }, 50);
  }

  // ✅ Achievements computed in-app
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
        title:
          expCount >= 5
            ? "🏁 Track 5 expenses"
            : "🏁 Track 5 expenses (locked)",
        detail: `${Math.min(expCount, 5)}/5 logged this month`,
      },
      {
        title:
          expCount >= 10
            ? "🥈 Track 10 expenses"
            : "🥈 Track 10 expenses (locked)",
        detail: `${Math.min(expCount, 10)}/10 logged this month`,
      },
      {
        title:
          assetCount >= 1 ? "💪 Add first asset" : "💪 Add first asset (locked)",
        detail:
          assetCount >= 1 ? "Asset tracking started" : "Add any asset to unlock",
      },
      {
        title:
          goalCount >= 1
            ? "🎯 Create your first saving goal"
            : "🎯 Create your first saving goal (locked)",
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

  // --- Mini analytics ---
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

    const avgDailySpend =
      daysElapsed > 0 ? Math.round(spentTotal / daysElapsed) : 0;

    const projectedSpend =
      daysElapsed > 0 ? Math.round((spentTotal / daysElapsed) * dim) : 0;

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

    return { topCategory, avgDailySpend, daysLeft, projectedSpend, dim };
  }, [expenses, spentTotal, month]);

  // --- Next moves (jump/focus) ---
  function focusById(id: string) {
    const el = document.getElementById(id) as
      | HTMLInputElement
      | HTMLSelectElement
      | null;
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => el?.focus(), 250);
  }

  // NOTE: you asked to NOT show "create goal" here
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

    return moves.slice(0, 3);
  }, [budget, expenses.length, assets.length]);

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

      const ex = await supabase
        .from("expenses")
        .select("id,user_id,month,amount,category,description,occurred_at")
        .eq("user_id", user.id)
        .eq("month", monthSafe())
        .order("occurred_at", { ascending: false })
        .limit(50);

      if (ex.error) throw ex.error;
      setExpenses((ex.data || []) as ExpenseRow[]);

      const asq = await supabase
        .from("asset_events")
        .select("id,user_id,month,amount,note,created_at")
        .eq("user_id", user.id)
        .eq("month", monthSafe())
        .order("created_at", { ascending: false })
        .limit(50);

      if (asq.error) throw asq.error;
      setAssets((asq.data || []) as AssetRow[]);

      const gq = await supabase
        .from("saving_goals")
        .select(
          "id,user_id,month,title,target_amount,saved_amount,created_at,updated_at"
        )
        .eq("user_id", user.id)
        .eq("month", monthSafe())
        .order("created_at", { ascending: false });

      if (gq.error) throw gq.error;
      setGoals((gq.data || []) as SavingGoalRow[]);
    } catch (e: any) {
      const msg =
        e?.message ||
        e?.error_description ||
        e?.details ||
        "Something went wrong.";
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
    if (savingMonthSettings) return;
    setError(null);
    setSavingMonthSettings(true);

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
    } finally {
      setSavingMonthSettings(false);
    }
  }

  async function addExpense() {
    if (savingExpenseId === "new") return;
    setError(null);
    setSavingExpenseId("new");

    try {
      const user = await requireUser();
      if (!user) return;

      const amt = n(expAmount);
if (amt <= 0) {pushNudge("Enter an expense amount greater than 0.");return;}

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
    } finally {
      setSavingExpenseId(null);
    }
  }

  function startEditExpense(e: ExpenseRow) {
    setEditingExpenseId(e.id);
    setEditExpAmount(String(n(e.amount)));
    setEditExpCategory(((e.category || "Other") as any) || "Other");
    setEditExpDesc(e.description || "");
  }

  function cancelEditExpense() {
    setEditingExpenseId(null);
    setEditExpAmount("");
    setEditExpDesc("");
    setEditExpCategory("Other");
  }

  async function saveEditExpense(expenseId: number) {
    if (savingExpenseId === expenseId) return;
    setError(null);
    setSavingExpenseId(expenseId);

    try {
      const user = await requireUser();
      if (!user) return;

      const amt = n(editExpAmount);
if (amt <= 0) {
  pushNudge("Amount must be greater than 0.");
  return;
}

      const up = await supabase
        .from("expenses")
        .update({
          amount: amt,
          category: editExpCategory,
          description: editExpDesc.trim() || null,
        })
        .eq("id", expenseId)
        .eq("user_id", user.id);

      if (up.error) throw up.error;

      cancelEditExpense();
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to update expense.");
    } finally {
      setSavingExpenseId(null);
    }
  }

  async function deleteExpense(expenseId: number) {
    if (savingExpenseId === expenseId) return;
    setError(null);
    setSavingExpenseId(expenseId);

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
    } finally {
      setSavingExpenseId(null);
    }
  }

  async function addAsset() {
    if (savingAssetId === "new") return;
    setError(null);
    setSavingAssetId("new");

    try {
      const user = await requireUser();
      if (!user) return;

      const amt = n(assetAmount);
if (amt <= 0) {pushNudge("Enter an asset amount greater than 0.");return;}

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
    } finally {
      setSavingAssetId(null);
    }
  }

  async function deleteAsset(assetId: number) {
    if (savingAssetId === assetId) return;
    setError(null);
    setSavingAssetId(assetId);

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
    } finally {
      setSavingAssetId(null);
    }
  }

  async function createGoal() {
  // local (inline) errors only — no global banner for validation
  setGoalNameErr(null);
  setGoalTargetErr(null);
  setError(null);

  try {
    const user = await requireUser();
    if (!user) return;

    const name = goalName.trim();
    const target = n(goalTarget);

    let hasErr = false;

    if (!name) {
      setGoalNameErr("Enter a goal name.");
      hasErr = true;
    }

    if (target <= 0) {
      setGoalTargetErr("Enter a target amount greater than 0.");
      hasErr = true;
    }

    if (hasErr) return;

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
    // only real server/db errors go to the global banner
    setError(e?.message || "Failed to create goal.");
  }
}

  function startEditGoal(g: SavingGoalRow) {
    setEditingGoalId(g.id);
    setEditGoalTitle(g.title || "");
    setEditGoalTarget(String(n(g.target_amount)));
  }

  function cancelEditGoal() {
    setEditingGoalId(null);
    setEditGoalTitle("");
    setEditGoalTarget("");
  }

  async function saveEditGoal(goalId: number) {
    if (savingGoalId === goalId) return;
    setError(null);
    setSavingGoalId(goalId);

    try {
      const user = await requireUser();
      if (!user) return;

      const title = editGoalTitle.trim();
      const target = n(editGoalTarget);

      if (!title) {
  pushNudge("Goal title cannot be empty.");
  return;
}
if (target <= 0) {
  pushNudge("Target must be greater than 0.");
  return;
}

      const up = await supabase
        .from("saving_goals")
        .update({
          title,
          target_amount: target,
          updated_at: new Date().toISOString(),
        })
        .eq("id", goalId)
        .eq("user_id", user.id);

      if (up.error) throw up.error;

      cancelEditGoal();
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to update goal.");
    } finally {
      setSavingGoalId(null);
    }
  }

  async function addToGoal(goalId: number, amountOverride?: number) {
    if (savingGoalId === goalId) return;
    setError(null);
    setSavingGoalId(goalId);

    try {
      const user = await requireUser();
      if (!user) return;

      setGoalAddId(goalId);

      const amt =
  amountOverride != null ? n(amountOverride) : n(goalAddAmount);
 
if (amt <= 0) {
  pushNudge("Enter an amount greater than 0.");
  return;
}

      const g = goals.find((x) => x.id === goalId);
      if (!g) throw new Error("Goal not found.");

      const p = goalProgress(g);
      if (p.complete) return;

      const capped = p.target > 0 ? Math.min(amt, p.remaining) : amt;
      if (capped <= 0) return;

      const newSaved = n(g.saved_amount) + capped;

      const up = await supabase
        .from("saving_goals")
        .update({
          saved_amount: newSaved,
          updated_at: new Date().toISOString(),
        })
        .eq("id", goalId)
        .eq("user_id", user.id);

      if (up.error) throw up.error;

      setGoalAddId(null);
      setGoalAddAmount("");
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to add progress.");
    } finally {
      setSavingGoalId(null);
    }
  }

  async function deleteGoal(goalId: number) {
    if (savingGoalId === goalId) return;
    setError(null);
    setSavingGoalId(goalId);

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
    } finally {
      setSavingGoalId(null);
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

        {!loading && (
  <>
    {error && (
      <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-2">
        <p className="text-xs font-semibold text-red-700">Heads up</p>
        <p className="text-xs text-red-700">{error}</p>
      </div>
    )}

    <>
      ...entire dashboard...
    </>
  </>
)}

{nudge && (
  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2">
    <p className="text-xs font-semibold text-amber-900">Quick fix</p>
    <p className="text-xs text-amber-900">{nudge}</p>
  </div>
)}


        {!loading && !error && (
          <>
            {/* Overview */}
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card title="Budget" value={fmtMoney(budget)} />
              <Card title="Spent" value={fmtMoney(spentTotal)} />
              <Card title="Remaining" value={fmtMoney(remaining)} />
              <Card title="Net Worth" value={fmtMoney(netWorth)} />
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

                {/* Mini analytics */}
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
                      {fmtMoney(analytics.avgDailySpend)}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] text-slate-500">Days left</p>
                    <p className="mt-1 text-sm font-extrabold">{analytics.daysLeft}</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-500">
                    Projected spend:{" "}
                    <span className="font-semibold text-slate-700">
                      {fmtMoney(analytics.projectedSpend)}
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
                  </div>
                </div>

                {/* Next move cards */}
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

                {/* Top goal next move */}
                {nextMove && (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-bold text-slate-700">Goal next move</p>
                    <p className="mt-1 text-xs text-slate-600">{nextMove.line}</p>
                    {!goalProgress(nextMove.goal).complete && (
                      <button
                        onClick={() => jumpToGoalInput(nextMove.goal.id)}
                        className="mt-3 w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white hover:bg-slate-800"
                      >
                        Add to this goal
                      </button>
                    )}
                  </div>
                )}

                <p className="mt-3 text-xs text-slate-400">
                  No setup needed — just log and go.
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
                  disabled={savingMonthSettings}
                  className="mt-4 w-full rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {savingMonthSettings ? "Saving…" : "Save"}
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

                <label className="mt-3 block text-xs text-slate-500">
                  Description (optional)
                </label>
                <input
                  value={expDesc}
                  onChange={(e) => setExpDesc(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="e.g. lunch"
                />

                <button
                  onClick={addExpense}
                  disabled={savingExpenseId === "new"}
                  className="mt-4 w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {savingExpenseId === "new" ? "Adding…" : "Add expense"}
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
                  disabled={savingAssetId === "new"}
                  className="mt-4 w-full rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {savingAssetId === "new" ? "Adding…" : "Add asset"}
                </button>
              </div>
            </div>

            {/* Goals + lists */}
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {/* Goals */}
              <div
                id="goals-section"
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <p className="text-sm font-bold">Saving goals</p>

                <div className="mt-3 grid gap-2">
                  <input
  id="goal-name"
  value={goalName}
  onChange={(e) => {
    setGoalName(e.target.value);
    if (goalNameErr) setGoalNameErr(null);
  }}
  className={`w-full rounded-xl border bg-white px-3 py-2 text-sm
    ${goalNameErr ? "border-red-300 focus:border-red-400 focus:ring-red-100" : "border-slate-200"}
  `}
  placeholder="Goal name (e.g. Emergency Fund)"
/>
 
{goalNameErr && (
  <p className="mt-1 text-xs text-red-600">{goalNameErr}</p>
)}
                  <input
  value={goalTarget}
  onChange={(e) => {
    setGoalTarget(e.target.value);
    if (goalTargetErr) setGoalTargetErr(null);
  }}
  className={`w-full rounded-xl border bg-white px-3 py-2 text-sm
    ${goalTargetErr ? "border-red-300 focus:border-red-400 focus:ring-red-100" : "border-slate-200"}
  `}
  placeholder="Target amount"
  inputMode="decimal"
/>
 
{goalTargetErr && (
  <p className="mt-1 text-xs text-red-600">{goalTargetErr}</p>
)}
                  <button
                    onClick={createGoal}
                    disabled={savingGoalCreate}
                    className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {savingGoalCreate ? "Creating…" : "Create goal"}
                  </button>
                </div>

                {goals.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-500">
                    No goals yet. Create one above.
                  </p>
                ) : (
                  <ul className="mt-4 space-y-2">
                    {sortedGoals.map((g) => {
                      const { target, saved, pct: p, remaining: rem, complete } =
                        goalProgress(g);

                      const goalBoxClass = complete
                        ? "rounded-xl border border-emerald-200 bg-emerald-50 p-3"
                        : "rounded-xl border border-slate-200 p-3";

                      const perStep = Math.max(1, Math.round(target * 0.1));
                      const smart = complete ? 0 : Math.min(rem, perStep);

                      const goalNudge = complete
                        ? "Completed 🎉"
                        : rem <= 0
                        ? "Add any amount"
                        : `Next: add ${fmtMoney(smart)}`;

                      const isEditing = editingGoalId === g.id;
                      const isGoalBusy = savingGoalId === g.id;

                      return (
                        <li key={g.id} className={goalBoxClass}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 w-full">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  {isEditing ? (
                                    <input
                                      value={editGoalTitle}
                                      onChange={(e) => setEditGoalTitle(e.target.value)}
                                      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm font-semibold"
                                      placeholder="Goal title"
                                      disabled={isGoalBusy}
                                    />
                                  ) : (
                                    <p className="text-sm font-extrabold truncate">{g.title}</p>
                                  )}

                                  {complete ? (
                                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                                      Completed 🎉
                                    </span>
                                  ) : (
                                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                      Next move
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-2">
                                  {!complete && (
                                    <>
                                      {isEditing ? (
                                        <>
                                          <button
                                            onClick={() => saveEditGoal(g.id)}
                                            disabled={isGoalBusy}
                                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
                                            title="Save"
                                          >
                                            {isGoalBusy ? "…" : "✅"}
                                          </button>
                                          <button
                                            onClick={cancelEditGoal}
                                            disabled={isGoalBusy}
                                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
                                            title="Cancel"
                                          >
                                            ✖️
                                          </button>
                                        </>
                                      ) : (
                                        <button
                                          onClick={() => startEditGoal(g)}
                                          disabled={isGoalBusy}
                                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
                                          title="Edit goal"
                                        >
                                          ✏️
                                        </button>
                                      )}
                                    </>
                                  )}

                                  <button
                                    onClick={() => deleteGoal(g.id)}
                                    disabled={isGoalBusy}
                                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
                                    title="Delete goal"
                                  >
                                    {isGoalBusy ? "Deleting…" : "🗑️"}
                                  </button>
                                </div>
                              </div>

                              <div className="mt-2">
                                {isEditing ? (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-500">Target</span>
                                    <input
                                      value={editGoalTarget}
                                      onChange={(e) => setEditGoalTarget(e.target.value)}
                                      className="w-40 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
                                      placeholder="0"
                                      inputMode="decimal"
                                      disabled={isGoalBusy}
                                    />
                                  </div>
                                ) : (
                                  <p className="text-xs text-slate-600">
                                    {fmtMoney(saved)} / {fmtMoney(target)} • {p}%
                                  </p>
                                )}

                                <p className="mt-1 text-[11px] text-slate-600">{goalNudge}</p>
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 h-3 w-full rounded-full bg-slate-100">
                            <div
                              className="h-3 rounded-full bg-emerald-500"
                              style={{ width: `${p}%` }}
                            />
                          </div>

                          {/* Quick/Smart add = preset only (no auto-add) */}
                          <div className="mt-3 flex flex-col gap-2">
                            {!complete && (
                              <div className="flex flex-wrap gap-2">
                                {QUICK_AMOUNTS.map((amt) => (
                                  <button
                                    key={amt}
                                    type="button"
                                    onClick={() => presetGoalAmount(g.id, amt)}
                                    disabled={isGoalBusy}
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
                                  >
                                    +{fmtMoney(amt)}
                                  </button>
                                ))}

                                {rem > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const smartAmt = Math.min(
                                        rem,
                                        Math.max(1, Math.round(target * 0.1))
                                      );
                                      presetGoalAmount(g.id, smartAmt);
                                    }}
                                    disabled={isGoalBusy}
                                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                                  >
                                    Smart add
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => jumpToGoalInput(g.id)}
                                  disabled={isGoalBusy}
                                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
                                >
                                  Focus
                                </button>
                              </div>
                            )}

                            {/* Manual add */}
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                              <input
                                id={`goal-add-${g.id}`}
                                value={goalAddId === g.id ? goalAddAmount : ""}
                                onFocus={() => setGoalAddId(g.id)}
                                onChange={(e) => setGoalAddAmount(e.target.value)}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-60"
                                placeholder={complete ? "Completed" : "Add custom amount"}
                                inputMode="decimal"
                                disabled={complete || isGoalBusy}
                              />
                              <button
                                onClick={() => addToGoal(g.id)}
                                disabled={complete || isGoalBusy}
                                className="w-full sm:w-auto rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60 disabled:hover:bg-slate-900"
                              >
                                {complete ? "Completed" : isGoalBusy ? "Adding…" : "Add"}
                              </button>
                            </div>
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
                    {expenses.slice(0, 10).map((e) => {
                      const isEditing = editingExpenseId === e.id;
                      const isBusy = savingExpenseId === e.id;

                      return (
                        <li
                          key={e.id}
                          className="rounded-xl border border-slate-200 px-3 py-2"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 w-full">
                              {isEditing ? (
                                <>
                                  <div className="grid grid-cols-2 gap-2">
                                    <input
                                      value={editExpAmount}
                                      onChange={(ev) => setEditExpAmount(ev.target.value)}
                                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
                                      placeholder="Amount"
                                      inputMode="decimal"
                                      disabled={isBusy}
                                    />
                                    <select
                                      value={editExpCategory}
                                      onChange={(ev) =>
                                        setEditExpCategory(ev.target.value as any)
                                      }
                                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
                                      disabled={isBusy}
                                    >
                                      {CATEGORIES.map((c) => (
                                        <option key={c} value={c}>
                                          {c}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <input
                                    value={editExpDesc}
                                    onChange={(ev) => setEditExpDesc(ev.target.value)}
                                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
                                    placeholder="Description"
                                    disabled={isBusy}
                                  />
                                  <div className="mt-2 flex gap-2">
                                    <button
                                      onClick={() => saveEditExpense(e.id)}
                                      disabled={isBusy}
                                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
                                    >
                                      {isBusy ? "Saving…" : "Save"}
                                    </button>
                                    <button
                                      onClick={cancelEditExpense}
                                      disabled={isBusy}
                                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <p className="text-sm font-semibold">
                                    {(e.category || "Other").toUpperCase()}
                                  </p>
                                  <p className="truncate text-xs text-slate-500">
                                    {e.description || "—"}
                                  </p>
                                  <p className="mt-1 text-[11px] text-slate-400">
                                    {(e.occurred_at || "").slice(0, 10)}
                                  </p>
                                </>
                              )}
                            </div>

                            {!isEditing && (
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-bold">{fmtMoney(n(e.amount))}</p>
                                <button
                                  onClick={() => startEditExpense(e)}
                                  disabled={isBusy}
                                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
                                  title="Edit"
                                >
                                  ✏️
                                </button>
                                <button
                                  onClick={() => deleteExpense(e.id)}
                                  disabled={isBusy}
                                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
                                  title="Delete"
                                >
                                  {isBusy ? "…" : "🗑️"}
                                </button>
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <p className="mt-6 text-sm font-bold">Recent assets</p>
                {assets.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">No assets yet.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {assets.slice(0, 10).map((a) => {
                      const isBusy = savingAssetId === a.id;

                      return (
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
                            <p className="text-sm font-bold">{fmtMoney(n(a.amount))}</p>
                            <button
                              onClick={() => deleteAsset(a.id)}
                              disabled={isBusy}
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
                              title="Delete"
                            >
                              {isBusy ? "…" : "🗑️"}
                            </button>
                          </div>
                        </li>
                      );
                    })}
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