"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CircleCheck,
  Dices,
  Info,
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

export default function Home() {
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

  const pool = useMemo(() => {
    if (!filter || !filterActive) return fixtures;
    return fixtures.filter((f) => matchesFilter(f, filter));
  }, [filter, filterActive, fixtures]);

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
    const target = Math.min(Math.max(1, filter?.count ?? 3), Math.max(1, pool.length));
    handleCombine(Math.min(target, 6));
  }, [filter, pool, handleCombine]);

  const clearSlip = useCallback(() => {
    setSelection([]);
    setSlips([]);
    setActiveSlipId(null);
  }, []);

  const totalMatches = useMemo(() => fixtures.length, [fixtures]);
  const parsedCount = filter?.count ?? null;

  if (error && !fixtures.length) {
    return <ErrorScreen error={error} onRetry={() => void loadFixtures(true)} />;
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <BackgroundFX />
      <Header
        loading={loading}
        meta={meta}
        totalMatches={totalMatches}
        onRefresh={() => void loadFixtures(true)}
        error={Boolean(error)}
      />

      <main className="relative z-10 mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 pb-32 pt-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-6">
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
            canAutoBuild={parsedCount !== null && pool.length > 0}
            onAutoBuild={handleAutoBuild}
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
            selectedIds={selectedIds}
            onToggleLeg={toggleLeg}
            showMore={
              searchPool.length > rowLimit
                ? () => setRowLimit((n) => n + 60)
                : null
            }
          />
        </div>

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

      <MobileAccaBar
        legs={selection.length}
        odds={selectionOdds}
        net={payout.net}
      />
    </div>
  );
}

function BackgroundFX() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <div className="absolute -top-32 right-[-10%] h-[28rem] w-[28rem] rounded-full bg-sky-500/20 blur-[120px] animate-blob" />
      <div className="absolute bottom-[-20%] left-[-10%] h-[30rem] w-[30rem] rounded-full bg-purple-500/20 blur-[130px] animate-blob-slow" />
      <div className="absolute top-1/3 left-1/2 h-[22rem] w-[22rem] rounded-full bg-fuchsia-500/10 blur-[110px] animate-blob" />
    </div>
  );
}

