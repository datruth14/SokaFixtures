"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PAYMENTS_ENABLED } from "@/lib/features";

export default function BillingCallback() {
  const [message, setMessage] = useState("Verifying your Paystack payment…");
  useEffect(() => {
    if (!PAYMENTS_ENABLED) return;
    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference") ?? params.get("trxref");
    if (!reference) { setMessage("Payment reference was missing. Open your account page to check its status."); return; }
    let cancelled = false;
    fetch("/api/billing/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference }) })
      .then(async (response) => {
        const data = await response.json() as { hasAccess?: boolean; error?: string };
        if (!cancelled) setMessage(!response.ok ? data.error ?? "Payment could not be verified." : data.hasAccess ? "Your access is active." : "Payment verified. Your subscription is being activated; check your billing status shortly.");
      })
      .catch(() => { if (!cancelled) setMessage("Payment verification is unavailable. Check your subscription status later."); });
    return () => { cancelled = true; };
  }, []);
  if (!PAYMENTS_ENABLED) {
    return <main className="flex min-h-screen items-center justify-center px-4"><div className="glass-card w-full max-w-md p-8 text-center"><p className="eyebrow">SokaFix</p><h1 className="mt-4 text-xl font-semibold text-white">Payments are disabled</h1><p role="status" className="mt-4 text-sm leading-6 text-slate-300">SokaFix is free to use right now. No payment is needed.</p><Link href="/billing" className="btn-solid mt-6">Open account</Link></div></main>;
  }
  return <main className="flex min-h-screen items-center justify-center px-4"><div className="glass-card w-full max-w-md p-8 text-center"><p className="eyebrow">SokaFix Premium</p><h1 className="mt-4 text-xl font-semibold text-white">Payment status</h1><p role="status" className="mt-4 text-sm leading-6 text-slate-300">{message}</p><Link href="/billing" className="btn-solid mt-6">Open subscription</Link></div></main>;
}
