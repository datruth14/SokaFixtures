import type { Fixture, Outcome } from "./types";
import { outcomeLabel } from "./odds";

export type Comparison = "gt" | "gte" | "lt" | "lte" | "eq";

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
  goals: "O" | "U" | null;
  correctScore: string | null;
  confidence: { operator: Comparison; value: number } | null;
  warnings: string[];
  summary: string[];
  raw: string;
}

interface Range { index: number; end: number }
interface MarkedOutcome { index: number; outcome: Outcome }
interface MarkedOdds extends Range { operator: Comparison; value: number }

const normalize = (text: string): string => text.toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
const overlaps = (range: Range, others: Range[]): boolean =>
  others.some((other) => range.index < other.end && range.end > other.index);
const rangeOf = (match: RegExpMatchArray): Range => ({ index: match.index!, end: match.index! + match[0].length });
const compare = (value: number, operator: Comparison, target: number): boolean => {
  switch (operator) {
    case "gt": return value > target;
    case "gte": return value >= target;
    case "lt": return value < target;
    case "lte": return value <= target;
    case "eq": return value === target;
  }
};
const operatorText = (operator: Comparison): string => ({ gt: ">", gte: "≥", lt: "<", lte: "≤", eq: "=" })[operator];

function comparison(phrase: string | undefined): Comparison {
  const value = phrase?.trim() ?? "";
  if (["over", "above", "more than", "higher than", ">"].includes(value)) return "gt";
  if (["under", "below", "less than", "lower than", "<"].includes(value)) return "lt";
  if (["at most", "maximum", "max", "max.", "no more than", "<=", "≤"].includes(value)) return "lte";
  if (["at least", "minimum", "min", "min.", "no less than", ">=", "≥"].includes(value)) return "gte";
  return "eq";
}

const COMPARISON = "no less than|no more than|more than|less than|higher than|lower than|at least|at most|minimum|maximum|min\\.?|max\\.?|exactly|equal to|over|above|under|below|>=|<=|>|<|≥|≤";
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

function findCount(text: string): ({ value: number; anyWin: boolean } & Range) | null {
  const match = text.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:(?:home|away|hosts?)\s+wins?|draws?|wins?|matches?|games?|legs?|picks?|selections?|predictions?)\b/);
  if (!match) return null;
  const value = NUMBER_WORDS[match[1]] ?? Number(match[1]);
  return value > 0 ? { value, anyWin: /^\S+\s+wins?$/.test(match[0]), index: match.index!, end: match.index! + match[1].length } : null;
}

function findLeagues(text: string, knownLeagues: string[]): { leagues: string[]; ranges: Range[] } {
  const found = knownLeagues.map((league) => ({ league, needle: normalize(league) }))
    .filter(({ needle }) => needle.length > 2)
    .flatMap(({ league, needle }) => {
      const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return [...text.matchAll(new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "g"))]
        .map((match) => ({ league, ...rangeOf(match) }));
    })
    .sort((a, b) => (b.end - b.index) - (a.end - a.index));
  const selected: typeof found = [];
  for (const item of found) if (!overlaps(item, selected)) selected.push(item);
  return { leagues: [...new Set(selected.map((item) => item.league))], ranges: selected };
}

function findConfidence(text: string, excluded: Range[], warnings: string[]): { confidence: PromptFilter["confidence"]; ranges: Range[] } {
  const ranges: Range[] = [];
  let confidence: PromptFilter["confidence"] = null;
  const patterns = [
    new RegExp(`\\bconfidence(?:\\s+(?:score|rating))?\\s*(?:(?:is|of)\\s*|:\\s*)?(${COMPARISON})?\\s*(\\d{1,2})(?:\\s*(?:/|out of)\\s*10)?\\b`, "g"),
    new RegExp(`(?:(?<![a-z])(${COMPARISON})\\s*)?\\b(\\d{1,2})\\s*(?:/|out of)\\s*10\\b(?:\\s*(?:confidence|conf))?`, "g"),
    new RegExp(`(?:(?<![a-z])(${COMPARISON})\\s*)?\\b(\\d{1,2})\\s*(?:confidence|conf)\\b`, "g"),
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const range = rangeOf(match);
      if (overlaps(range, [...excluded, ...ranges])) continue;
      ranges.push(range);
      const value = Number(match[2]);
      if (value < 1 || value > 10) {
        warnings.push("Confidence must be between 1 and 10.");
      } else if (confidence) {
        warnings.push("Only one confidence condition is supported.");
      } else {
        confidence = { operator: comparison(match[1]), value };
      }
    }
  }
  return { confidence, ranges };
}

