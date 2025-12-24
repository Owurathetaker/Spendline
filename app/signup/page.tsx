export default function SignupPage() {
  return (
    <main style={{ maxWidth: 420, margin: "60px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>
        Sign up
      </h1>

      <p style={{ opacity: 0.7, marginBottom: 24 }}>
        Create your Spendline account.
      </p>

      <form style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input
          type="text"
          placeholder="Full name"
          style={{ padding: 12, borderRadius: 10, border: "1px solid #ddd" }}
        />
        <input
          type="email"
          placeholder="Email"
          style={{ padding: 12, borderRadius: 10, border: "1px solid #ddd" }}
        />
        <input
          type="password"
          placeholder="Password"
          style={{ padding: 12, borderRadius: 10, border: "1px solid #ddd" }}
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
          Create account
        </button>
      </form>
    </main>
  );
}