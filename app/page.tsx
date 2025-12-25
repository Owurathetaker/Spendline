import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ maxWidth: 720, margin: "64px auto", padding: 16 }}>
      <h1 style={{ fontSize: 32, fontWeight: 900 }}>Spendline</h1>
      <p style={{ opacity: 0.75, marginTop: 8 }}>
        Quiet wealth in motion.
      </p>

      <div style={{ marginTop: 18, display: "flex", gap: 10 }}>
        <Link href="/login">Log in</Link>
        <span>•</span>
        <Link href="/signup">Sign up</Link>
        <span>•</span>
        <Link href="/dashboard">Go to dashboard</Link>
      </div>
    </main>
  );
}