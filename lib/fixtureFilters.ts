import type { Fixture, Outcome } from "./types";

export interface FixtureFilters {
  league: string;
  confidence: number | null;
  outcome: Outcome | "any";
  goals: "O" | "U" | "any";
}

export const EMPTY_FIXTURE_FILTERS: FixtureFilters = {
  league: "",
  confidence: null,
  outcome: "any",
  goals: "any",
};

export function fixtureLeagueKey(fixture: Pick<Fixture, "country" | "league">): string {
  return JSON.stringify([fixture.country ?? "", fixture.league]);
}

export function matchesFixtureFilters(fixture: Fixture, filters: FixtureFilters): boolean {
  return (
    (!filters.league || fixtureLeagueKey(fixture) === filters.league) &&
    (filters.confidence === null || fixture.predictionPoints === filters.confidence) &&
    (filters.outcome === "any" || fixture.prediction === filters.outcome) &&
    (filters.goals === "any" || fixture.overUnder === filters.goals)
  );
}

export function availableFixtureLeagues(
  fixtures: Fixture[],
  filters: FixtureFilters,
  matchesPrompt: (fixture: Fixture) => boolean = () => true,
): Array<{ value: string; label: string; count: number }> {
  const leagues = new Map<string, { value: string; label: string; count: number }>();
  const otherFilters = { ...filters, league: "" };
  for (const fixture of fixtures) {
    if (
      !["home", "draw", "away"].includes(fixture.prediction) ||
      !matchesFixtureFilters(fixture, otherFilters) ||
      !matchesPrompt(fixture)
    ) continue;
    const value = fixtureLeagueKey(fixture);
    const league = leagues.get(value);
    if (league) {
      league.count += 1;
    } else {
      leagues.set(value, {
        value,
        label: [fixture.country, fixture.league].filter(Boolean).join(" · "),
        count: 1,
      });
    }
  }
  return [...leagues.values()].sort((a, b) => a.label.localeCompare(b.label));
}
