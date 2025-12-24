export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 8 }}>
        Spendline
      </h1>
      <p style={{ opacity: 0.8, marginBottom: 24 }}>
        Quiet wealth in motion.
      </p>

      <div style={{ display: "flex", gap: 12 }}>
        <a
          href="/login"
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            background: "black",
            color: "white",
            textDecoration: "none",
            fontWeight: 700,
          }}
        >
          Log in
        </a>
        <a
          href="/signup"
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #ddd",
            textDecoration: "none",
            fontWeight: 700,
          }}
        >
          Sign up
        </a>
      </div>
    </main>
  );
}