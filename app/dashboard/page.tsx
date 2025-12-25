"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const userEmail = data.user?.email ?? null;

      if (!userEmail) {
        router.replace("/login");
        return;
      }

      setEmail(userEmail);
    })();
  }, [router, supabase]);

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <main style={{ maxWidth: 720, margin: "64px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Dashboard</h1>
      <p style={{ opacity: 0.75, marginTop: 8 }}>
        Logged in as: <b>{email ?? "..."}</b>
      </p>

      <div style={{ marginTop: 18, display: "flex", gap: 10 }}>
        <button
          onClick={logout}
          style={{
            padding: 12,
            borderRadius: 10,
            border: "1px solid #ddd",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Log out
        </button>
      </div>
    </main>
  );
}