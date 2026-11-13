"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  CircleCheck,
  Dices,
  Info,
  Layers3,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash,
  TriangleAlert,
  Trophy,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";

import type { Fixture, FixturesResponse, Outcome } from "@/lib/types";
import {
  computePayout,
  generateSlips,
  totalAccaOdds,
  type Acca,
  type AccaLeg,
} from "@/lib/accumulator";
import { outcomeLabel, predictionSymbol, priceFor } from "@/lib/odds";
import {
  EMPTY_FIXTURE_FILTERS,
  availableFixtureLeagues,
  fixtureLeagueKey,
  matchesFixtureFilters,
  type FixtureFilters,
} from "@/lib/fixtureFilters";
import {
  describeFilter,
  matchesFilter,
  type PromptFilter,
} from "@/lib/promptParser";

const OUTCOMES: Outcome[] = ["home", "draw", "away"];

function legKey(leg: AccaLeg): string {
  return `${leg.fixture.id}:${leg.outcome}`;
}

function outcomeDotClass(outcome: Outcome): string {
  switch (outcome) {
    case "home":
      return "text-sky-400";
    case "draw":
      return "text-slate-400";
    case "away":
      return "text-purple-400";
  }
}

function outcomeChipClass(outcome: Outcome): string {
  switch (outcome) {
    case "home":
      return "border-sky-500/40 bg-sky-500/15 text-sky-300";
    case "draw":
      return "border-zinc-500/40 bg-zinc-500/15 text-zinc-300";
    case "away":
      return "border-purple-500/40 bg-purple-500/15 text-purple-300";
  }
}

function switchLeg(prev: AccaLeg[], leg: AccaLeg): AccaLeg[] {
  const without = prev.filter((l) => l.fixture.id !== leg.fixture.id);
  const exists = prev.some(
    (l) => l.fixture.id === leg.fixture.id && l.outcome === leg.outcome,
  );
  return exists ? without : [...without, leg];
}

function useDashboardState() {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [meta, setMeta] = useState({
    source: "",
    fetchedAt: "",
    cached: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [prompt, setPrompt] = useState("");
  const [parsing, setParsing] = useState(false);
  const [filter, setFilter] = useState<PromptFilter | null>(null);
  const [filterActive, setFilterActive] = useState(true);
  const [fixtureFilters, setFixtureFilters] = useState<FixtureFilters>(EMPTY_FIXTURE_FILTERS);

  const [search, setSearch] = useState("");
  const [rowLimit, setRowLimit] = useState(40);

  const [selection, setSelection] = useState<AccaLeg[]>([]);
  const [slips, setSlips] = useState<Acca[]>([]);
  const [activeSlipId, setActiveSlipId] = useState<string | null>(null);
  const [stake, setStake] = useState("10");

  const loadFixtures = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/fixtures${refresh ? "?refresh=1" : ""}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as FixturesResponse;
      setFixtures(data.fixtures);
      setMeta({
        source: data.source,
        fetchedAt: data.fetchedAt,
        cached: data.cached,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFixtures(false);
  }, [loadFixtures]);

  const leagueLabels = useMemo(() => {
    const leagues = new Map<string, string>();
    for (const fixture of fixtures) {
      leagues.set(fixtureLeagueKey(fixture), [fixture.country, fixture.league].filter(Boolean).join(" · "));
    }
    return leagues;
  }, [fixtures]);

  const leagueOptions = useMemo(() => availableFixtureLeagues(
    fixtures,
    fixtureFilters,
    (fixture) => !filter || !filterActive || matchesFilter(fixture, filter),
  ), [fixtures, fixtureFilters, filter, filterActive]);

  const fixtureFilterDescription = useMemo(() => {
    const parts: string[] = [];
    if (fixtureFilters.league) {
      parts.push(leagueLabels.get(fixtureFilters.league) ?? "Selected league");
    }
    if (fixtureFilters.confidence !== null) parts.push(`${fixtureFilters.confidence}/10 confidence`);
    if (fixtureFilters.outcome !== "any") parts.push(`${outcomeLabel(fixtureFilters.outcome)} prediction`);
    if (fixtureFilters.goals !== "any") parts.push(`${fixtureFilters.goals === "O" ? "Over" : "Under"} 2.5 goals`);
    return parts;
  }, [fixtureFilters, leagueLabels]);

  const updateFixtureFilters = useCallback((next: FixtureFilters) => {
    setFixtureFilters(next);
    setRowLimit(40);
  }, []);

  const pool = useMemo(() => fixtures.filter((fixture) =>
    matchesFixtureFilters(fixture, fixtureFilters) &&
    (!filter || !filterActive || matchesFilter(fixture, filter)),
  ), [filter, filterActive, fixtureFilters, fixtures]);

  const searchPool = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter(
      (f) =>
        f.homeTeam.toLowerCase().includes(q) ||
        f.awayTeam.toLowerCase().includes(q) ||
        f.league.toLowerCase().includes(q) ||
        f.country.toLowerCase().includes(q),
    );
  }, [pool, search]);

  const visibleRows = useMemo(
    () => searchPool.slice(0, rowLimit),
    [searchPool, rowLimit],
  );

  const selectionOdds = useMemo(() => totalAccaOdds(selection), [selection]);
  const selectedIds = useMemo(
    () => new Set(selection.map((l) => legKey(l))),
    [selection],
  );

  const stakeValue = useMemo(() => {
    const n = Number(stake);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [stake]);

  const payout = useMemo(
    () => computePayout(stakeValue, selectionOdds),
    [stakeValue, selectionOdds],
  );

  const handleParse = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const text = prompt.trim();
      if (!text || parsing) return;
      setParsing(true);
      try {
        const res = await fetch("/api/parse-prompt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: text }),
        });
        const data = (await res.json()) as PromptFilter & { error?: string };
        if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
        setFilter(data);
        setFilterActive(true);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setParsing(false);
      }
    },
    [prompt, parsing],
  );

  const toggleLeg = useCallback((leg: AccaLeg) => {
    if (leg.outcome !== leg.fixture.prediction) return;
    setSelection((prev) => switchLeg(prev, leg));
    setActiveSlipId(null);
  }, []);

  const applySlip = useCallback((slip: Acca) => {
    setSelection(slip.legs);
    setActiveSlipId(slip.id);
  }, []);

  const handleCombine = useCallback((size: number) => {
    const generated = generateSlips(pool, size, 5);
    setSlips(generated);
    if (generated.length > 0) {
      setSelection(generated[0].legs);
      setActiveSlipId(generated[0].id);
    }
  }, [pool]);

  const handleAutoBuild = useCallback(() => {
    const target = filter?.count;
    if (!filterActive || !target || target > 6 || pool.length < target || filter.warnings.length > 0) return;
    handleCombine(target);
  }, [filter, filterActive, pool, handleCombine]);

  const clearSlip = useCallback(() => {
    setSelection([]);
    setSlips([]);
    setActiveSlipId(null);
  }, []);

  const totalMatches = useMemo(() => fixtures.length, [fixtures]);
  const parsedCount = filter?.count ?? null;

  return {
    fixtures, meta, loading, error, prompt, setPrompt, parsing, filter, setFilter,
    filterActive, setFilterActive, fixtureFilters, updateFixtureFilters, leagueOptions, leagueLabels,
    fixtureFilterDescription, search, setSearch, rowLimit, setRowLimit,
    selection, slips, activeSlipId, stake, setStake, loadFixtures, pool, searchPool,
    visibleRows, selectionOdds, selectedIds, payout, handleParse, toggleLeg,
    applySlip, handleCombine, handleAutoBuild, clearSlip, totalMatches, parsedCount,
  };
}

