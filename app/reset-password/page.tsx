"use client";
 
import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getSiteUrl } from "@/lib/site-url";
 
export default function ResetPasswordPage() {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
 
  async function sendReset() {
  setError(null);
  const e = email.trim();
  if (!e) {
    setError("Enter your email.");
    return;
  }

  setLoading(true);
  try {
    const redirectTo =
  typeof window !== "undefined"
    ? `${window.location.origin}/update-password`
    : undefined;

const { error } = await supabase.auth.resetPasswordForEmail(e, { redirectTo });

    if (error) throw error;

    setDone(true);
  } catch (err: any) {
    setError(err?.message || "Failed to send reset email.");
  } finally {
    setLoading(false);
  }
}
 
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto max-w-md px-4 py-10">
        <h1 className="text-2xl font-extrabold tracking-tight">
          Reset password
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          We’ll email you a secure link to set a new password.
        </p>
 
        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2">
            <p className="text-xs font-semibold text-red-700">Heads up</p>
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}
 
        {done ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-900">
              Email sent ✅
            </p>
            <p className="mt-1 text-xs text-emerald-900">
              Check your inbox (and spam). Open the link to set a new password.
            </p>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
            <label className="block text-xs text-slate-500">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm transition focus:outline-none focus:ring-2 focus:ring-slate-200"
              placeholder="you@email.com"
              inputMode="email"
            />
 
            <button
              onClick={sendReset}
              disabled={loading}
              className="mt-4 w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white transition active:scale-[0.98] hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </div>
        )}
 
        <div className="mt-6 text-xs text-slate-500">
          <Link className="underline" href="/login">
            Back to login
          </Link>
        </div>
      </div>
    </main>
  );
}