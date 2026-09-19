import type { Fixture, Outcome } from "./types";

export const BOOK_OVERROUND = 1.06;

export interface ModelPrices {
  homeOdds: number;
  drawOdds: number;
  awayOdds: number;
}

export const round2 = (n: number): number => Math.round(n * 100) / 100;

export function deriveModelPrices(
  prediction: Outcome,
  points: number,
): ModelPrices {
  const clamped = Math.min(10, Math.max(2, points));
  const base = (clamped - 2) / 8;
  const predictedProbability = 0.34 + base * 0.46;

  let ph: number;
  let pd: number;
  let pa: number;

  if (prediction === "draw") {
    pd = predictedProbability;
    ph = (1 - pd) / 2;
    pa = (1 - pd) / 2;
  } else if (prediction === "home") {
    ph = predictedProbability;
    pd = (1 - ph) * 0.38;
    pa = Math.max(0.001, 1 - ph - pd);
  } else {
    pa = predictedProbability;
    pd = (1 - pa) * 0.38;
    ph = Math.max(0.001, 1 - pa - pd);
  }

  const price = (p: number) => round2(1 / (p * BOOK_OVERROUND));

  return {
    homeOdds: price(ph),
    drawOdds: price(pd),
    awayOdds: price(pa),
  };
}

export function priceFor(fixture: Fixture, outcome: Outcome): number {
  switch (outcome) {
    case "home":
      return fixture.homeOdds;
    case "draw":
      return fixture.drawOdds;
    case "away":
      return fixture.awayOdds;
  }
}

export function outcomeLabel(outcome: Outcome): string {
  switch (outcome) {
    case "home":
      return "Home";
    case "draw":
      return "Draw";
    case "away":
      return "Away";
  }
}

export function predictionSymbol(outcome: Outcome): number | string {
  switch (outcome) {
    case "home":
      return 1;
    case "draw":
      return "X";
    case "away":
      return 2;
  }
}