type DashboardState = ReturnType<typeof useDashboardState>;
const DashboardContext = createContext<DashboardState | null>(null);

function useDashboard(): DashboardState {
  const state = useContext(DashboardContext);
  if (!state) throw new Error("Dashboard pages must be inside DashboardProvider");
  return state;
}

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const state = useDashboardState();
  const pathname = usePathname();

  return (
    <DashboardContext.Provider value={state}>
    <div className="relative min-h-screen overflow-x-clip">
      <BackgroundFX />
      <Header
        loading={state.loading}
        meta={state.meta}
        totalMatches={state.totalMatches}
        onRefresh={() => void state.loadFixtures(true)}
        error={Boolean(state.error)}
        pathname={pathname}
        selectionCount={state.selection.length}
      />
      {children}
      {pathname === "/fixtures" && (
        <MobileAccaBar
          legs={state.selection.length}
          odds={state.selectionOdds}
          net={state.payout.net}
        />
      )}
    </div>
    </DashboardContext.Provider>
  );
}

export function FixturePage() {
  const {
    fixtures, loading, error, prompt, setPrompt, parsing, filter, setFilter,
    filterActive, setFilterActive, fixtureFilters, updateFixtureFilters, leagueOptions, leagueLabels,
    fixtureFilterDescription, search, setSearch, rowLimit, setRowLimit,
    loadFixtures, pool, searchPool, visibleRows, selectedIds, handleParse,
    toggleLeg, handleAutoBuild, parsedCount, selection,
  } = useDashboard();
  const router = useRouter();

  if (error && !fixtures.length) {
    return <ErrorScreen error={error} onRetry={() => void loadFixtures(true)} />;
  }

  return (
      <main className="relative z-10 w-full px-4 pb-32 pt-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4">
          <section className="grid gap-4 lg:grid-cols-12" aria-label="Fixture overview">
            <div className="glass-card-accent relative overflow-hidden p-6 sm:p-8 lg:col-span-7">
              <div className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full border border-cyan-100/10 bg-cyan-300/[0.04]" />
              <div className="pointer-events-none absolute right-8 top-8 h-32 w-32 rounded-full border border-cyan-100/10" />
              <div className="relative">
                <p className="eyebrow"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Your match centre</p>
                <h2 className="mt-5 max-w-xl text-3xl font-semibold leading-[1.08] tracking-[-0.04em] text-white sm:text-4xl">The beautiful game,<br /><span className="text-cyan-200">a little clearer.</span></h2>
                <p className="mt-4 max-w-md text-sm leading-6 text-slate-300/80">Explore fixtures, find predictions that fit, and build your next accumulator in one place.</p>
                <div className="mt-7 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                  <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5">Football fixtures</span>
                  <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5">Predictions &amp; odds</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 lg:col-span-5">
              <BentoStat icon={<CalendarDays size={17} />} label="Fixtures available" value={loading ? "—" : String(fixtures.length)} detail="From the current feed" />
              <BentoStat icon={<Layers3 size={17} />} label="Matching fixtures" value={loading ? "—" : String(pool.length)} detail="In your filtered pool" />
              <BentoStat icon={<Activity size={17} />} label="10/10 predictions" value={loading ? "—" : String(pool.filter((fixture) => fixture.predictionPoints === 10).length)} detail="In your filtered pool" />
              <Link href="/accumulator" className="glass-card group flex min-h-[132px] flex-col justify-between p-5 transition hover:border-cyan-200/30 hover:bg-white/10">
                <span className="flex items-center justify-between text-slate-400"><Dices size={17} /><ArrowUpRight size={16} className="transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></span>
                <span><span className="block text-2xl font-semibold tracking-tight text-white">{selection.length}</span><span className="mt-1 block text-xs text-slate-400">Selections in your slip</span></span>
              </Link>
            </div>
          </section>
          <PromptBar
            prompt={prompt}
            onPrompt={setPrompt}
            parsing={parsing}
            onSubmit={handleParse}
            filter={filter}
            filterActive={filterActive}
            onToggleFilter={() => setFilterActive((v) => !v)}
            onClearFilter={() => {
              setFilter(null);
              setPrompt("");
            }}
            description={filter ? describeFilter(filter) : ""}
            poolCount={pool.length}
            canAutoBuild={filterActive && filter !== null && parsedCount !== null && parsedCount <= 6 && pool.length >= parsedCount && filter.warnings.length === 0}
            onAutoBuild={() => {
              handleAutoBuild();
              router.push("/accumulator");
            }}
          />

          {error && !loading && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
              <TriangleAlert size={16} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">{error}</span>
              <button
                className="font-semibold text-amber-200 hover:text-amber-100"
                onClick={() => void loadFixtures(true)}
              >
                Retry
              </button>
            </div>
          )}

          <FixtureTable
            fixtures={visibleRows}
            loading={loading}
            total={searchPool.length}
            search={search}
            onSearch={setSearch}
            fixtureFilters={fixtureFilters}
            onFixtureFilters={updateFixtureFilters}
            leagueOptions={leagueOptions}
            selectedLeagueLabel={leagueLabels.get(fixtureFilters.league)}
            hasFixtureFilters={fixtureFilterDescription.length > 0}
            selectedIds={selectedIds}
            onToggleLeg={toggleLeg}
            showMore={
              searchPool.length > rowLimit
                ? () => setRowLimit((n) => n + 60)
                : null
            }
          />
        </div>

      </main>
  );
}

