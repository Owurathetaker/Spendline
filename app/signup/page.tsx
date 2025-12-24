"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  const signup = async () => {
    setMsg("Creating account...");
    const { error } = await supabase.auth.signUp({ email, password });
    setMsg(error ? error.message : "Check email to confirm ✅");
  };

  return (
    <main style={{ maxWidth: 420, margin: "80px auto" }}>
      <h2>Sign up</h2>
      <input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
      <input placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
      <button onClick={signup}>Create account</button>
      <p>{msg}</p>
    </main>
  );
}