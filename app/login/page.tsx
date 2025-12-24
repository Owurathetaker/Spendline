export default function LoginPage() {
  return (
    <main style={{ maxWidth: 420, margin: "60px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>
        Log in
      </h1>

      <p style={{ opacity: 0.7, marginBottom: 24 }}>
        Welcome back to Spendline.
      </p>

      <form style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input
          type="email"
          placeholder="Email"
          style={{
            padding: 12,
            borderRadius: 10,
            border: "1px solid #ddd",
          }}
        />
        <input
          type="password"
          placeholder="Password"
          style={{
            padding: 12,
            borderRadius: 10,
            border: "1px solid #ddd",
          }}
        />

        <button
          type="submit"
          style={{
            padding: 12,
            borderRadius: 10,
            background: "black",
            color: "white",
            fontWeight: 700,
            border: "none",
            cursor: "pointer",
          }}
        >
          Log in
        </button>
      </form>
    </main>
  );
}