function Header({
  loading,
  meta,
  totalMatches,
  onRefresh,
  error,
}: {
  loading: boolean;
  meta: { source: string; fetchedAt: string; cached: boolean };
  totalMatches: number;
  onRefresh: () => void;
  error: boolean;
}) {
  const time = meta.fetchedAt ? new Date(meta.fetchedAt).toLocaleTimeString() : "—";

  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-slate-950/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-500/40 bg-gradient-to-br from-sky-500/25 to-purple-500/20 text-sky-300 shadow-lg shadow-sky-500/10">
            <Trophy size={20} />
          </div>
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight text-white">
              AccaLab
              <span className="rounded-full border border-purple-500/40 bg-purple-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-300">
                Fixtures + Acca Engine
              </span>
            </h1>
            <p className="truncate text-xs text-slate-500">
              Aggregated football fixtures, predictions &amp; accumulator builder
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="chip hidden sm:inline-flex">
            <span className={`h-1.5 w-1.5 rounded-full ${meta.cached ? "bg-sky-400" : "bg-emerald-400"} animate-pulse-soft`} />
            {meta.source || "loading"}
          </span>
          <span className="chip-purple hidden md:inline-flex">
            <RefreshCw size={11} /> {time}
          </span>
          <span className="chip hidden md:inline-flex">
            <Zap size={11} /> {totalMatches} matches
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
    <div className="glass-card-accent p-4 animate-fade-up">
      <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <WandSparkles
            size={17}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sky-400"
          />
          <input
            value={prompt}
            onChange={(e) => onPrompt(e.target.value)}
            placeholder='Try "Find 4 home wins with odds over 1.60" or "2 away wins in Serie A"…'
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
          <button onClick={onClearFilter} className="btn-ghost px-2.5 py-1 text-xs">
            <X size={13} /> Clear
          </button>
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
  selectedIds,
  onToggleLeg,
  showMore,
}: {
  fixtures: Fixture[];
  loading: boolean;
  total: number;
  search: string;
  onSearch: (v: string) => void;
  selectedIds: Set<string>;
  onToggleLeg: (leg: AccaLeg) => void;
  showMore: (() => void) | null;
}) {
  return (
    <div className="glass-card overflow-hidden animate-fade-up">
      <div className="flex flex-wrap items-center gap-3 border-b border-white/5 px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-white">Fixture Board</h2>
          <p className="text-xs text-slate-500">
            {loading ? "Fetching live data…" : `${total} fixtures · click a price to add a leg`}
          </p>
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search team or league…"
            className="glass-input py-2 pl-9 text-sm"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/5 text-left text-[11px] uppercase tracking-wider text-slate-500">
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
                    <p className="text-xs">Try clearing the prompt filter or searching again.</p>
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
    <tr className="group border-b border-white/5 transition-colors last:border-0 hover:bg-white/[0.04]">
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
        return (
          <td key={outcome} className="px-1 py-3 text-center">
            <button
              onClick={() => onToggleLeg({ fixture, outcome })}
              className={`w-14 rounded-lg border px-2 py-1.5 text-xs font-bold transition active:scale-95 ${
                active
                  ? "border-sky-400/70 bg-sky-500/25 text-sky-200 shadow-md shadow-sky-500/10"
                  : "border-white/5 bg-white/5 text-slate-400 group-hover:border-white/10 hover:border-sky-500/40 hover:text-sky-300"
              }`}
              title={outcomeLabel(outcome)}
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
            {fixture.correctScore && (
              <span>{fixture.correctScore} · {fixture.overUnder}2.5</span>
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
    <aside className="glass-card h-fit p-4 lg:sticky lg:top-24 animate-fade-up">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-purple-500/40 bg-purple-500/15 text-purple-300">
          <Dices size={16} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-white">Accumulator Builder</h2>
          <p className="text-xs text-slate-500">
            {poolSize} fixtures in pool · {legLabel(selection.length)}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {sizeCounts.map(({ size, disabled }) => (
          <button
            key={size}
            disabled={disabled}
            onClick={() => onCombine(size)}
            className={disabled ? "btn-ghost col-span-1 text-xs" : "btn-cyan col-span-1 text-xs"}
            title={disabled ? `Not enough matches for a ${size}-fold acca` : `Combine ${size} matches`}
          >
            <Dices size={14} /> {size} legs
          </button>
        ))}
      </div>

      <div className="mt-3 rounded-xl border border-white/5 bg-slate-950/40 p-3">
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Combined odds</p>
            <p className="text-2xl font-black text-sky-400">
              {selectionOdds > 0 ? selectionOdds.toFixed(2) : "—"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Free bet</p>
            <p className="text-xs font-semibold text-slate-400">
              {selectionOdds > 0 ? `${selection.length}x` : "0x"}
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
              {stakeValue(payout.gross)}
            </p>
            <p className="text-[10px] text-slate-600">net {stakeValue(payout.net)}</p>
          </div>
        </div>
      </div>

      <button
        onClick={onClear}
        disabled={selection.length === 0 && slips.length === 0}
        className="btn-ghost mt-3 w-full text-xs"
      >
        <Trash size={14} /> Clear slip
      </button>

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

      <div className="mt-4">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Your slip {selection.length > 0 && `· ${legLabel(selection.length)}`}
        </p>
        {selection.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 p-4 text-center">
            <p className="text-xs text-slate-600">
              Click the 1 / X / 2 price on any fixture to build your acca, or hit
              Combine to generate one.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {selection.map((leg) => (
              <li
                key={legKey(leg)}
                className="group flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-2.5 py-2"
              >
                <div className="min-w-0 flex-1">
                  <span className={`mr-1.5 text-[10px] font-bold ${outcomeDotClass(leg.outcome)}`}>
                    {predictionSymbol(leg.outcome)}
                  </span>
                  <span className="truncate text-xs text-slate-300">
                    {leg.fixture.homeTeam} v {leg.fixture.awayTeam}
                  </span>
                </div>
                <span className="shrink-0 text-xs font-bold text-sky-400">
                  {priceFor(leg.fixture, leg.outcome).toFixed(2)}
                </span>
                <button
                  onClick={() => onToggleLeg(leg)}
                  className="shrink-0 rounded p-0.5 text-slate-600 hover:text-rose-400"
                  title="Remove leg"
                >
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-2.5 text-[10px] leading-relaxed text-slate-500">
        <Info size={13} className="mt-0.5 shrink-0 text-sky-500/70" />
        <p>
          Odds come from SoccerVista when bookmaker prices are published; otherwise
          model-priced from prediction confidence. Accumulator odds are the product
          of each leg&apos;s price.
        </p>
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
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-sky-500/20 bg-slate-950/85 px-4 py-3 backdrop-blur-xl lg:hidden">
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
    </div>
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