"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

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
  id: string;
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

function sanitizeMoneyInput(v: string) {
  const cleaned = v.replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");
  const head = parts[0] ?? "";
  const tail = parts.slice(1).join("");
  return tail.length ? `${head}.${tail}` : head;
}

function formatMoneyInput(v: string) {
  const raw = String(v || "").replace(/,/g, "");
  if (!raw) return "";
  const parts = raw.split(".");
  const intPart = parts[0] || "0";
  const decPart = parts[1];
  const intFmt = Number(intPart).toLocaleString();
  return decPart != null && decPart !== "" ? `${intFmt}.${decPart}` : intFmt;
}

function toNumberFromMoneyInput(v: string) {
  const num = Number(String(v || "").replace(/,/g, ""));
  return Number.isFinite(num) ? num : 0;
}

function isValidYM(ym: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(ym);
}

export default function DashboardPage() {
  const SHOW_MONTH_PICKER = false; // true later when you want it back
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

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

  // Guard rails
  const [savingMonthSettings, setSavingMonthSettings] = useState(false);
  const [savingExpenseId, setSavingExpenseId] = useState<number | "new" | null>(
    null
  );
  const [savingAssetId, setSavingAssetId] = useState<string | "new" | null>(
    null
  );
  const [savingGoalCreate, setSavingGoalCreate] = useState(false);
  const [savingGoalId, setSavingGoalId] = useState<number | null>(null);

  const budget = n(monthRow?.budget);
  const liabilities = n(monthRow?.liabilities);

  const spentTotal = useMemo(
    () => expenses.reduce((s, e) => s + n(e.amount), 0),
    [expenses]
  );

  const assetsTotal = useMemo(
    () => assets.reduce((s, a) => s + n(a.amount), 0),
    [assets]
  );

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
    const m = typeof month === "string" ? month.trim() : "";
    return isValidYM(m) ? m : ymNow();
  }

  async function requireUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) {
      router.replace("/login");
      return null;
    }
    return data.user;
  }

  function safeParseJson(text: string) {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  async function apiFetch<T = any>(path: string, init?: RequestInit): Promise<T> {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;

    if (!token) throw new Error("Unauthorized. Please log in again.");

    const hasBody = init?.body != null;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      ...(init?.headers as any),
    };

    if (hasBody && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(path, {
      ...init,
      headers,
      cache: "no-store",
    });

    const text = await res.text().catch(() => "");
    const json = text ? safeParseJson(text) : null;

    if (!res.ok) {
      const msg =
        (json && (json.error || json.message)) ||
        (text ? text.slice(0, 160) : "") ||
        `Request failed (${res.status})`;
      throw new Error(String(msg));
    }

    return (json as T) ?? ({} as T);
  }

  // ===== Load everything via API routes (single source of truth) =====
  async function load() {
    setLoading(true);
    setError(null);

    try {
      const user = await requireUser();
      if (!user) return;

      setEmail(user.email || "");

      const m = monthSafe();

      const mr = await apiFetch<MonthRow>(
        `/api/months?month=${encodeURIComponent(m)}`,
        { method: "GET" }
      );
      setMonthRow(mr || null);
      setCurrencyInput(String(mr?.currency || "GHS").toUpperCase());
      setBudgetInput(formatMoneyInput(String(mr?.budget ?? 0)));

      const ex = await apiFetch<ExpenseRow[]>(
        `/api/expenses?month=${encodeURIComponent(m)}`,
        { method: "GET" }
      );
      setExpenses(Array.isArray(ex) ? ex : []);

      const asq = await apiFetch<AssetRow[]>(
        `/api/assets?month=${encodeURIComponent(m)}`,
        { method: "GET" }
      );
      setAssets(Array.isArray(asq) ? asq : []);

      const gq = await apiFetch<SavingGoalRow[]>(
        `/api/goals?month=${encodeURIComponent(m)}`,
        { method: "GET" }
      );
      setGoals(Array.isArray(gq) ? gq : []);
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
    if (savingMonthSettings) return;
    setError(null);
    setSavingMonthSettings(true);

    try {
      const user = await requireUser();
      if (!user) return;

      const m = monthSafe();
      await apiFetch(`/api/months`, {
        method: "PUT",
        body: JSON.stringify({
          month: m,
          currency: currencyInput.toUpperCase(),
          budget: toNumberFromMoneyInput(budgetInput),
        }),
      });

      await load();
      pushNudge("Month settings saved.");
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

      const amt = toNumberFromMoneyInput(expAmount);
      if (amt <= 0) {
        pushNudge("Enter an expense amount greater than 0.");
        return;
      }

      await apiFetch(`/api/expenses`, {
        method: "POST",
        body: JSON.stringify({
          month: monthSafe(),
          amount: amt,
          category: expCategory,
          description: expDesc.trim() || null,
          occurred_at: new Date().toISOString(),
        }),
      });

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
    setEditExpAmount(formatMoneyInput(String(n(e.amount))));
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

      const amt = toNumberFromMoneyInput(editExpAmount);
      if (amt <= 0) {
        pushNudge("Amount must be greater than 0.");
        return;
      }

      await apiFetch(`/api/expenses`, {
        method: "PATCH",
        body: JSON.stringify({
          id: expenseId,
          amount: amt,
          category: editExpCategory,
          description: editExpDesc.trim() || null,
        }),
      });

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

      await apiFetch(`/api/expenses?id=${encodeURIComponent(String(expenseId))}`, {
        method: "DELETE",
      });

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

      const amt = toNumberFromMoneyInput(assetAmount);
      if (amt <= 0) {
        pushNudge("Enter an asset amount greater than 0.");
        return;
      }

      await apiFetch(`/api/assets`, {
        method: "POST",
        body: JSON.stringify({
          month: monthSafe(),
          amount: amt,
          note: assetNote.trim() || null,
          created_at: new Date().toISOString(),
        }),
      });

      setAssetAmount("");
      setAssetNote("");
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to add asset.");
    } finally {
      setSavingAssetId(null);
    }
  }

  async function deleteAsset(assetId: string) {
    if (savingAssetId === assetId) return;
    setError(null);
    setSavingAssetId(assetId);

    try {
      const user = await requireUser();
      if (!user) return;

      await apiFetch(`/api/assets?id=${encodeURIComponent(String(assetId))}`, {
        method: "DELETE",
      });

      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to delete asset.");
    } finally {
      setSavingAssetId(null);
    }
  }

  // Goal helpers
  function goalProgress(g: SavingGoalRow) {
    const target = Math.max(0, n(g.target_amount));
    const saved = Math.max(0, n(g.saved_amount));
    const pct = target <= 0 ? 0 : clampPct(Math.round((saved / target) * 100));
    const remainingAmt = Math.max(0, target - saved);
    const complete = target > 0 && saved >= target;
    return { target, saved, pct, remaining: remainingAmt, complete };
  }

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

  function presetGoalAmount(goalId: number, amount: number) {
    setGoalAddId(goalId);
    setGoalAddAmount(formatMoneyInput(String(amount)));

    setTimeout(() => {
      const el = document.getElementById(
        `goal-add-${goalId}`
      ) as HTMLInputElement | null;
      el?.focus();
      el?.select?.();
    }, 50);
  }

  async function createGoal() {
    setGoalNameErr(null);
    setGoalTargetErr(null);
    setError(null);

    if (savingGoalCreate) return;
    setSavingGoalCreate(true);

    try {
      const user = await requireUser();
      if (!user) return;

      const name = goalName.trim();
      const target = toNumberFromMoneyInput(goalTarget);

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

      await apiFetch(`/api/goals`, {
        method: "POST",
        body: JSON.stringify({
          month: monthSafe(),
          title: name,
          target_amount: target,
        }),
      });

      setGoalName("");
      setGoalTarget("");
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to create goal.");
    } finally {
      setSavingGoalCreate(false);
    }
  }

  function startEditGoal(g: SavingGoalRow) {
    setEditingGoalId(g.id);
    setEditGoalTitle(g.title || "");
    setEditGoalTarget(formatMoneyInput(String(n(g.target_amount))));
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
      const target = toNumberFromMoneyInput(editGoalTarget);

      if (!title) {
        pushNudge("Goal title cannot be empty.");
        return;
      }
      if (target <= 0) {
        pushNudge("Target must be greater than 0.");
        return;
      }

      await apiFetch(`/api/goals`, {
        method: "PATCH",
        body: JSON.stringify({
          id: goalId,
          title,
          target_amount: target,
        }),
      });

      cancelEditGoal();
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to update goal.");
    } finally {
      setSavingGoalId(null);
    }
  }

  async function addToGoal(goalId: number) {
    if (savingGoalId === goalId) return;
    setError(null);
    setSavingGoalId(goalId);

    try {
      const user = await requireUser();
      if (!user) return;

      setGoalAddId(goalId);

      const amt = toNumberFromMoneyInput(goalAddAmount);
      if (amt <= 0) {
        pushNudge("Enter an amount greater than 0.");
        return;
      }

      await apiFetch(`/api/goals`, {
        method: "PATCH",
        body: JSON.stringify({
          id: goalId,
          add_amount: amt,
        }),
      });

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

      await apiFetch(`/api/goals?id=${encodeURIComponent(String(goalId))}`, {
        method: "DELETE",
      });

      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to delete goal.");
    } finally {
      setSavingGoalId(null);
    }
  }

  // Achievements
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

  // Mini analytics
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

    return moves.slice(0, 3);
  }, [budget, expenses.length, assets.length]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  if (loading) {
    return (
      <main className="min-h-screen bg-white text-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-r-transparent" />
          <p className="mt-3 text-sm text-slate-600">Loading your dashboard…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white text-slate-900 flex flex-col">
      <div className="mx-auto max-w-5xl px-4 py-8 w-full flex-1">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Spendline 💰</h1>
            <p className="text-sm text-slate-500">
              Quiet money control — track what leaves, stack what stays.
            </p>
          </div>
        </div>

        {SHOW_MONTH_PICKER && (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <p className="text-xs text-slate-500">Month</p>
              <p className="text-sm font-semibold">{monthSafe()}</p>
            </div>

            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-full sm:w-auto rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-red-700">Heads up</p>
                <p className="text-xs text-red-700">{error}</p>
              </div>

              <button
                type="button"
                onClick={() => setError(null)}
                className="rounded-lg border border-red-200 bg-white px-2 py-1 text-[11px] font-semibold text-red-700 transition active:scale-[0.98] hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-200"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {nudge && (
          <div
            className="fixed bottom-4 right-4 z-50 w-[92vw] max-w-sm"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-amber-900">Quick fix</p>
                  <p className="mt-0.5 text-xs text-amber-900">{nudge}</p>
                </div>

                <button
                  type="button"
                  onClick={() => setNudge(null)}
                  className="rounded-lg border border-amber-200 bg-white px-2 py-1 text-[11px] font-semibold text-amber-900 transition active:scale-[0.98] hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-200"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Overview (tap cards to jump) */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card
            title="Budget"
            value={fmtMoney(budget)}
            variant="blue"
            onClick={() => focusById("budget-input")}
          />
          <Card
            title="Spent"
            value={fmtMoney(spentTotal)}
            variant="red"
            onClick={() => focusById("exp-amount")}
          />
          <Card
            title="Remaining"
            value={fmtMoney(remaining)}
            variant="green"
            onClick={() => focusById("exp-amount")}
          />
          <Card
            title="Net Worth"
            value={fmtMoney(netWorth)}
            variant="purple"
            onClick={() => focusById("asset-amount")}
          />
        </div>

        {/* Progress + Achievements */}
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">Monthly Budget Progress</p>
              <p className="text-sm text-slate-600">{progressPct}%</p>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="h-3 w-full rounded-full bg-slate-100">
                <div
                  className="h-3 rounded-full bg-emerald-500 transition-all duration-500 ease-out"
                  style={{ width: `${progressPct}%` }}
                />
              </div>

              <div className="justify-self-end">
                <BudgetDonut
                  pct={progressPct}
                  label={`${fmtMoney(spentTotal)} / ${fmtMoney(budget)}`}
                />
              </div>
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
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold transition active:scale-[0.98] hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200"
                >
                  + Log expense
                </button>
                <button
                  onClick={() => focusById("asset-amount")}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold transition active:scale-[0.98] hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200"
                >
                  + Add asset
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
                      className="text-left rounded-xl border border-slate-200 bg-slate-50 p-3 transition active:scale-[0.99] hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    >
                      <div className="text-sm font-semibold">{m.title}</div>
                      <div className="mt-1 text-xs text-slate-500">{m.detail}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {nextMove && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-bold text-slate-700">Goal next move</p>
                <p className="mt-1 text-xs text-slate-600">{nextMove.line}</p>
                {!goalProgress(nextMove.goal).complete && (
                  <button
                    onClick={() => jumpToGoalInput(nextMove.goal.id)}
                    className="mt-3 w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white transition active:scale-[0.98] hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  >
                    Add to this goal
                  </button>
                )}
              </div>
            )}

            <p className="mt-3 text-xs text-slate-400">No setup needed — just log and go.</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <SectionTitle title="Achievements" subtitle="Small wins = momentum." />
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
            <SectionTitle title="Month settings" subtitle="Currency + budget for this month." />

            <label className="mt-3 block text-xs text-slate-500">Currency</label>
            <input
              value={currencyInput}
              onChange={(e) => setCurrencyInput(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              placeholder="GHS"
            />

            <label className="mt-3 block text-xs text-slate-500">Budget</label>
            <div className="mt-1">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                  {symbol}
                </span>
                <input
                  id="budget-input"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(sanitizeMoneyInput(e.target.value))}
                  onBlur={() => setBudgetInput(formatMoneyInput(budgetInput))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 pl-8 text-sm shadow-sm outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                  placeholder="0"
                  inputMode="decimal"
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">Monthly cap (rough is fine).</p>
            </div>

            <button
              onClick={saveMonthSettings}
              disabled={savingMonthSettings}
              className="mt-4 w-full rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white transition active:scale-[0.98] hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            >
              {savingMonthSettings ? "Saving…" : "Save"}
            </button>
          </div>

          {/* Add expense */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <SectionTitle title="Log expense" subtitle="Track money that left today." />

            <label className="mt-3 block text-xs text-slate-500">Amount</label>
            <div className="mt-1">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                  {symbol}
                </span>
                <input
                  id="exp-amount"
                  value={expAmount}
                  onChange={(e) => setExpAmount(sanitizeMoneyInput(e.target.value))}
                  onBlur={() => setExpAmount(formatMoneyInput(expAmount))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 pl-8 text-sm shadow-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
                  placeholder="0"
                  inputMode="decimal"
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">Numbers only (e.g. 1500).</p>
            </div>

            <label className="mt-3 block text-xs text-slate-500">Category</label>
            <select
              value={expCategory}
              onChange={(e) => setExpCategory(e.target.value as any)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm transition focus:outline-none focus:ring-2 focus:ring-slate-200"
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
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              placeholder="e.g. lunch"
            />

            <button
              onClick={addExpense}
              disabled={savingExpenseId === "new"}
              className="mt-4 w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white transition active:scale-[0.98] hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100 focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              {savingExpenseId === "new" ? "Adding…" : "Add expense"}
            </button>
          </div>

          {/* Add asset */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <SectionTitle title="Stack asset" subtitle="Record money that stayed." />

            <label className="mt-3 block text-xs text-slate-500">Amount</label>
            <div className="mt-1">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                  {symbol}
                </span>
                <input
                  id="asset-amount"
                  value={assetAmount}
                  onChange={(e) => setAssetAmount(sanitizeMoneyInput(e.target.value))}
                  onBlur={() => setAssetAmount(formatMoneyInput(assetAmount))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 pl-8 text-sm shadow-sm outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                  placeholder="0"
                  inputMode="decimal"
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Cash, savings, investments—anything counts.
              </p>
            </div>

            <label className="mt-3 block text-xs text-slate-500">Note (optional)</label>
            <input
              value={assetNote}
              onChange={(e) => setAssetNote(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              placeholder="e.g. savings"
            />

            <button
              onClick={addAsset}
              disabled={savingAssetId === "new"}
              className="mt-4 w-full rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white transition active:scale-[0.98] hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            >
              {savingAssetId === "new" ? "Adding…" : "Add asset"}
            </button>
          </div>
        </div>

        {/* Goals + lists */}
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {/* Goals */}
          <div id="goals-section" className="rounded-2xl border border-slate-200 bg-white p-4">
            <SectionTitle title="Saving goals" subtitle="Progress is automatic. You just add." />

            <div className="mt-3 grid gap-2">
              <input
                id="goal-name"
                value={goalName}
                onChange={(e) => {
                  setGoalName(e.target.value);
                  if (goalNameErr) setGoalNameErr(null);
                }}
                aria-invalid={!!goalNameErr}
                aria-describedby={goalNameErr ? "goal-name-err" : undefined}
                className={`w-full rounded-xl border bg-white px-3 py-2 text-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
                  goalNameErr
                    ? "border-red-300 focus:ring-red-200"
                    : "border-slate-200 focus:ring-slate-200"
                }`}
                placeholder="Goal name (e.g. Emergency Fund)"
              />

              {goalNameErr && (
                <p id="goal-name-err" className="mt-1 text-xs text-red-600" role="alert">
                  {goalNameErr}
                </p>
              )}

              <div className="mt-1">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                    {symbol}
                  </span>
                  <input
                    id="goal-target"
                    value={goalTarget}
                    onChange={(e) => {
                      setGoalTarget(sanitizeMoneyInput(e.target.value));
                      if (goalTargetErr) setGoalTargetErr(null);
                    }}
                    onBlur={() => setGoalTarget(formatMoneyInput(goalTarget))}
                    className={`w-full rounded-xl border bg-white px-3 py-2 pl-8 text-sm shadow-sm outline-none transition ${
                      goalTargetErr
                        ? "border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100"
                        : "border-slate-200 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                    }`}
                    placeholder="Target amount"
                    inputMode="decimal"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">Set the finish line. You can edit later.</p>
              </div>

              {goalTargetErr && <p className="mt-1 text-xs text-red-600">{goalTargetErr}</p>}

              <button
                onClick={createGoal}
                disabled={savingGoalCreate}
                className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white transition active:scale-[0.98] hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              >
                {savingGoalCreate ? "Creating…" : "Create goal"}
              </button>
            </div>

            {goals.length === 0 ? (
              <EmptyState text="No goals yet. Create one above to start tracking progress." />
            ) : (
              <ul className="mt-4 space-y-2">
                {sortedGoals.map((g) => {
                  const { target, saved, pct: p, remaining: rem, complete } = goalProgress(g);

                  const goalBoxClass = complete
                    ? "rounded-xl border border-emerald-200 bg-emerald-50 p-3 transition hover:shadow-sm"
                    : "rounded-xl border border-slate-200 p-3 transition hover:bg-slate-50 hover:shadow-sm";

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
                                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm font-semibold transition placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
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
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                                  {p}%
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
                                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold transition active:scale-[0.98] hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-slate-200"
                                        title="Save"
                                      >
                                        {isGoalBusy ? "…" : "✅"}
                                      </button>
                                      <button
                                        onClick={cancelEditGoal}
                                        disabled={isGoalBusy}
                                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold transition active:scale-[0.98] hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-slate-200"
                                        title="Cancel"
                                      >
                                        ✖️
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      onClick={() => startEditGoal(g)}
                                      disabled={isGoalBusy}
                                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold transition active:scale-[0.98] hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-slate-200"
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
                                className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold transition active:scale-[0.98] hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-slate-200"
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
                                  onChange={(e) => setEditGoalTarget(sanitizeMoneyInput(e.target.value))}
                                  onBlur={() => setEditGoalTarget(formatMoneyInput(editGoalTarget))}
                                  className="w-40 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                                  placeholder="0"
                                  inputMode="decimal"
                                  disabled={isGoalBusy}
                                />
                              </div>
                            ) : (
                              <p className="text-xs text-slate-600">
                                {fmtMoney(saved)} / {fmtMoney(target)}{" "}
                                {complete ? "" : rem > 0 ? `• ${fmtMoney(rem)} left` : ""}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 h-3 w-full rounded-full bg-slate-100">
                        <div
                          className="h-3 rounded-full bg-emerald-500 transition-all duration-500 ease-out"
                          style={{ width: `${p}%` }}
                        />
                      </div>

                      <div className="mt-3 flex flex-col gap-2">
                        {!complete && (
                          <div className="flex flex-wrap gap-2">
                            {QUICK_AMOUNTS.map((amt) => (
                              <button
                                key={amt}
                                type="button"
                                onClick={() => presetGoalAmount(g.id, amt)}
                                disabled={isGoalBusy}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold transition active:scale-[0.98] hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-slate-200"
                              >
                                +{fmtMoney(amt)}
                              </button>
                            ))}
                          </div>
                        )}

                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <input
                            id={`goal-add-${g.id}`}
                            value={goalAddId === g.id ? goalAddAmount : ""}
                            onFocus={() => setGoalAddId(g.id)}
                            onChange={(e) => setGoalAddAmount(sanitizeMoneyInput(e.target.value))}
                            onBlur={() => {
                              if (goalAddId === g.id) setGoalAddAmount(formatMoneyInput(goalAddAmount));
                            }}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm transition placeholder:text-slate-400 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-slate-200"
                            placeholder={complete ? "Completed" : "Add custom amount"}
                            inputMode="decimal"
                            disabled={complete || isGoalBusy}
                          />
                          <button
                            onClick={() => addToGoal(g.id)}
                            disabled={complete || isGoalBusy}
                            className="w-full sm:w-auto rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white transition active:scale-[0.98] hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
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
            <SectionTitle title="Recent expenses" subtitle="Latest 10 entries." />
            {expenses.length === 0 ? (
              <EmptyState text="No expenses yet. Log your first one to start the month." />
            ) : (
              <ul className="mt-3 space-y-2">
                {expenses.slice(0, 10).map((e) => {
                  const isEditing = editingExpenseId === e.id;
                  const isBusy = savingExpenseId === e.id;

                  const pctOfBudget =
                    budget > 0 ? clampPct(Math.round((n(e.amount) / budget) * 100)) : 0;

                  return (
                    <li
                      key={e.id}
                      className="rounded-xl border border-slate-200 px-3 py-2 transition hover:bg-slate-50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 w-full">
                          {isEditing ? (
                            <>
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  value={editExpAmount}
                                  onChange={(ev) => setEditExpAmount(sanitizeMoneyInput(ev.target.value))}
                                  onBlur={() => setEditExpAmount(formatMoneyInput(editExpAmount))}
                                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                                  placeholder="Amount"
                                  inputMode="decimal"
                                  disabled={isBusy}
                                />
                                <select
                                  value={editExpCategory}
                                  onChange={(ev) => setEditExpCategory(ev.target.value as any)}
                                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm transition focus:outline-none focus:ring-2 focus:ring-slate-200"
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
                                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                                placeholder="Description"
                                disabled={isBusy}
                              />
                              <div className="mt-2 flex gap-2">
                                <button
                                  onClick={() => saveEditExpense(e.id)}
                                  disabled={isBusy}
                                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold transition active:scale-[0.98] hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-slate-200"
                                >
                                  {isBusy ? "Saving…" : "Save"}
                                </button>
                                <button
                                  onClick={cancelEditExpense}
                                  disabled={isBusy}
                                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold transition active:scale-[0.98] hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-slate-200"
                                >
                                  Cancel
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-semibold">
                                  {(e.category || "Other").toUpperCase()}
                                </p>
                                {budget > 0 && (
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-extrabold text-slate-700">
                                    {pctOfBudget}% of budget
                                  </span>
                                )}
                              </div>
                              <p className="truncate text-xs text-slate-500">{e.description || "—"}</p>
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
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold transition active:scale-[0.98] hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-slate-200"
                              title="Edit"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => deleteExpense(e.id)}
                              disabled={isBusy}
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold transition active:scale-[0.98] hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-slate-200"
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

            <div className="mt-6">
              <SectionTitle title="Recent assets" subtitle="Latest 10 entries." />
            </div>

            {assets.length === 0 ? (
              <EmptyState text="No assets yet. Add any asset to start stacking." />
            ) : (
              <ul className="mt-3 space-y-2">
                {assets.slice(0, 10).map((a) => {
                  const isBusy = savingAssetId === a.id;

                  return (
                    <li
                      key={a.id}
                      className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 transition hover:bg-slate-50"
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
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold transition active:scale-[0.98] hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-slate-200"
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
      </div>

      <footer className="mt-10 pb-6 text-center text-xs text-slate-500">
        <a href="/support" className="underline">
          Support
        </a>
        {" • "}
        <a href="/privacy" className="underline">
          Privacy
        </a>
      </footer>
    </main>
  );
}

function Card({
  title,
  value,
  variant,
  onClick,
}: {
  title: string;
  value: string;
  variant: "blue" | "red" | "green" | "purple";
  onClick?: () => void;
}) {
  const styles = {
    blue: "border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100",
    red: "border-red-200 bg-gradient-to-br from-red-50 to-red-100",
    green: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-100",
    purple: "border-purple-200 bg-gradient-to-br from-purple-50 to-purple-100",
  } as const;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-2xl border p-4 shadow-sm transition active:scale-[0.99] hover:-translate-y-[1px] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-200 ${styles[variant]}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{title}</p>
      <p className="mt-2 text-2xl font-black tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-[11px] text-slate-600">Tap to jump</p>
    </button>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-900">{title}</p>
        {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
      <p className="text-sm text-slate-500">{text}</p>
    </div>
  );
}

/**
 * Simple donut chart: shows % spent (0-100).
 * No dependencies. Works in iOS Safari.
 */
function BudgetDonut({ pct, label }: { pct: number; label: string }) {
  const p = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  const size = 56;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (p / 100) * c;

  return (
    <div className="flex items-center gap-3">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="shrink-0"
        aria-label="Budget usage donut chart"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgb(226 232 240)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgb(16 185 129)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="50%"
          dominantBaseline="middle"
          textAnchor="middle"
          fontSize="12"
          fontWeight="800"
          fill="rgb(15 23 42)"
        >
          {p}%
        </text>
      </svg>

      <div className="hidden sm:block">
        <p className="text-[11px] text-slate-500">Spent vs budget</p>
        <p className="text-xs font-semibold text-slate-700">{label}</p>
      </div>
    </div>
  );
}