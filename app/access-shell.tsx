"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { DashboardProvider } from "./dashboard";

export function AccessShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const protectedPage = pathname === "/fixtures" || pathname === "/accumulator";
  const { data: session, isPending, error } = authClient.useSession();
  const [access, setAccess] = useState<"loading" | "allowed" | "denied" | "error">("loading");
  const checkedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!protectedPage || isPending) return;
    if (!session?.user) { checkedUserId.current = null; setAccess("denied"); return; }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (checkedUserId.current !== session.user.id) {
      checkedUserId.current = session.user.id;
      setAccess("loading");
    }
    const checkAccess = () => fetch("/api/billing/status", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Account status unavailable");
        const data = await response.json() as { hasAccess?: boolean; accessUntil?: number | null };
        if (cancelled) return;
        setAccess(data.hasAccess ? "allowed" : "denied");
        if (timer) clearTimeout(timer);
        if (data.hasAccess && typeof data.accessUntil === "number") {
          timer = setTimeout(checkAccess, Math.max(1000, Math.min(data.accessUntil - Date.now() + 1000, 60_000)));
        }
      })
      .catch(() => { if (!cancelled) setAccess("error"); });
    void checkAccess();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [protectedPage, isPending, session?.user?.id, pathname]);

  if (!protectedPage) return children;
  if (isPending || (session?.user && access === "loading")) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Checking your account…</div>;
  if (error || access === "error") return <AccountGate title="Account service unavailable" text="Please try again later." href="/billing" action="Open billing" />;
  if (!session?.user) return <AccountGate title="Welcome to SokaFix" text="Sign in or create an account to start your seven-day trial." href="/account" action="Sign in or create account" />;
  if (access !== "allowed") return <AccountGate title="Activate SokaFix Premium" text="Start your trial or manage your subscription to access fixtures and the accumulator." href="/billing" action="View subscription" />;
  return <DashboardProvider>{children}</DashboardProvider>;
}

function AccountGate({ title, text, href, action }: { title: string; text: string; href: string; action: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="glass-card-accent w-full max-w-md p-8 text-center">
        <p className="eyebrow">SokaFix Premium</p>
        <h1 className="mt-4 text-2xl font-semibold text-white">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">{text}</p>
        <Link className="btn-solid mt-6" href={href}>{action}</Link>
      </div>
    </main>
  );
}