function findGoals(text: string, excluded: Range[], warnings: string[]): { goals: PromptFilter["goals"]; ranges: Range[] } {
  const ranges: Range[] = [];
  const found = new Set<"O" | "U">();
  for (const match of text.matchAll(/\b(over|under|above|below|more than|less than)\s*(\d+(?:\.\d+)?)(?:\s*(?:total\s*)?goals?)?\b/g)) {
    const range = rangeOf(match);
    if (overlaps(range, excluded)) continue;
    const before = text.slice(Math.max(0, range.index - 24), range.index);
    const explicitGoals = /goals?\s*$/.test(before) || /goals?\b/.test(match[0]);
    const explicitOdds = /\bodds?\s*(?:is\s*|are\s*|of\s*)?$/.test(before) || /^\s*odds?\b/.test(text.slice(range.end));
    const goalLine = Number(match[2]);
    if (!explicitGoals && explicitOdds) continue;
    if (!explicitGoals && goalLine !== 2.5) {
      if (/\.5$/.test(match[2]) && !/\bodds?\b/.test(before)) {
        ranges.push(range);
        warnings.push(`“${match[0]}” is ambiguous. Specify odds or goals; this condition was not applied.`);
      }
      continue;
    }
    ranges.push(range);
    if (goalLine !== 2.5) {
      warnings.push(`Only over/under 2.5 goal predictions are available; ${match[0]} was not applied.`);
    } else {
      found.add(["over", "above", "more than"].includes(match[1]) ? "O" : "U");
    }
  }
  if (found.size > 1) warnings.push("Both over and under were requested, so no goals filter was applied.");
  return { goals: found.size === 1 ? [...found][0] : null, ranges };
}

function findOdds(text: string, excluded: Range[]): MarkedOdds[] {
  const found: MarkedOdds[] = [];
  const ranges: Range[] = [];
  for (const match of text.matchAll(/\bbetween\s+(\d+(?:\.\d+)?)\s+and\s+(\d+(?:\.\d+)?)/g)) {
    const range = rangeOf(match);
    if (overlaps(range, excluded)) continue;
    ranges.push(range);
    found.push({ ...range, operator: "gte", value: Number(match[1]) }, { ...range, operator: "lte", value: Number(match[2]) });
  }
  const regex = new RegExp(`(?<![a-z])(${COMPARISON})\\s*(?:odds?\\s*)?(?:of\\s*)?(\\d+(?:\\.\\d+)?)`, "g");
  for (const match of text.matchAll(regex)) {
    const range = rangeOf(match);
    if (overlaps(range, [...excluded, ...ranges])) continue;
    found.push({ ...range, operator: comparison(match[1]), value: Number(match[2]) });
  }
  return found.sort((a, b) => a.index - b.index);
}

function findOutcomes(text: string, excluded: Range[]): MarkedOutcome[] {
  const found: MarkedOutcome[] = [];
  const add = (regex: RegExp, outcome: Outcome) => {
    for (const match of text.matchAll(regex)) {
      const range = rangeOf(match);
      if (!overlaps(range, excluded)) found.push({ index: range.index, outcome });
    }
  };
  add(/\bhome\s*wins?\b|\bhosts?\s*wins?\b|\bhome\b/g, "home");
  add(/\baway\s*wins?\b|\baway\b/g, "away");
  add(/\bdraws?\b|\bdead.lock\b|\bties?\b/g, "draw");
  add(/(?<![.\d])\b1\b(?![.\d])/g, "home");
  add(/(?<![.\d])\b2\b(?![.\d])/g, "away");
  add(/\bx\b/g, "draw");
  return found.sort((a, b) => a.index - b.index);
}