export function AccumulatorPage() {
  const {
    fixtures, loading, error, loadFixtures, filter, filterActive, fixtureFilters,
    updateFixtureFilters, fixtureFilterDescription, pool, selection,
    selectionOdds, stake, setStake, payout, handleCombine, clearSlip, slips,
    activeSlipId, applySlip, toggleLeg,
  } = useDashboard();

  return (
    <main className="relative z-10 w-full px-4 pb-16 pt-5 sm:px-6 lg:px-8">
      <section className="mb-4 grid gap-4 lg:grid-cols-12" aria-label="Accumulator overview">
        <div className="glass-card-accent relative overflow-hidden p-6 sm:p-8 lg:col-span-7">
          <div className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full border border-cyan-100/10 bg-cyan-300/[0.04]" />
          <div className="relative">
            <p className="eyebrow"><Dices size={13} /> Your accumulator workspace</p>
            <h2 className="mt-5 text-3xl font-semibold leading-[1.08] tracking-[-0.04em] text-white sm:text-4xl">Build a slip<br /><span className="text-cyan-200">that feels like yours.</span></h2>
            <p className="mt-4 max-w-md text-sm leading-6 text-slate-300/80">Combine predictions or add predicted results from the fixture board.</p>
            <Link href="/fixtures" className="btn-ghost mt-6"><Search size={15} /> Browse fixtures <ArrowUpRight size={14} /></Link>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:col-span-5">
          <BentoStat icon={<Layers3 size={17} />} label="Matching fixtures" value={loading ? "—" : String(pool.length)} detail="Available to combine" />
          <BentoStat icon={<Dices size={17} />} label="Your selections" value={String(selection.length)} detail="Matches in your slip" />
          <div className="glass-card col-span-2 flex items-center justify-between gap-4 p-5">
            <div><p className="text-xs font-medium text-slate-400">Combined odds</p><p className="mt-2 text-3xl font-semibold tracking-tight text-white">{selectionOdds > 0 ? selectionOdds.toFixed(2) : "—"}</p></div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-200/15 bg-cyan-200/10 text-cyan-200"><Zap size={19} /></div>
          </div>
        </div>
      </section>

      {error && !loading && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          <TriangleAlert size={16} className="shrink-0" />
          <span className="min-w-0 flex-1">{error}</span>
          <button className="font-semibold text-amber-200" onClick={() => void loadFixtures(true)}>Retry</button>
        </div>
      )}
      <div className="glass-card mb-4 flex flex-wrap items-end gap-4 p-5 sm:p-6">
        <label className="flex w-full max-w-xs flex-col gap-1.5 text-xs font-semibold text-slate-400">
          Confidence for generated slips
          <select
            value={fixtureFilters.confidence ?? ""}
            onChange={(event) => updateFixtureFilters({
              ...fixtureFilters,
              confidence: event.target.value ? Number(event.target.value) : null,
            })}
            className="glass-input py-2 text-sm [&>option]:bg-slate-900"
          >
            <option value="">Any confidence</option>
            {Array.from({ length: 10 }, (_, index) => 10 - index).map((confidence) => (
              <option key={confidence} value={confidence}>{confidence}/10 only</option>
            ))}
          </select>
        </label>
        <p className="pb-1 text-xs leading-relaxed text-slate-500">
          Choose 10/10, then select 3, 5 or 6 legs below. Other active filters still apply.
          Confidence is a prediction, not a guarantee.
        </p>
      </div>
      {((filter && filterActive) || fixtureFilterDescription.length > 0) && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-200">
          <Sparkles size={15} />
          <span>Fixture filters: {[filter && filterActive ? describeFilter(filter) : "", ...fixtureFilterDescription].filter(Boolean).join(" · ")} · {pool.length} matching. New combinations use this pool; existing slips stay unchanged.</span>
          <Link href="/fixtures" className="ml-auto font-semibold underline underline-offset-4">Edit filter</Link>
        </div>
      )}
      {filter && filterActive && filter.warnings.length > 0 && (
        <div role="status" className="mb-4 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-xs leading-5 text-amber-200">
          {filter.warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      )}
      {loading && fixtures.length === 0 && (
        <p className="mb-4 text-sm text-slate-400">Loading fixtures for the builder…</p>
      )}
      <SlipBuilder
        selection={selection}
        selectionOdds={selectionOdds}
        stake={stake}
        onStake={setStake}
        payout={payout}
        poolSize={pool.length}
        onCombine={handleCombine}
        onClear={clearSlip}
        slips={slips}
        activeSlipId={activeSlipId}
        onApplySlip={applySlip}
        onToggleLeg={toggleLeg}
      />
    </main>
  );
}

