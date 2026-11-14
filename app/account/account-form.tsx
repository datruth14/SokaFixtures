"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

type Mode = "sign-in" | "sign-up" | "forgot";

export default function AccountForm({ initialMode }: { initialMode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      if (mode === "forgot") {
        const result = await authClient.requestPasswordReset({ email, redirectTo: `${window.location.origin}/reset-password` });
        setMessage(result.error ? "Unable to send the reset link. Please try again." : "If an account exists, a reset link has been sent.");
      } else if (mode === "sign-up") {
        const result = await authClient.signUp.email({ name, email, password });
        if (result.error) setMessage(result.error.message ?? "Unable to create the account.");
        else { router.push("/billing"); router.refresh(); }
      } else {
        const result = await authClient.signIn.email({ email, password });
        if (result.error) setMessage("Unable to sign in. Check your email and password.");
        else { router.push("/billing"); router.refresh(); }
      }
    } catch {
      setMessage("Account service is unavailable. Please try again later.");
    } finally { setBusy(false); }
  }

  function changeMode(next: Mode) { setMode(next); setMessage(""); }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="glass-card w-full max-w-md p-6 sm:p-8">
        <Link href="/" className="eyebrow">SokaFix</Link>
        <h1 className="mt-4 text-2xl font-semibold text-white">{mode === "sign-up" ? "Create your account" : mode === "forgot" ? "Reset your password" : "Welcome back"}</h1>
        <p className="mt-2 text-sm text-slate-400">Use your email and password to manage your subscription.</p>
        {isPending ? <p className="mt-6 text-sm text-slate-400">Checking your account…</p> : session?.user ? (
          <div className="mt-6 space-y-4 text-sm text-slate-300">
            <p>Signed in as {session.user.email}</p>
            <Link href="/billing" className="btn-solid">Open subscription</Link>
            <button className="btn-ghost ml-2" onClick={() => void authClient.signOut().then(() => router.refresh())}>Sign out</button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "sign-up" && <label className="block text-xs font-semibold text-slate-400">Name<input className="glass-input mt-1.5" autoComplete="name" required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></label>}
            <label className="block text-xs font-semibold text-slate-400">Email<input className="glass-input mt-1.5" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            {mode !== "forgot" && <label className="block text-xs font-semibold text-slate-400">Password<input className="glass-input mt-1.5" type="password" autoComplete={mode === "sign-up" ? "new-password" : "current-password"} required minLength={10} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} /></label>}
            {message && <p role="status" className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">{message}</p>}
            <button className="btn-solid w-full" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "sign-up" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}</button>
            <div className="flex flex-wrap justify-between gap-3 text-xs text-slate-400">
              <button type="button" onClick={() => changeMode(mode === "sign-up" ? "sign-in" : "sign-up")} className="hover:text-white">{mode === "sign-up" ? "Already have an account? Sign in" : "Create an account"}</button>
              {mode !== "forgot" && <button type="button" onClick={() => changeMode("forgot")} className="hover:text-white">Forgot password?</button>}
              {mode === "forgot" && <button type="button" onClick={() => changeMode("sign-in")} className="hover:text-white">Back to sign in</button>}
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
