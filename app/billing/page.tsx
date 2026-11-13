"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

interface Status {
  state: string; hasAccess: boolean; trialEndsAt: number | null; paidThrough: number | null;
  trialUsed: boolean; refundState: string | null; canManage: boolean; canResume: boolean;
}

export default function BillingPage() {
  const { data: session, isPending } = authClient.useSession();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState<"trial" | "paid">("trial");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/billing/status", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data = await response.json() as Status;
      setStatus(data);
      if (data.trialUsed) setKind("paid");
    } catch { setMessage("Unable to load your subscription. Please try again."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (!isPending && session?.user) void load(); }, [isPending, session?.user?.id, load]);

  async function checkout() {
    if (!consent || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, consent: true }) });
      const data = await response.json() as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error ?? "Unable to start checkout.");
      window.location.assign(data.url);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to start checkout."); setBusy(false); }
  }

  async function manage() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/billing/manage", { method: "POST" });
      const data = await response.json() as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error ?? "Unable to open subscription management.");
      window.location.assign(data.url);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to manage subscription."); setBusy(false); }
  }

  async function resume() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/billing/resume", { method: "POST" });
      const data = await response.json() as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error ?? "Unable to resume checkout.");
      window.location.assign(data.url);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to resume checkout."); setBusy(false); }
  }

  const canStart = status && ["new", "cancelled"].includes(status.state) && !status.hasAccess && (!status.canManage || status.state === "cancelled");
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-3"><Link href="/" className="text-lg font-bold text-white">SokaFix<span className="text-cyan-200">.</span></Link>{session?.user && <button className="btn-ghost text-xs" onClick={() => void authClient.signOut().then(() => { window.location.href = "/account"; })}>Sign out</button>}</div>
      <div className="glass-card-accent p-6 sm:p-8">
        <p className="eyebrow">SokaFix Premium</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Your subscription</h1>
        <p className="mt-2 text-sm text-slate-300">Full access to fixtures, prediction filters and the accumulator.</p>
      </div>
      {isPending ? <p className="mt-6 text-sm text-slate-400">Checking your account…</p> : !session?.user ? (
        <div className="glass-card mt-4 p-6"><p className="text-sm text-slate-300">Sign in or create an account to activate Premium.</p><Link href="/account" className="btn-solid mt-4">Sign in or create account</Link></div>
      ) : (
        <div className="glass-card mt-4 p-6 sm:p-8">
          <p className="text-xs text-slate-400">Signed in as {session.user.email}</p>
          {loading ? <p className="mt-4 text-sm text-slate-400">Loading subscription…</p> : status && (
            <>
              <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-400">Status</p>
                <p className="mt-2 text-lg font-semibold capitalize text-white">{status.state.replaceAll("_", " ")}</p>
                {status.trialEndsAt && <p className="mt-1 text-xs text-slate-400">Trial ends: {new Date(status.trialEndsAt).toLocaleString()}</p>}
                {status.paidThrough && <p className="mt-1 text-xs text-slate-400">Paid access through: {new Date(status.paidThrough).toLocaleString()}</p>}
                {status.refundState === "requested" && <p className="mt-1 text-xs text-slate-400">₦50 verification refund requested; your bank may take time to process it.</p>}
                {status.refundState === "processed" && <p className="mt-1 text-xs text-slate-400">₦50 verification refund processed; your bank may take time to return it.</p>}
                {status.refundState === "needs_attention" && <p className="mt-1 text-xs text-amber-200">The ₦50 refund needs attention. Please contact support.</p>}
              </div>
              {status.hasAccess && <Link href="/fixtures" className="btn-solid mt-4">Open SokaFix</Link>}
              {status.canManage && <button onClick={() => void manage()} disabled={busy} className="btn-ghost mt-4 ml-2">Manage or cancel subscription</button>}
              {["initializing", "pending", "paid_pending"].includes(status.state) && <p className="mt-4 text-sm text-slate-300">Your checkout is being processed. Refresh this page after returning from Paystack.</p>}
              {status.canResume && <button onClick={() => void resume()} disabled={busy} className="btn-ghost mt-4">Resume checkout</button>}
              {status.state === "needs_review" && <p className="mt-4 text-sm text-amber-200">Your payment needs manual review. Please contact support before trying again.</p>}
              {status.state === "past_due" && <p className="mt-4 text-sm text-amber-200">Your last payment could not be confirmed. Use subscription management to update your payment method.</p>}
              {canStart && (
                <div className="mt-6 space-y-4">
                  <h2 className="text-lg font-semibold text-white">Choose how to start</h2>
                  {!status.trialUsed && <button type="button" onClick={() => { setKind("trial"); setConsent(false); }} aria-pressed={kind === "trial"} className={`w-full rounded-xl border p-4 text-left ${kind === "trial" ? "border-cyan-300/50 bg-cyan-400/10" : "border-white/10 bg-white/5"}`}><span className="block font-semibold text-white">7-day trial</span><span className="mt-1 block text-xs leading-5 text-slate-400">₦50 card verification charge, followed by a full refund request. Then ₦5,000/month after 7 days unless cancelled.</span></button>}
                  <button type="button" onClick={() => { setKind("paid"); setConsent(false); }} aria-pressed={kind === "paid"} className={`w-full rounded-xl border p-4 text-left ${kind === "paid" ? "border-cyan-300/50 bg-cyan-400/10" : "border-white/10 bg-white/5"}`}><span className="block font-semibold text-white">Start Premium now</span><span className="mt-1 block text-xs leading-5 text-slate-400">₦5,000 charged immediately, then ₦5,000/month until cancelled.</span></button>
                  <label className="flex items-start gap-3 text-sm leading-6 text-slate-300"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1.5" /> <span>{kind === "trial" ? "I agree to a ₦50 card-verification charge and refund request, then ₦5,000 monthly starting after seven days unless I cancel." : "I agree to be charged ₦5,000 now and every month until I cancel."} I can manage or cancel my subscription from this page.</span></label>
                  <button onClick={() => void checkout()} disabled={!consent || busy} className="btn-solid w-full">{busy ? "Opening Paystack…" : kind === "trial" ? "Continue to Paystack for trial" : "Continue to Paystack"}</button>
                  <p className="text-xs leading-5 text-slate-500">Card details are entered on Paystack, not stored by SokaFix. Refund timing depends on your bank.</p>
                </div>
              )}
              <button className="mt-4 text-xs text-slate-400 underline" onClick={() => void load()}>Refresh status</button>
            </>
          )}
          {message && <p role="status" className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-200">{message}</p>}
        </div>
      )}
    </main>
  );
}