export function parsePrompt(raw: string, knownLeagues: string[] = []): PromptFilter {
  const text = normalize(raw);
  const warnings: string[] = [];
  const { leagues, ranges: leagueRanges } = findLeagues(text, knownLeagues);
  const countMark = findCount(text);
  const unsupportedRanges: Range[] = [];
  for (const match of text.matchAll(/\b(?:confidence\s+between\s+\d+(?:\.\d+)?\s+and\s+\d+(?:\.\d+)?(?:\s*\/\s*10)?|(?:goals?\s+between\s+\d+(?:\.\d+)?\s+and\s+\d+(?:\.\d+)?|between\s+\d+(?:\.\d+)?\s+and\s+\d+(?:\.\d+)?\s+goals?))\b/g)) {
    unsupportedRanges.push(rangeOf(match));
    warnings.push(`“${match[0]}” is not supported and was not applied.`);
  }
  for (const match of text.matchAll(/\b(?:\d+(?:\.\d+)?\s*(?:total\s*)?(?:corners?|cards?)|(?:corners?|cards?)\s*(?:\w+\s*){0,3}\d+(?:\.\d+)?)\b/g)) {
    unsupportedRanges.push(rangeOf(match));
  }
  for (const match of text.matchAll(/\b(?:no|not|exclude|without|avoid)\s+(?:home(?:\s+wins?)?|away(?:\s+wins?)?|draws?|(?:over|under)\s*\d+(?:\.\d+)?(?:\s*goals?)?)\b/g)) {
    unsupportedRanges.push(rangeOf(match));
    warnings.push(`Exclusions such as “${match[0]}” are not supported and were not applied.`);
  }
  const initialRanges = [...leagueRanges, ...unsupportedRanges, ...(countMark ? [countMark] : [])];
  const scoreMatches = [...text.matchAll(/(?<![\d-])(?:(?:correct\s+score|score(?:line)?)\s*(?:(?:of|is)\s*|:\s*)?)?(\d{1,2})\s*[:-]\s*(\d{1,2})(?![\d-])/g)]
    .filter((match) => !overlaps(rangeOf(match), initialRanges));
  const scoreRanges = scoreMatches.map(rangeOf);
  const scores = new Set<string>();
  for (const match of scoreMatches) {
    const before = text.slice(Math.max(0, match.index! - 20), match.index!);
    if (/\bodds?\s*(?:of\s*)?$/.test(before)) {
      warnings.push("Fractional odds are not supported; use decimal odds instead.");
    } else if (/\b(?:at|kickoff|kick-off|time)\s*$/.test(before) && match[2].length === 2 && Number(match[1]) <= 23 && Number(match[2]) <= 59) {
      warnings.push("Kickoff-time conditions are not supported and were not applied.");
    } else {
      scores.add(`${Number(match[1])}:${Number(match[2])}`);
    }
  }
  if (scores.size > 1) warnings.push("Only one correct-score prediction can be filtered at a time.");
  const correctScore = scores.size === 1 ? [...scores][0] : null;
  const { confidence, ranges: confidenceRanges } = findConfidence(text, [...initialRanges, ...scoreRanges], warnings);
  const { goals, ranges: goalRanges } = findGoals(text, [...initialRanges, ...scoreRanges, ...confidenceRanges], warnings);
  const oddsMarks = findOdds(text, [...initialRanges, ...scoreRanges, ...confidenceRanges, ...goalRanges]);
  const outcomes = findOutcomes(text, [...initialRanges, ...scoreRanges, ...confidenceRanges, ...goalRanges, ...oddsMarks]);
  if (countMark?.anyWin && outcomes.length === 0) {
    outcomes.push({ index: countMark.end, outcome: "home" }, { index: countMark.end, outcome: "away" });
  }
  const uniqueOutcomes = [...new Set(outcomes.map((outcome) => outcome.outcome))];
  const odds: OddsClause[] = oddsMarks.map((mark) => {
    const before = text.slice(0, mark.index);
    const explicitTarget = before.match(/\b(home|away|draw)\s+(?:win\s+)?odds?\s*$/)?.[1] as Outcome | undefined;
    const nearestOutcome = outcomes.filter((outcome) => outcome.index < mark.index).at(-1);
    return { outcome: explicitTarget ?? (uniqueOutcomes.length === 1 ? nearestOutcome?.outcome : undefined) ?? "any", operator: mark.operator, value: mark.value };
  });
  for (let index = 0; index < oddsMarks.length - 1; index += 1) {
    if (oddsMarks[index].index === oddsMarks[index + 1].index && oddsMarks[index].value > oddsMarks[index + 1].value) {
      warnings.push("The lower odds in a range cannot be greater than the upper odds.");
    }
  }
  if (/\b(btts|both teams to score|double chance|handicap|corners?|cards?|clean sheets?)\b/.test(text)) {
    warnings.push("Markets such as both teams to score, double chance, handicaps, corners and cards are not available and were not applied.");
  }
  if (/\b(tomorrow|yesterday|next week|upcoming|scheduled|live|finished|postponed)\b|\b\d{4}-\d{2}-\d{2}\b/.test(text)) {
    warnings.push("Date and match-status conditions are not supported and were not applied.");
  }
  if (!leagues.length && /\b(?:in|from)\s+(?:the\s+)?[a-z][a-z0-9&.' -]{2,}/.test(text)) {
    warnings.push("No requested league matched the current fixture list, so a league filter was not applied.");
  }
  const count = countMark?.value ?? null;
  const summary: string[] = [];
  if (count !== null) summary.push(`${count} match(es)`);
  if (uniqueOutcomes.length) summary.push(`predicted ${uniqueOutcomes.map((outcome) => outcomeLabel(outcome).toLowerCase()).join(" or ")}`);
  for (const clause of odds) summary.push(`${clause.outcome === "any" ? "predicted" : clause.outcome} odds ${operatorText(clause.operator)} ${clause.value.toFixed(2)}`);
  if (goals) summary.push(`${goals === "O" ? "over" : "under"} 2.5 goals prediction`);
  if (correctScore) summary.push(`correct score ${correctScore}`);
  if (confidence) summary.push(`confidence ${operatorText(confidence.operator)} ${confidence.value}/10`);
  summary.push(...leagues);
  if (summary.length === 0) {
    summary.push("no conditions detected");
    warnings.push("No supported conditions were detected. Try a result, odds, 2.5 goals, confidence or an available league.");
  }
  return { count, outcomes: uniqueOutcomes, odds, leagues, goals, correctScore, confidence, warnings, summary, raw };
}

type FilterFixture = Pick<Fixture, "league" | "prediction" | "homeOdds" | "drawOdds" | "awayOdds"> & Partial<Pick<Fixture, "predictionPoints" | "overUnder" | "correctScore">>;

export function matchesFilter(fixture: FilterFixture, filter: PromptFilter): boolean {
  if (filter.leagues.length > 0 && !filter.leagues.some((league) => fixture.league.toLowerCase() === league.toLowerCase())) return false;
  if (filter.outcomes.length > 0 && !filter.outcomes.includes(fixture.prediction)) return false;
  if (filter.goals && fixture.overUnder !== filter.goals) return false;
  if (filter.correctScore && fixture.correctScore?.replace(/\s/g, "").replace("-", ":") !== filter.correctScore) return false;
  if (filter.confidence && (fixture.predictionPoints === undefined || !compare(fixture.predictionPoints, filter.confidence.operator, filter.confidence.value))) return false;
  for (const clause of filter.odds) {
    const outcome = clause.outcome === "any" ? fixture.prediction : clause.outcome;
    const value = outcome === "home" ? fixture.homeOdds : outcome === "draw" ? fixture.drawOdds : fixture.awayOdds;
    if (!compare(value, clause.operator, clause.value)) return false;
  }
  return true;
}

export function describeFilter(filter: PromptFilter): string {
  return filter.summary.join(" · ");
}
