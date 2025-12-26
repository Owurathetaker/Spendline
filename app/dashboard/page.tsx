"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type MonthRow = {
  id: number;
  user_id: string;
  month: string; // "YYYY-MM"
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

function ymNow() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string>("");
  const [month, setMonth] = useState<string>(ymNow());

  const [monthRow, setMonthRow] = useState<MonthRow | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [error, setError] = useState<string | null>(null);

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

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      const user = userData?.user;

      if (userErr || !user) {
        router.replace("/login");
        return;
      }

      setEmail(user.email || "");
      const userId = user.id;

      // 1) Month row (IMPORTANT: filter by user_id + month, and insert user_id)
      const mr = await supabase
        .from("months")
        .select("id,user_id,month,currency,budget,assets,liabilities")
        .eq("user_id", userId)
        .eq("month", month)
        .maybeSingle();

      if (mr.error) throw mr.error;

      if (!mr.data) {
        const ins = await supabase
          .from("months")
          .insert({
            user_id: userId,
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
      } else {
        setMonthRow(mr.data as MonthRow);
      }

      // 2) Expenses (also filter by user_id for clarity)
      const ex = await supabase
        .from("expenses")
        .select("id,user_id,month,amount,category,description,occurred_at")
        .eq("user_id", userId)
        .eq("month", month)
        .order("occurred_at", { ascending: false })
        .limit(50);

      if (ex.error) throw ex.error;
      setExpenses((ex.data || []) as ExpenseRow[]);

      // 3) Assets (also filter by user_id for clarity)
      const as = await supabase
        .from("asset_events")
        .select("id,user_id,month,amount,note,created_at")
        .eq("user_id", userId)
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
    router.replace("/login");
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
        <div className="mt-6 flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <p className="text-xs text-slate-500">Month</p>
            <p className="text-sm font-semibold">{month}</p>
          </div>

          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
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

            {/* Progress + milestones */}
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
                  Next: we’ll add saving goals + reward milestones here.
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

            {/* Tables */}
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
                        className="flex items-start justify-between rounded-xl border border-slate-200 px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-semibold">
                            {(e.category || "Other").toUpperCase()}
                          </p>
                          <p className="text-xs text-slate-500">{e.description || "—"}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold">
                            {currency} {Number(e.amount).toLocaleString()}
                          </p>
                          <p className="text-xs text-slate-500">
                            {(e.occurred_at || "").slice(0, 10)}
                          </p>
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
                        className="flex items-start justify-between rounded-xl border border-slate-200 px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-semibold">ASSET</p>
                          <p className="text-xs text-slate-500">{a.note || "—"}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold">
                            {currency} {Number(a.amount).toLocaleString()}
                          </p>
                          <p className="text-xs text-slate-500">
                            {(a.created_at || "").slice(0, 10)}
                          </p>
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