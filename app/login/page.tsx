"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    router.push("/dashboard");
  }

  return (
    <main style={{ maxWidth: 420, margin: "64px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Log in</h1>
      <p style={{ opacity: 0.7, marginTop: 6 }}>Welcome back to Spendline.</p>

      <form
        onSubmit={onSubmit}
        style={{ marginTop: 18, display: "grid", gap: 10 }}
      >
        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
          style={{ padding: 12, borderRadius: 10, border: "1px solid #ddd" }}
          autoComplete="email"
        />

        <input
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          required
          style={{ padding: 12, borderRadius: 10, border: "1px solid #ddd" }}
          autoComplete="current-password"
        />

        {/* Forgot password link */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Link
            href="/reset-password"
            style={{
              fontSize: 13,
              textDecoration: "underline",
              opacity: 0.85,
            }}
          >
            Forgot password?
          </Link>
        </div>

        <button
          disabled={loading}
          type="submit"
          style={{
            padding: 12,
            borderRadius: 10,
            border: "none",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          {loading ? "Logging in..." : "Log in"}
        </button>

        {msg && <p style={{ color: "crimson", marginTop: 6 }}>{msg}</p>}
      </form>

      <p style={{ marginTop: 14, opacity: 0.8 }}>
        Don’t have an account? <Link href="/signup">Sign up</Link>
      </p>
    </main>
  );
}