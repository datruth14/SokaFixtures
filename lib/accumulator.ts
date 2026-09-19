import type { Fixture, Outcome } from "./types";
import { priceFor, round2 } from "./odds";

export interface AccaLeg {
  fixture: Fixture;
  outcome: Outcome;
}

export interface Acca {
  id: string;
  legs: AccaLeg[];
  totalOdds: number;
}

let slipSeq = 0;

export function nextId(): string {
  slipSeq += 1;
  return `slip-${Date.now().toString(36)}-${slipSeq}`;
}

export function totalAccaOdds(legs: AccaLeg[]): number {
  if (legs.length === 0) return 0;
  const product = legs.reduce((acc, leg) => acc * priceFor(leg.fixture, leg.outcome), 1);
  return round2(product);
}

export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function pickLegs(
  pool: Fixture[],
  size: number,
  rng: () => number = Math.random,
): AccaLeg[] {
  return shuffle(pool, rng)
    .slice(0, size)
    .map((fixture) => ({ fixture, outcome: fixture.prediction }));
}

export function generateSlips(
  pool: Fixture[],
  size: number,
  count = 5,
  rng: () => number = Math.random,
): Acca[] {
  const shuffled = shuffle(pool, rng);
  const slips: Acca[] = [];

  for (let i = 0; i < count; i += 1) {
    const start = i * size;
    if (start + size > shuffled.length) break;
    const legs = shuffled
      .slice(start, start + size)
      .map((fixture) => ({ fixture, outcome: fixture.prediction }));
    slips.push({ id: nextId(), legs, totalOdds: totalAccaOdds(legs) });
  }

  return slips.sort((a, b) => b.totalOdds - a.totalOdds);
}

export function computePayout(
  stake: number,
  odds: number,
): { gross: number; net: number } {
  const gross = round2(stake * odds);
  return { gross, net: round2(gross - stake) };
}