function BackgroundFX() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <div className="absolute -top-32 right-[-10%] h-[28rem] w-[28rem] rounded-full bg-cyan-400/10 blur-[120px] animate-blob" />
      <div className="absolute bottom-[-20%] left-[-10%] h-[30rem] w-[30rem] rounded-full bg-purple-500/10 blur-[130px] animate-blob-slow" />
    </div>
  );
}

function BentoStat({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="glass-card flex min-h-[132px] flex-col justify-between p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-400">{label}</span>
        <span className="text-cyan-200/70">{icon}</span>
      </div>
      <div><p className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>
    </div>
  );
}

function Header({
  loading,
  meta,
  totalMatches,
  onRefresh,
  error,
  pathname,
  selectionCount,
}: {
  loading: boolean;
  meta: { source: string; fetchedAt: string; cached: boolean };
  totalMatches: number;
  onRefresh: () => void;
  error: boolean;
  pathname: string;
  selectionCount: number;
}) {
  const time = meta.fetchedAt ? new Date(meta.fetchedAt).toLocaleTimeString() : "—";

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#09111e]/80 backdrop-blur-2xl">
      <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/fixtures" className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-cyan-100/20 bg-gradient-to-br from-cyan-200/25 to-sky-600/10 text-cyan-200">
            <Trophy size={19} />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold tracking-[-0.04em] text-white">SokaFix<span className="text-cyan-200">.</span></h1>
            <p className="text-[10px] font-medium tracking-wide text-slate-500">FOOTBALL WORKSPACE</p>
          </div>
        </Link>

        <nav aria-label="Main navigation" className="order-3 flex w-full gap-1 rounded-2xl border border-white/[0.07] bg-black/20 p-1 lg:order-none lg:ml-8 lg:w-auto">
          <Link
            href="/fixtures"
            aria-current={pathname === "/fixtures" ? "page" : undefined}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition sm:text-sm lg:flex-none ${pathname === "/fixtures" ? "bg-white/10 text-white shadow-sm" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}
          >
            <CalendarDays size={15} /> Fixture Board
          </Link>
          <Link
            href="/accumulator"
            aria-current={pathname === "/accumulator" ? "page" : undefined}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition sm:text-sm lg:flex-none ${pathname === "/accumulator" ? "bg-white/10 text-white shadow-sm" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}
          >
            <Dices size={15} /> Accumulator
            {selectionCount > 0 && <span className="rounded-full bg-cyan-200/15 px-1.5 text-xs text-cyan-200">{selectionCount}</span>}
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-2 text-xs text-slate-400 xl:inline-flex">
            <span className={`h-1.5 w-1.5 rounded-full ${meta.cached ? "bg-sky-400" : "bg-emerald-400"} animate-pulse-soft`} />
            {meta.source || "Loading"} <span className="text-slate-600">·</span> {totalMatches} fixtures <span className="text-slate-600">·</span> {time}
          </span>
          {error && (
            <span className="chip border-amber-500/40 bg-amber-500/10 text-amber-300">
              degraded
            </span>
          )}
          <button
            onClick={onRefresh}
            disabled={loading}
            title="Refresh fixtures"
            aria-label={loading ? "Refreshing fixtures" : "Refresh fixtures"}
            className="btn-ghost"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">{loading ? "Refreshing" : "Refresh"}</span>
          </button>
        </div>
      </div>
    </header>
  );
}

