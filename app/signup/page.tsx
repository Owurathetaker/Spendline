"use client";
 
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
 
export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
 
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
 
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
 
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { name: name.trim() },
      },
    });
 
    setLoading(false);
 
    if (error) {
      setMsg(error.message);
      return;
    }
 
    setMsg("Account created. Check your email to confirm (if required), then log in.");
    setTimeout(() => router.push("/login"), 1200);
  }
 
  return (
    <main style={{ maxWidth: 420, margin: "64px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Sign up</h1>
      <p style={{ opacity: 0.7, marginTop: 6 }}>Create your Spendline account.</p>
 
      <form
        onSubmit={onSubmit}
        style={{ marginTop: 18, display: "grid", gap: 10 }}
      >
        <input
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          style={{ padding: 12, borderRadius: 10, border: "1px solid #ddd" }}
          autoComplete="name"
        />
 
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
          placeholder="Password (min 6 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          required
          minLength={6}
          style={{ padding: 12, borderRadius: 10, border: "1px solid #ddd" }}
          autoComplete="new-password"
        />
 
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
          {loading ? "Creating..." : "Create account"}
        </button>
 
        {msg && (
          <p
            style={{
              color: msg.startsWith("Account created") ? "green" : "crimson",
              marginTop: 6,
            }}
          >
            {msg}
          </p>
        )}
      </form>
 
      <p style={{ marginTop: 14, opacity: 0.8 }}>
        Already have an account? <Link href="/login">Log in</Link>
      </p>
 
      {/* Support + Privacy (NOT inside a <p>) */}
      <div style={{ marginTop: 18, textAlign: "center", fontSize: 12, opacity: 0.7 }}>
        <Link href="/support" style={{ textDecoration: "underline" }}>
          Support
        </Link>
        {" • "}
        <Link href="/privacy" style={{ textDecoration: "underline" }}>
          Privacy
        </Link>
      </div>
    </main>
  );
}