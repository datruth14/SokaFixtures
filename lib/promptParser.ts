import type { Outcome } from "./types";
import { outcomeLabel } from "./odds";

export type Comparison = "gte" | "lte";

export interface OddsClause {
  outcome: Outcome | "any";
  operator: Comparison;
  value: number;
}

export interface PromptFilter {
  count: number | null;
  outcomes: Outcome[];
  odds: OddsClause[];
  leagues: string[];
  summary: string[];
  raw: string;
}

interface MarkedOutcome {
  index: number;
  outcome: Outcome;
}

interface MarkedOdds {
  index: number;
  operator: Comparison;
  value: number;
}

const normalize = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

function findCount(norm: string): number | null {
  const phrase = norm.match(
    /(\d+)\s+(home|away|hosts?)\s+win|(\d+)\s+draws?|(\d+)\s*(?:matches?|games?|legs?|picks?|selections?)/i,
  );
  const hit = phrase?.slice(1).find((v) => typeof v !== "undefined");
  if (!hit) return null;
  const n = parseInt(hit, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function findOutcomes(norm: string): MarkedOutcome[] {
  const found: MarkedOutcome[] = [];
  const push = (regex: RegExp, outcome: Outcome) => {
    for (const m of norm.matchAll(regex)) {
      if (typeof m.index === "number") found.push({ index: m.index, outcome });
    }
  };

  push(/\bhome\s*win\b|\bwin(?:s)?\s+(?:the\s+)?home\b|\bhome\b|\bhosts?\s*win\b/g, "home");
  push(/\baway\s*win\b|\bwin(?:s)?\s+(?:the\s+)?away\b|\baway\b/g, "away");
  push(/\bdraw(?:s)?\b|\bdraw(?:s)?\s+between\b|\bdead.lock\b|\btie\b/gi, "draw");

  push(/(?<![.\d])\b1\b(?![.\d])/g, "home");
  push(/(?<![.\d])\b2\b(?![.\d])/g, "away");
  push(/(?<![.\d])\bX\b(?![.\d])/gi, "draw");

  const unique = new Map<string, MarkedOutcome>();
  for (const item of found) {
    const key = `${item.outcome}:${item.index}`;
    unique.set(key, item);
  }
  return [...unique.values()].sort((a, b) => a.index - b.index);
}

function findOdds(norm: string): MarkedOdds[] {
  const found: MarkedOdds[] = [];

  const over =
    /(?:over|above|at least|minimum|min\.?|more than|higher than|no less than|equal to|exactly|>=?|\u2265)\s*(?:odds?\s*)?(?:of\s*)?(\d+(?:\.\d+)?)/gi;
  for (const m of norm.matchAll(over)) {
    if (typeof m.index === "number") {
      found.push({
        index: m.index,
        operator: "gte",
        value: parseFloat(m[1]),
      });
    }
  }

  const under =
    /(?:under|below|at most|maximum|max\.?|less than|lower than|no more than|<=?|\u2264)\s*(?:odds?\s*)?(?:of\s*)?(\d+(?:\.\d+)?)/gi;
  for (const m of norm.matchAll(under)) {
    if (typeof m.index === "number") {
      found.push({
        index: m.index,
        operator: "lte",
        value: parseFloat(m[1]),
      });
    }
  }

  return found
    .filter((m) => Number.isFinite(m.value))
    .sort((a, b) => a.index - b.index);
}

function findLeagues(norm: string, knownLeagues: string[]): string[] {
  const normalizedKnown = knownLeagues.map((l) => ({
    league: l,
    needle: normalize(l),
  }));
  return normalizedKnown
    .filter(({ needle }) => needle.length > 2 && norm.includes(needle))
    .map(({ league }) => league);
}

export function parsePrompt(raw: string, knownLeagues: string[] = []): PromptFilter {
  const text = normalize(raw);
  const outcomes = findOutcomes(text);
  const oddsMarks = findOdds(text);
  const count = findCount(text);
  const leagues = findLeagues(text, knownLeagues);

  const odds: OddsClause[] = oddsMarks.map((mark) => {
    const nearestOutcome = outcomes
      .filter((o) => o.index < mark.index)
      .at(-1);
    return {
      outcome: nearestOutcome?.outcome ?? "any",
      operator: mark.operator,
      value: mark.value,
    };
  });

  const uniqueOutcomes = [...new Set(outcomes.map((o) => o.outcome))];

  const summary: string[] = [];
  if (count !== null) {
    summary.push(`${count} match(es)`);
  }
  for (const outcome of uniqueOutcomes) {
    summary.push(`predicted ${outcomeLabel(outcome).toLowerCase()}`);
  }
  for (const clause of odds.slice(0, 6)) {
    const target = clause.outcome === "any" ? "any" : `${clause.outcome} odds`;
    summary.push(
      `${target} ${clause.operator === "gte" ? "\u2265" : "\u2264"} ${clause.value.toFixed(2)}`,
    );
  }
  for (const league of leagues.slice(0, 4)) {
    summary.push(league);
  }
  if (summary.length === 0) {
    summary.push("no conditions detected");
  }

  return {
    count,
    outcomes: uniqueOutcomes,
    odds,
    leagues,
    summary,
    raw,
  };
}

export function matchesFilter(
  fixture: { league: string; prediction: Outcome; homeOdds: number; drawOdds: number; awayOdds: number },
  filter: PromptFilter,
): boolean {
  if (filter.leagues.length > 0) {
    const match = filter.leagues.some(
      (l) =>
        fixture.league.toLowerCase().includes(l.toLowerCase()) ||
        l.toLowerCase().includes(fixture.league.toLowerCase()),
    );
    if (!match) return false;
  }

  for (const outcome of filter.outcomes) {
    if (fixture.prediction !== outcome) return false;
  }

  for (const clause of filter.odds) {
    const value =
      clause.outcome === "home"
        ? fixture.homeOdds
        : clause.outcome === "draw"
          ? fixture.drawOdds
          : fixture.awayOdds;
    if (clause.operator === "gte" && value < clause.value) return false;
    if (clause.operator === "lte" && value > clause.value) return false;
  }

  return true;
}

export function describeFilter(filter: PromptFilter): string {
  const parts: string[] = [];
  if (filter.count !== null) parts.push(String(filter.count));
  if (filter.outcomes.length > 0) {
    parts.push(filter.outcomes.map((o) => outcomeLabel(o).toLowerCase()).join("/"));
  }
  if (filter.odds.length > 0) {
    parts.push(
      filter.odds
        .map((c) => `odds ${c.operator === "gte" ? ">=" : "<="} ${c.value.toFixed(2)}`)
        .join(", "),
    );
  }
  if (filter.leagues.length > 0) parts.push(filter.leagues.join(", "));
  return parts.join(" · ") || "No conditions";
}