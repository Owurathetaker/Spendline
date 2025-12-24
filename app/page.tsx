export default function Home() {
  return (
    <main style={{ padding: 40 }}>
      <h1>Spendline</h1>
      <p>Supabase env check:</p>
      <ul>
        <li>URL: {process.env.NEXT_PUBLIC_SUPABASE_URL ? "OK" : "MISSING"}</li>
        <li>ANON KEY: {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "OK" : "MISSING"}</li>
      </ul>
    </main>
  );
}