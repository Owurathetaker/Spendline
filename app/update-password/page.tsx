"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function readHashParams() {
  if (typeof window === "undefined") return {};
  const raw = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;

  const p = new URLSearchParams(raw);
  return {
    access_token: p.get("access_token"),
    refresh_token: p.get("refresh_token"),
    type: p.get("type"),
  };
}

function readSearchParams() {
  if (typeof window === "undefined") return {};
  const p = new URLSearchParams(window.location.search);
  return {
    code: p.get("code"),
    type: p.get("type"),
  };
}

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

  // dev-only debug
  const [dbg, setDbg] = useState<any>(null);

  useEffect(() => {
    let unsub: (() => void) | null = null;

    (async () => {
      setProcessing(true);
      setError(null);

      const debug: any = {
        href: typeof window !== "undefined" ? window.location.href : "",
        hash: typeof window !== "undefined" ? window.location.hash : "",
        search: typeof window !== "undefined" ? window.location.search : "",
        saw: {},
        steps: [],
      };

      try {
        // 1) Try HASH token recovery flow
        const h = readHashParams();
        debug.saw.hash = h;

        if (h.type === "recovery" && h.access_token && h.refresh_token) {
          debug.steps.push("hash:setSession:start");
          const { error: setErr } = await supabase.auth.setSession({
            access_token: h.access_token,
            refresh_token: h.refresh_token,
          });
          if (setErr) {
            debug.steps.push("hash:setSession:error");
            throw setErr;
          }
          debug.steps.push("hash:setSession:ok");

          // clean URL so refresh doesn't re-run weirdly
          window.history.replaceState(null, "", window.location.pathname);
        } else {
          debug.steps.push("hash:notApplicable");
        }

        // 2) Try CODE param flow (PKCE), if present
        const q = readSearchParams();
        debug.saw.search = q;

        if (q.code) {
          debug.steps.push("code:exchange:start");
          // @ts-ignore - exists in supabase-js v2
          const { error: exErr } = await supabase.auth.exchangeCodeForSession(q.code);
          if (exErr) {
            debug.steps.push("code:exchange:error");
            throw exErr;
          }
          debug.steps.push("code:exchange:ok");

          window.history.replaceState(null, "", window.location.pathname);
        } else {
          debug.steps.push("code:notPresent");
        }

        // 3) Confirm session
        debug.steps.push("getSession:start");
        const { data } = await supabase.auth.getSession();
        debug.session = data?.session ? { exists: true } : { exists: false };
        setReady(!!data?.session);

        // 4) Live updates
        const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
          setReady(!!session);
        });
        unsub = () => sub.subscription.unsubscribe();
      } catch (e: any) {
        setReady(false);
        setError(e?.message || "Could not start password recovery session.");
        debug.error = e?.message || String(e);
      } finally {
        setDbg(debug);
        setProcessing(false);
      }
    })();

    return () => {
      unsub?.();
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
        <p className="mt-1 text-sm text-slate-500">Choose a new password for your account.</p>

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