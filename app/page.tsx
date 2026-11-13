import Link from "next/link";
import { Activity, ArrowRight, ArrowUpRight, CalendarDays, Check, Dices, Filter, ShieldCheck, Sparkles, Trophy } from "lucide-react";

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-x-clip">
      <div aria-hidden className="pointer-events-none absolute right-[-10rem] top-[-10rem] h-[36rem] w-[36rem] rounded-full bg-cyan-400/10 blur-[130px]" />
      <header className="relative z-10 border-b border-white/[0.07] bg-[#09111e]/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="SokaFix home">
            <span className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-cyan-100/20 bg-gradient-to-br from-cyan-200/25 to-sky-600/10 text-cyan-200"><Trophy size={19} /></span>
            <span><span className="block text-base font-bold tracking-[-0.04em] text-white">SokaFix<span className="text-cyan-200">.</span></span><span className="block text-[10px] font-medium tracking-wide text-slate-500">FOOTBALL WORKSPACE</span></span>
          </Link>
          <nav aria-label="Account navigation" className="ml-auto flex items-center gap-2 sm:gap-3">
            <a href="#pricing" className="hidden px-3 py-2 text-sm text-slate-400 hover:text-white sm:inline-flex">Pricing</a>
            <Link href="/account" className="btn-ghost text-xs sm:text-sm">Sign in</Link>
            <Link href="/account?mode=register" className="btn-solid text-xs sm:text-sm">Create account <ArrowUpRight size={14} /></Link>
          </nav>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-10">
        <section className="grid gap-4 lg:grid-cols-12" aria-labelledby="landing-title">
          <div className="glass-card-accent relative overflow-hidden p-6 sm:p-10 lg:col-span-7 lg:p-12">
            <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border border-cyan-100/10 bg-cyan-300/[0.035]" />
            <div className="relative">
              <p className="eyebrow"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Your football workspace</p>
              <h1 id="landing-title" className="mt-6 max-w-2xl text-4xl font-semibold leading-[1.07] tracking-[-0.05em] text-white sm:text-5xl xl:text-6xl">Your next matchday, <span className="text-cyan-200">all in one place.</span></h1>
              <p className="mt-5 max-w-lg text-sm leading-7 text-slate-300 sm:text-base">Explore football fixtures, filter predictions, and bring your selections together in a simple accumulator builder.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/account?mode=register" className="btn-solid px-5 py-3">Create an account <ArrowRight size={16} /></Link>
                <Link href="/account" className="btn-ghost px-5 py-3">I already have an account</Link>
              </div>
              <p className="mt-5 max-w-lg text-xs leading-5 text-slate-400">7-day trial available. ₦50 card verification is charged and a refund is requested. Then ₦5,000/month unless cancelled.</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-5">
            <div className="glass-card flex min-h-[160px] flex-col justify-between p-6 sm:col-span-2">
              <div className="flex items-center justify-between"><span className="eyebrow">A clearer matchday</span><Sparkles size={18} className="text-cyan-200/70" /></div>
              <div><p className="text-2xl font-semibold tracking-tight text-white">Fixtures. Filters. Your slip.</p><p className="mt-2 text-sm leading-6 text-slate-400">Everything you need to explore the day&apos;s football in one workspace.</p></div>
            </div>
            <div className="glass-card flex min-h-[150px] flex-col justify-between p-6"><CalendarDays size={20} className="text-cyan-200/80" /><div><p className="font-semibold text-white">Fixture board</p><p className="mt-1 text-xs leading-5 text-slate-400">Explore matches and predictions.</p></div></div>
            <div className="glass-card flex min-h-[150px] flex-col justify-between p-6"><Dices size={20} className="text-violet-300/80" /><div><p className="font-semibold text-white">Accumulator builder</p><p className="mt-1 text-xs leading-5 text-slate-400">Bring your predicted picks together.</p></div></div>
          </div>
        </section>

        <section className="mt-4 grid gap-4 md:grid-cols-3" aria-label="What you can do">
          <Feature icon={<CalendarDays size={18} />} title="Explore fixtures" text="Browse matches by league and see the predictions available for each one." />
          <Feature icon={<Filter size={18} />} title="Find your matches" text="Filter by result, confidence, goals, or describe what you’re looking for." />
          <Feature icon={<Activity size={18} />} title="Build your slip" text="Generate combinations and review the selections, odds, and match details." />
        </section>

        <section id="pricing" className="glass-card mt-4 flex scroll-mt-6 flex-wrap items-center justify-between gap-6 p-6 sm:p-8" aria-labelledby="pricing-title">
          <div className="max-w-2xl">
            <p className="eyebrow"><ShieldCheck size={13} /> Simple membership</p>
            <h2 id="pricing-title" className="mt-3 text-2xl font-semibold tracking-tight text-white">Start with seven days.</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Enjoy full access during your trial. A ₦50 card verification charge is made and a full refund is requested. After seven days, Premium renews at ₦5,000 per month unless you cancel.</p>
            <p className="mt-3 flex items-center gap-2 text-xs text-slate-400"><Check size={14} className="text-cyan-200" /> Manage or cancel your subscription from your account.</p>
          </div>
          <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Premium</p><p className="mt-1 text-3xl font-semibold tracking-tight text-white">₦5,000 <span className="text-sm font-normal text-slate-400">/ month</span></p><Link href="/account?mode=register" className="btn-solid mt-4">Get started <ArrowRight size={15} /></Link></div>
        </section>
      </main>
      <footer className="relative z-10 mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] px-4 py-6 text-xs text-slate-500 sm:px-6 lg:px-8"><p>© {new Date().getFullYear()} SokaFix. Football, made easier to explore.</p><p>18+ · Predictions are informational, not guarantees.</p></footer>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="glass-card p-6"><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-200/15 bg-cyan-200/10 text-cyan-200">{icon}</span><h2 className="mt-5 text-base font-semibold text-white">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-400">{text}</p></div>;
}
