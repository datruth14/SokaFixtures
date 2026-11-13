"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { setToken(new URLSearchParams(window.location.search).get("token") ?? ""); }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      setMessage(result.error ? "This reset link is invalid or expired." : "Password updated. You can now sign in.");
    } catch { setMessage("Unable to reset your password. Please try again."); }
    finally { setBusy(false); }
  }
  return <main className="flex min-h-screen items-center justify-center px-4"><div className="glass-card w-full max-w-md p-8"><p className="eyebrow">SokaFix</p><h1 className="mt-4 text-2xl font-semibold text-white">Choose a new password</h1><form onSubmit={submit} className="mt-6 space-y-4"><label className="block text-xs text-slate-400">New password<input className="glass-input mt-1.5" type="password" minLength={10} maxLength={128} required autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>{message && <p role="status" className="text-sm text-slate-200">{message}</p>}<button className="btn-solid w-full" disabled={busy || !token}>Update password</button><Link href="/account" className="block text-center text-xs text-slate-400">Back to sign in</Link></form></div></main>;
}
