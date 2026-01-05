"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function UpdatePasswordPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(true);

  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    (async () => {
      setProcessing(true);
      setError(null);

      try {
        // ✅ Best path (Supabase v2): reads token/code from URL and sets the session
        // Some builds may not have this; we guard it.
        const anyAuth = supabase.auth as any;
        if (typeof anyAuth.getSessionFromUrl === "function") {
          const { data, error: urlErr } = await anyAuth.getSessionFromUrl();
          if (urlErr) {
            // Not fatal; we’ll fall back to getSession
          } else if (data?.session) {
            if (!ignore) setReady(true);
            // Clean URL so refresh doesn’t keep reprocessing the token
            if (typeof window !== "undefined") {
              window.history.replaceState(null, "", window.location.pathname);
            }
            if (!ignore) setProcessing(false);
            return;
          }
        }

        // ✅ Fallback: check if session already exists (works for normal logged-in flow)
        const { data } = await supabase.auth.getSession();
        if (!ignore) setReady(!!data?.session);

        // Clean URL hash/query if they exist (optional but safer)
        if (typeof window !== "undefined") {
          window.history.replaceState(null, "", window.location.pathname);
        }
      } catch (e: any) {
        if (!ignore) {
          setReady(false);
          setError(e?.message || "Could not validate recovery session.");
        }
      } finally {
        if (!ignore) setProcessing(false);
      }
    })();

    // Keep ready updated if auth state changes while user is on this page
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setReady(!!session);
    });

    return () => {
      ignore = true;
      sub?.subscription?.unsubscribe?.();
    };
  }, [supabase]);

  async function updatePassword() {
    setError(null);

    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const { error: upErr } = await supabase.auth.updateUser({ password });
      if (upErr) throw upErr;

      setDone(true);
      setTimeout(() => router.push("/login"), 1200);
    } catch (err: any) {
      setError(err?.message || "Failed to update password.");
    } finally {
      setLoading(false);
    }
  }

  const showOpenedDirectly = !processing && !done && !ready;

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto max-w-md px-4 py-10">
        <h1 className="text-2xl font-extrabold tracking-tight">Set new password</h1>
        <p className="mt-1 text-sm text-slate-500">
          Choose a new password for your account.
        </p>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2">
            <p className="text-xs font-semibold text-red-700">Heads up</p>
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        {showOpenedDirectly && (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">Opened directly?</p>
            <p className="mt-1 text-xs text-amber-900">
              Please open this page using the password reset link from your email.
              If you did, refresh once.
            </p>
          </div>
        )}

        {done ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-900">Password updated ✅</p>
            <p className="mt-1 text-xs text-emerald-900">Redirecting you to login…</p>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
            <label className="block text-xs text-slate-500">New password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm transition focus:outline-none focus:ring-2 focus:ring-slate-200"
              placeholder="At least 8 characters"
              autoComplete="new-password"
              disabled={processing}
            />

            <label className="mt-3 block text-xs text-slate-500">Confirm password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm transition focus:outline-none focus:ring-2 focus:ring-slate-200"
              placeholder="Repeat password"
              autoComplete="new-password"
              disabled={processing}
            />

            <button
              onClick={updatePassword}
              disabled={loading || processing || !ready}
              className="mt-4 w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white transition active:scale-[0.98] hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {processing ? "Preparing…" : loading ? "Updating…" : "Update password"}
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