function PromptBar({
  prompt,
  onPrompt,
  parsing,
  onSubmit,
  filter,
  filterActive,
  onToggleFilter,
  onClearFilter,
  description,
  poolCount,
  canAutoBuild,
  onAutoBuild,
}: {
  prompt: string;
  onPrompt: (v: string) => void;
  parsing: boolean;
  onSubmit: (event: React.FormEvent) => void;
  filter: PromptFilter | null;
  filterActive: boolean;
  onToggleFilter: () => void;
  onClearFilter: () => void;
  description: string;
  poolCount: number;
  canAutoBuild: boolean;
  onAutoBuild: () => void;
}) {
  return (
    <div className="glass-card p-5 sm:p-6 animate-fade-up">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow"><Sparkles size={12} /> Natural language filter</p>
          <h3 className="mt-2 text-lg font-semibold tracking-tight text-white">Find your kind of match</h3>
          <p className="mt-1 text-xs leading-5 text-slate-400">Find results, odds, confidence, 2.5-goal and correct-score predictions, and available leagues. This is a rules-based filter, not AI.</p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Prompt finder</span>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <WandSparkles
            size={17}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sky-400"
          />
          <input
            value={prompt}
            aria-label="Describe the matches you want"
            onChange={(e) => onPrompt(e.target.value)}
            placeholder='Try "3 home wins, 10/10 confidence and over 2.5 goals"…'
            className="glass-input pl-11"
          />
        </div>
        <button
          type="submit"
          disabled={parsing || !prompt.trim()}
          className="btn-solid"
        >
          {parsing ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />}
          Parse prompt
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>Try:</span>
        {[
          "3 home wins with odds between 1.5 and 2.5",
          "10/10 confidence and over 2.5 goals",
          "away or draw with odds above 2",
        ].map((example) => (
          <button key={example} type="button" onClick={() => onPrompt(example)} className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-left text-slate-300 transition hover:border-cyan-300/30 hover:text-white">
            {example}
          </button>
        ))}
      </div>

      {filter && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Filter
          </span>
          <button
            onClick={onToggleFilter}
            className={`chip ${filterActive ? "" : "opacity-50 line-through"}`}
            title="Toggle filtering"
          >
            <CircleCheck size={12} /> {description}
          </button>
          <span className="chip-purple">
            <Zap size={11} /> {poolCount} matching
          </span>
          {canAutoBuild && (
            <button onClick={onAutoBuild} className="btn-cyan text-xs">
              <Dices size={14} /> Auto-build acca ({String(filter.count ?? 3)})
            </button>
          )}
          {filterActive && filter.count !== null && !canAutoBuild && (
            <span className="text-xs text-slate-400">Auto-build requires 1–6 matches, enough matching fixtures, and no unsupported conditions.</span>
          )}
          <button onClick={onClearFilter} className="btn-ghost px-2.5 py-1 text-xs">
            <X size={13} /> Clear
          </button>
        </div>
      )}
      {filter && filter.warnings.length > 0 && (
        <div role="status" className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-xs leading-5 text-amber-200">
          {filter.warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      )}
    </div>
  );
}

