"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function Home() {
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) router.replace("/dashboard");
      else router.replace("/login");
    })();
  }, [router, supabase]);

  return (
    <main style={{ maxWidth: 720, margin: "64px auto", padding: 16 }}>
      <p>Loading…</p>
    </main>
  );
}