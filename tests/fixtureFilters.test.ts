import { strict as assert } from "node:assert";
import { test } from "node:test";
import { EMPTY_FIXTURE_FILTERS, availableFixtureLeagues, fixtureLeagueKey, matchesFixtureFilters } from "../lib/fixtureFilters";
import { matchesFilter, parsePrompt } from "../lib/promptParser";
import { generateSlips } from "../lib/accumulator";
import type { Fixture } from "../lib/types";

const fixture: Fixture = {
  id: "1", homeTeam: "A", awayTeam: "B", league: "Premier League", country: "England",
  countryCode: "GB", time: "12:00", isoDate: "2026-11-13", kickoff: 1794571200,
  homeOdds: 1.5, drawOdds: 4, awayOdds: 6, oddsSource: "model", prediction: "home",
  predictionPoints: 10, correctScore: "2:1", overUnder: "O", status: "scheduled",
};

test("filters combine league, exact confidence, result and goals", () => {
  const filters = { league: fixtureLeagueKey(fixture), confidence: 10, outcome: "home" as const, goals: "O" as const };
  assert.equal(matchesFixtureFilters(fixture, filters), true);
  assert.equal(matchesFixtureFilters({ ...fixture, predictionPoints: 9 }, filters), false);
  assert.equal(matchesFixtureFilters({ ...fixture, prediction: "away" }, filters), false);
  assert.equal(matchesFixtureFilters({ ...fixture, overUnder: "U" }, filters), false);
  assert.equal(matchesFixtureFilters({ ...fixture, overUnder: null }, filters), false);
});

test("same league names in different countries are distinct", () => {
  const filters = { ...EMPTY_FIXTURE_FILTERS, league: fixtureLeagueKey(fixture) };
  assert.equal(matchesFixtureFilters(fixture, filters), true);
  assert.equal(matchesFixtureFilters({ ...fixture, country: "Scotland" }, filters), false);
});

test("cleared filters accept every fixture and combine with prompt filters", () => {
  const prompt = parsePrompt("home wins over 1.60");
  assert.equal(matchesFixtureFilters(fixture, EMPTY_FIXTURE_FILTERS), true);
  assert.equal(matchesFilter(fixture, prompt), false);
  assert.equal(matchesFilter({ ...fixture, homeOdds: 1.8 }, prompt), true);
});

test("league options only include predictions matching the other filters", () => {
  const others: Fixture[] = [
    { ...fixture, id: "2", predictionPoints: 9 },
    { ...fixture, id: "3", league: "Championship", predictionPoints: 9 },
    { ...fixture, id: "4", country: "Scotland" },
    { ...fixture, id: "5", league: "Unknown", prediction: null as unknown as Fixture["prediction"] },
  ];
  const leagues = availableFixtureLeagues([fixture, ...others], {
    ...EMPTY_FIXTURE_FILTERS,
    league: fixtureLeagueKey(fixture),
    confidence: 10,
  }, (match) => match.country !== "Scotland");
  assert.deepEqual(leagues, [{ value: fixtureLeagueKey(fixture), label: "England · Premier League", count: 1 }]);
});

test("generated slips use only fixtures matching the selected confidence", () => {
  const fixtures = [
    fixture,
    { ...fixture, id: "2" },
    { ...fixture, id: "3" },
    { ...fixture, id: "4", predictionPoints: 9 },
  ];
  const pool = fixtures.filter((match) => matchesFixtureFilters(match, {
    ...EMPTY_FIXTURE_FILTERS,
    confidence: 10,
  }));
  const slips = generateSlips(pool, 3, 5, () => 0.5);
  assert.equal(slips.length, 1);
  assert.equal(slips[0].legs.length, 3);
  assert.ok(slips[0].legs.every((leg) => leg.fixture.predictionPoints === 10));
  assert.equal(generateSlips(pool, 5).length, 0);
});