function FixtureTable({
  fixtures,
  loading,
  total,
  search,
  onSearch,
  fixtureFilters,
  onFixtureFilters,
  leagueOptions,
  selectedLeagueLabel,
  hasFixtureFilters,
  selectedIds,
  onToggleLeg,
  showMore,
}: {
  fixtures: Fixture[];
  loading: boolean;
  total: number;
  search: string;
  onSearch: (v: string) => void;
  fixtureFilters: FixtureFilters;
  onFixtureFilters: (filters: FixtureFilters) => void;
  leagueOptions: Array<{ value: string; label: string; count: number }>;
  selectedLeagueLabel?: string;
  hasFixtureFilters: boolean;
  selectedIds: Set<string>;
  onToggleLeg: (leg: AccaLeg) => void;
  showMore: (() => void) | null;
}) {
  return (
    <div className="glass-card overflow-hidden animate-fade-up">
      <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.07] px-5 py-5 sm:px-6">
        <div>
          <p className="eyebrow"><Activity size={12} /> Match explorer</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">Fixture Board</h2>
          <p className="mt-1 text-xs text-slate-400">
            {loading ? "Fetching live data…" : `${total} fixtures · click the predicted price to add a leg`}
          </p>
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            value={search}
            aria-label="Search team or league"
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search team or league…"
            className="glass-input py-2 pl-9 text-sm"
          />
        </div>
      </div>

      <div className="border-b border-white/[0.07] bg-slate-950/20 px-5 py-4 sm:px-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Filter fixtures</p>
          <button
            type="button"
            onClick={() => onFixtureFilters(EMPTY_FIXTURE_FILTERS)}
            disabled={!hasFixtureFilters}
            className="btn-ghost px-2.5 py-1 text-xs"
          >
            Clear filters
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-400">
            League
            <select
              value={fixtureFilters.league}
              onChange={(event) => onFixtureFilters({ ...fixtureFilters, league: event.target.value })}
              className="glass-input py-2 text-sm [&>option]:bg-slate-900"
            >
              <option value="">All leagues</option>
              {fixtureFilters.league && !leagueOptions.some((league) => league.value === fixtureFilters.league) && (
                <option value={fixtureFilters.league} disabled>
                  {selectedLeagueLabel ?? "Selected league"} (no matching predictions)
                </option>
              )}
              {leagueOptions.map((league) => <option key={league.value} value={league.value}>{league.label} ({league.count})</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-400">
            Confidence
            <select
              value={fixtureFilters.confidence ?? ""}
              onChange={(event) => onFixtureFilters({ ...fixtureFilters, confidence: event.target.value ? Number(event.target.value) : null })}
              className="glass-input py-2 text-sm [&>option]:bg-slate-900"
            >
              <option value="">Any confidence</option>
              {Array.from({ length: 10 }, (_, index) => 10 - index).map((confidence) => (
                <option key={confidence} value={confidence}>{confidence}/10</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-400">
            Match result prediction
            <select
              value={fixtureFilters.outcome}
              onChange={(event) => onFixtureFilters({ ...fixtureFilters, outcome: event.target.value as FixtureFilters["outcome"] })}
              className="glass-input py-2 text-sm [&>option]:bg-slate-900"
            >
              <option value="any">Any result</option>
              <option value="home">Home win (1)</option>
              <option value="draw">Draw (X)</option>
              <option value="away">Away win (2)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-400">
            Goals prediction
            <select
              value={fixtureFilters.goals}
              onChange={(event) => onFixtureFilters({ ...fixtureFilters, goals: event.target.value as FixtureFilters["goals"] })}
              className="glass-input py-2 text-sm [&>option]:bg-slate-900"
            >
              <option value="any">Any goals prediction</option>
              <option value="O">Over 2.5 goals</option>
              <option value="U">Under 2.5 goals</option>
            </select>
          </label>
        </div>
        <p className="mt-3 text-xs text-slate-500">These filters also apply to newly generated accumulators. Team search only filters the board.</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/5 bg-slate-950/20 text-left text-[10px] uppercase tracking-[0.14em] text-slate-500">
              <th className="px-4 py-2.5 font-semibold">Kickoff</th>
              <th className="px-2 py-2.5 font-semibold">League</th>
              <th className="px-2 py-2.5 font-semibold">Match</th>
              <th className="px-1 py-2.5 text-center font-semibold">1</th>
              <th className="px-1 py-2.5 text-center font-semibold">X</th>
              <th className="px-1 py-2.5 text-center font-semibold">2</th>
              <th className="px-3 py-2.5 font-semibold">Tip</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows />
            ) : fixtures.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-14 text-center">
                  <div className="mx-auto flex max-w-sm flex-col items-center gap-2 text-slate-500">
                    <Search size={22} className="text-slate-600" />
                    <p className="text-sm">No fixtures match the current filters.</p>
                    <p className="text-xs">Try clearing your filters or searching again.</p>
                  </div>
                </td>
              </tr>
            ) : (
              fixtures.map((f) => <FixtureRow key={f.id} fixture={f} selectedIds={selectedIds} onToggleLeg={onToggleLeg} />)
            )}
          </tbody>
        </table>
      </div>

      {showMore && (
        <div className="border-t border-white/5 p-3 text-center">
          <button onClick={showMore} className="btn-cyan">
            <Plus size={15} /> Show more fixtures
          </button>
        </div>
      )}
    </div>
  );
}

function FixtureRow({
  fixture,
  selectedIds,
  onToggleLeg,
}: {
  fixture: Fixture;
  selectedIds: Set<string>;
  onToggleLeg: (leg: AccaLeg) => void;
}) {
  return (
    <tr className="group border-b border-white/5 transition-colors last:border-0 hover:bg-cyan-100/[0.035]">
      <td className="px-4 py-3">
        <div className="text-xs font-semibold text-slate-300">
          {fixture.status === "live" ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-soft" />
              LIVE
            </span>
          ) : (
            fixture.time
          )}
        </div>
        <div className="text-[10px] text-slate-600">{fixture.isoDate}</div>
      </td>
      <td className="px-2 py-3">
        <span className="chip">{fixture.league}</span>
      </td>
      <td className="px-2 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-slate-100">{fixture.homeTeam}</span>
          <span className="text-xs text-slate-500">vs</span>
          <span className="font-semibold text-slate-100">{fixture.awayTeam}</span>
        </div>
      </td>
      {OUTCOMES.map((outcome) => {
        const price = priceFor(fixture, outcome);
        const key = legKey({ fixture, outcome });
        const active = selectedIds.has(key);
        const predicted = outcome === fixture.prediction;
        return (
          <td key={outcome} className="px-1 py-3 text-center">
            <button
              onClick={() => onToggleLeg({ fixture, outcome })}
              disabled={!predicted}
              aria-pressed={predicted ? active : undefined}
              className={`w-14 rounded-lg border px-2 py-1.5 text-xs font-bold transition ${
                active
                  ? "border-sky-400/70 bg-sky-500/25 text-sky-200 shadow-md shadow-sky-500/10"
                  : predicted
                    ? "border-sky-500/30 bg-sky-500/10 text-sky-300 hover:border-sky-400/60 hover:bg-sky-500/20 active:scale-95"
                    : "cursor-not-allowed border-white/5 bg-white/[0.02] text-slate-600"
              }`}
              title={predicted ? `${outcomeLabel(outcome)} prediction — ${active ? "remove from" : "add to"} slip` : "Only the predicted result can be added"}
            >
              {price.toFixed(2)}
            </button>
          </td>
        );
      })}
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex min-w-[2rem] items-center justify-center rounded-md border px-1.5 py-1 text-xs font-bold ${outcomeChipClass(fixture.prediction)}`}
          >
            {predictionSymbol(fixture.prediction)}
          </span>
          <div className="flex flex-col text-[10px] leading-tight text-slate-600">
            <span className={outcomeDotClass(fixture.prediction)}>
              {fixture.predictionPoints}/10 conf
            </span>
            {(fixture.correctScore || fixture.overUnder) && (
              <span>{[fixture.correctScore, fixture.overUnder && `${fixture.overUnder}2.5`].filter(Boolean).join(" · ")}</span>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i} className="border-b border-white/5">
          <td className="px-4 py-3">
            <div className="h-3 w-12 animate-pulse rounded bg-white/10" />
            <div className="mt-1.5 h-2 w-8 animate-pulse rounded bg-white/5" />
          </td>
          <td className="px-2 py-3">
            <div className="h-5 w-24 animate-pulse rounded-full bg-white/10" />
          </td>
          <td className="px-2 py-3">
            <div className="h-3 w-32 animate-pulse rounded bg-white/10" />
            <div className="my-1.5 h-2 w-8 animate-pulse rounded bg-white/5" />
            <div className="h-3 w-28 animate-pulse rounded bg-white/10" />
          </td>
          <td colSpan={3} className="px-1 py-3">
            <div className="h-7 w-14 animate-pulse rounded-lg bg-white/10" />
          </td>
          <td className="px-3 py-3">
            <div className="h-7 w-14 animate-pulse rounded-md bg-white/10" />
          </td>
        </tr>
      ))}
    </>
  );
}

function SlipBuilder({
  selection,
  selectionOdds,
  stake,
  onStake,
  payout,
  poolSize,
  onCombine,
  onClear,
  slips,
  activeSlipId,
  onApplySlip,
  onToggleLeg,
}: {
  selection: AccaLeg[];
  selectionOdds: number;
  stake: string;
  onStake: (v: string) => void;
  payout: { gross: number; net: number };
  poolSize: number;
  onCombine: (size: number) => void;
  onClear: () => void;
  slips: Acca[];
  activeSlipId: string | null;
  onApplySlip: (slip: Acca) => void;
  onToggleLeg: (leg: AccaLeg) => void;
}) {
  const sizeCounts: Array<{ size: number; disabled: boolean }> = [3, 5, 6].map(
    (size) => ({ size, disabled: poolSize < size }),
  );

  return (
    <aside className="grid items-start gap-4 xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.2fr)] animate-fade-up">
      <div className="glass-card h-fit p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-200/15 bg-cyan-200/10 text-cyan-200"><Dices size={18} /></div>
        <div>
          <p className="eyebrow">Make it yours</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">Generate a combination</h2>
          <p className="mt-1 text-xs text-slate-400">
            {poolSize} fixtures in pool · {legLabel(selection.length)}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-2">
        {sizeCounts.map(({ size, disabled }) => (
          <button
            key={size}
            disabled={disabled}
            onClick={() => onCombine(size)}
            className={disabled ? "btn-ghost col-span-1 py-3 text-xs" : "btn-cyan col-span-1 py-3 text-xs"}
            title={disabled ? `Not enough matches for a ${size}-fold acca` : `Combine ${size} matches`}
          >
            <Dices size={14} /> {size} legs
          </button>
        ))}
      </div>

      <div className="mt-5 rounded-2xl border border-white/[0.08] bg-slate-950/30 p-4">
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Combined odds</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-cyan-200">
              {selectionOdds > 0 ? selectionOdds.toFixed(2) : "—"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Selections</p>
            <p className="text-xs font-semibold text-slate-400">
              {selection.length}
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <label htmlFor="stake" className="text-xs text-slate-500">
            Stake
          </label>
          <input
            id="stake"
            type="number"
            min="0"
            step="0.5"
            value={stake}
            onChange={(e) => onStake(e.target.value)}
            className="glass-input px-3 py-1.5 text-sm"
          />
          <div className="ml-auto text-right">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Return</p>
            <p className="text-sm font-bold text-emerald-400">
              {selection.length > 0 ? stakeValue(payout.gross) : "—"}
            </p>
            <p className="text-[10px] text-slate-500">net {selection.length > 0 ? stakeValue(payout.net) : "—"}</p>
          </div>
        </div>
      </div>

      {slips.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Generated slip suggestions
          </p>
          <div className="flex flex-col gap-2">
            {slips.map((slip) => (
              <button
                key={slip.id}
                onClick={() => onApplySlip(slip)}
                className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition ${
                  activeSlipId === slip.id
                    ? "border-purple-500/50 bg-purple-500/15"
                    : "border-white/10 bg-white/5 hover:border-purple-500/30"
                }`}
              >
                <span className="text-xs text-slate-400">
                  {slip.legs.map((l) => l.fixture.homeTeam).join(" + ")}
                </span>
                <span className="shrink-0 text-sm font-bold text-sky-400">
                  {slip.totalOdds.toFixed(2)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 flex items-start gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs leading-relaxed text-slate-400">
        <Info size={14} className="mt-0.5 shrink-0 text-cyan-200/70" />
        <p>
          Odds come from SoccerVista when bookmaker prices are published; otherwise
          model-priced from prediction confidence. Goal and score predictions are
          informational and are not included in accumulator odds.
        </p>
      </div>
      </div>

      <div className="glass-card min-w-0 p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div><p className="eyebrow">Your selections</p><h2 className="mt-1 text-lg font-semibold tracking-tight text-white">Your slip <span className="text-sm font-normal text-slate-500">· {legLabel(selection.length)}</span></h2></div>
          <button
            onClick={onClear}
            disabled={selection.length === 0 && slips.length === 0}
            className="btn-ghost text-xs"
          >
            <Trash size={14} /> Clear slip
          </button>
        </div>
        {selection.length === 0 ? (
          <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-slate-950/20 p-6 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-cyan-200/70"><Layers3 size={20} /></div>
            <p className="text-sm font-semibold text-slate-200">Your slip is waiting</p>
            <p className="mt-2 max-w-xs text-xs leading-5 text-slate-400">
              Add a predicted price from the fixture board, or generate a combination.
            </p>
            <Link href="/fixtures" className="btn-ghost mt-4 text-xs">Browse fixtures <ArrowUpRight size={13} /></Link>
          </div>
        ) : (
          <ul className="grid gap-3 2xl:grid-cols-2">
            {selection.map((leg) => (
              <li
                key={legKey(leg)}
                 className="rounded-2xl border border-white/[0.08] bg-slate-950/30 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-sky-300">
                      {[leg.fixture.country, leg.fixture.league].filter(Boolean).join(" · ")}
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-100">
                      {leg.fixture.homeTeam} <span className="font-normal text-slate-500">vs</span> {leg.fixture.awayTeam}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Kickoff: {leg.fixture.isoDate} · {leg.fixture.time}
                      {leg.fixture.status !== "scheduled" && ` · ${leg.fixture.status}`}
                    </p>
                  </div>
                  <button
                    onClick={() => onToggleLeg(leg)}
                    className="shrink-0 rounded p-1 text-slate-500 hover:text-rose-400"
                    aria-label={`Remove ${leg.fixture.homeTeam} vs ${leg.fixture.awayTeam}`}
                    title="Remove leg"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="mt-4">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Predicted match result</p>
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-sky-400/40 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-200">
                    <span>{outcomeLabel(leg.outcome)} <span className="text-[10px] opacity-70">{predictionSymbol(leg.outcome)} · {leg.fixture.predictionPoints}/10 confidence</span></span>
                    <span>{priceFor(leg.fixture, leg.outcome).toFixed(2)}</span>
                  </div>
                </div>
                <div className="mt-4 border-t border-white/5 pt-3">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Additional predictions · not priced</p>
                  <div className="flex flex-wrap gap-2">
                    {leg.fixture.overUnder && (
                      <span className="chip">{leg.fixture.overUnder === "O" ? "Over" : "Under"} 2.5 goals</span>
                    )}
                    {leg.fixture.correctScore && <span className="chip">Correct score: {leg.fixture.correctScore}</span>}
                    {!leg.fixture.overUnder && !leg.fixture.correctScore && (
                      <span className="text-xs text-slate-500">No goals or score prediction available.</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function MobileAccaBar({
  legs,
  odds,
  net,
}: {
  legs: number;
  odds: number;
  net: number;
}) {
  if (legs === 0) return null;
  return (
    <Link href="/accumulator" aria-label={`Open accumulator with ${legLabel(legs)}`} className="fixed inset-x-0 bottom-0 z-40 border-t border-sky-500/20 bg-slate-950/85 px-4 py-3 backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">
            {legLabel(legs)} slip
          </p>
          <p className="text-lg font-black text-sky-400">
            {odds > 0 ? odds.toFixed(2) : "—"}
          </p>
        </div>
        <p className="text-xs text-emerald-400">Net {stakeValue(net)}</p>
      </div>
    </Link>
  );
}

function ErrorScreen({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <BackgroundFX />
      <div className="glass-card relative z-10 flex max-w-md flex-col items-center gap-3 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-500/40 bg-rose-500/15 text-rose-400">
          <TriangleAlert size={24} />
        </div>
        <h1 className="text-lg font-bold text-white">Data source unavailable</h1>
        <p className="text-sm text-slate-400">{error}</p>
        <button onClick={onRetry} className="btn-solid mt-2">
          <RefreshCw size={15} /> Try again
        </button>
      </div>
    </div>
  );
}

function legLabel(count: number): string {
  return `${count} ${count === 1 ? "leg" : "legs"}`;
}

function stakeValue(n: number): string {
  return Number.isFinite(n) ? (Math.round(n * 100) / 100).toFixed(2) : "—";
}
