"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/login");
        return;
      }
      setEmail(data.user.email ?? "");
    })();
  }, [router, supabase]);

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <main style={{ maxWidth: 720, margin: "64px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 900 }}>Dashboard</h1>
      <p style={{ opacity: 0.7, marginTop: 6 }}>Signed in as {email || "…"}</p>

      <div style={{ marginTop: 18 }}>
        <button
          onClick={logout}
          style={{ padding: 12, borderRadius: 10, fontWeight: 800, cursor: "pointer" }}
        >
          Log out
        </button>
      </div>
    </main>
  );
}