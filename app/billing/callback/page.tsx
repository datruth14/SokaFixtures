"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function BillingCallback() {
  const [message, setMessage] = useState("Verifying your Paystack payment…");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference") ?? params.get("trxref");
    if (!reference) { setMessage("Payment reference was missing. Open your subscription page to check its status."); return; }
    let cancelled = false;
    fetch("/api/billing/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference }) })
      .then(async (response) => {
        const data = await response.json() as { hasAccess?: boolean; error?: string };
        if (!cancelled) setMessage(!response.ok ? data.error ?? "Payment could not be verified." : data.hasAccess ? "Your access is active." : "Payment verified. Your subscription is being activated; check your billing status shortly.");
      })
      .catch(() => { if (!cancelled) setMessage("Payment verification is unavailable. Check your subscription status later."); });
    return () => { cancelled = true; };
  }, []);
  return <main className="flex min-h-screen items-center justify-center px-4"><div className="glass-card w-full max-w-md p-8 text-center"><p className="eyebrow">SokaFix Premium</p><h1 className="mt-4 text-xl font-semibold text-white">Payment status</h1><p role="status" className="mt-4 text-sm leading-6 text-slate-300">{message}</p><Link href="/billing" className="btn-solid mt-6">Open subscription</Link></div></main>;
}
