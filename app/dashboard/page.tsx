import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getUser();

  // If not authenticated, force user to login
  if (error || !data?.user) {
    redirect("/login");
  }

  return (
    <main style={{ maxWidth: 760, margin: "64px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Dashboard</h1>
      <p style={{ opacity: 0.7, marginTop: 8 }}>
        Logged in as <b>{data.user.email}</b>
      </p>

      <div style={{ marginTop: 18 }}>
        <p>✅ Auth is stable. Next we’ll start building Spendline features.</p>
      </div>
    </main>
  );
}