"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function AccountPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link href="/" className="text-lg font-bold text-white">SokaFix<span className="text-cyan-200">.</span></Link>
        {session?.user && <button className="btn-ghost text-xs" onClick={() => void authClient.signOut().then(() => router.refresh())}>Sign out</button>}
      </div>
      <div className="glass-card-accent p-6 sm:p-8">
        <p className="eyebrow">Your account</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Free access</h1>
        <p className="mt-2 text-sm leading-6 text-slate-300">SokaFix is free to use right now. Sign in and start exploring fixtures, prediction filters and the accumulator — no payment or subscription required.</p>
      </div>
      {isPending ? <p className="mt-6 text-sm text-slate-400">Checking your account…</p> : !session?.user ? (
        <div className="glass-card mt-4 p-6">
          <p className="text-sm text-slate-300">Sign in or create an account to continue.</p>
          <Link href="/account" className="btn-solid mt-4">Sign in or create account</Link>
        </div>
      ) : (
        <div className="glass-card mt-4 p-6 sm:p-8">
          <p className="text-xs text-slate-400">Signed in as {session.user.email}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/fixtures" className="btn-solid">Open fixtures</Link>
            <Link href="/accumulator" className="btn-ghost">Accumulator</Link>
          </div>
        </div>
      )}
    </main>
  );
}
