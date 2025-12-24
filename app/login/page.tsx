"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  const login = async () => {
    setMsg("Signing in...");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setMsg(error ? error.message : "Logged in ✅");
  };

  return (
    <main style={{ maxWidth: 420, margin: "80px auto" }}>
      <h2>Login</h2>
      <input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
      <input placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
      <button onClick={login}>Login</button>
      <p>{msg}</p>
    </main>
  );
}