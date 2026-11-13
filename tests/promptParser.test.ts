import { strict as assert } from "node:assert";
import { test } from "node:test";
import { matchesFilter, parsePrompt } from "../lib/promptParser";

const homeFixture = {
  league: "League 2",
  prediction: "home" as const,
  homeOdds: 1.8,
  drawOdds: 3.5,
  awayOdds: 4.2,
};

test("match counts are not interpreted as outcomes", () => {
  const filter = parsePrompt("2 home wins");
  assert.equal(filter.count, 2);
  assert.deepEqual(filter.outcomes, ["home"]);
  assert.equal(matchesFilter(homeFixture, filter), true);
});

test("odds thresholds are not interpreted as outcomes", () => {
  const filter = parsePrompt("odds over 2");
  assert.deepEqual(filter.outcomes, []);
  assert.equal(matchesFilter(homeFixture, filter), false);
  assert.equal(matchesFilter({ ...homeFixture, prediction: "away" }, filter), true);
});

test("numbers in known league names are not outcomes", () => {
  const filter = parsePrompt("4 home wins in League 2", ["League 2"]);
  assert.deepEqual(filter.outcomes, ["home"]);
  assert.deepEqual(filter.leagues, ["League 2"]);
  assert.equal(matchesFilter(homeFixture, filter), true);
});

test("multiple requested outcomes are alternatives", () => {
  const filter = parsePrompt("home or draw");
  assert.equal(matchesFilter(homeFixture, filter), true);
  assert.equal(matchesFilter({ ...homeFixture, prediction: "draw" }, filter), true);
  assert.equal(matchesFilter({ ...homeFixture, prediction: "away" }, filter), false);
});

test("explicit outcome symbols and odds still work", () => {
  const filter = parsePrompt("2 over 2");
  assert.deepEqual(filter.outcomes, ["away"]);
  assert.deepEqual(filter.odds, [{ outcome: "away", operator: "gt", value: 2 }]);
  assert.equal(matchesFilter({ ...homeFixture, prediction: "away" }, filter), true);
});

test("supports word counts, odds ranges and boundary values", () => {
  const filter = parsePrompt("three home wins with odds between 1.5 and 2.5");
  assert.equal(filter.count, 3);
  assert.deepEqual(filter.outcomes, ["home"]);
  assert.deepEqual(filter.odds, [
    { outcome: "home", operator: "gte", value: 1.5 },
    { outcome: "home", operator: "lte", value: 2.5 },
  ]);
  assert.equal(matchesFilter({ ...homeFixture, homeOdds: 1.5 }, filter), true);
  assert.equal(matchesFilter({ ...homeFixture, homeOdds: 2.5 }, filter), true);
  assert.equal(matchesFilter({ ...homeFixture, homeOdds: 2.51 }, filter), false);
});

test("strict, inclusive and exact odds comparisons differ at the boundary", () => {
  for (const [prompt, expected] of [
    ["odds over 1.8", false], ["odds at least 1.8", true],
    ["odds under 1.8", false], ["odds at most 1.8", true],
    ["odds exactly 1.8", true], ["odds > 1.8", false], ["odds >= 1.8", true],
  ] as const) {
    assert.equal(matchesFilter(homeFixture, parsePrompt(prompt)), expected, prompt);
  }
});

test("supports confidence and 2.5-goal predictions without interpreting them as odds", () => {
  const filter = parsePrompt("10/10 confidence and over 2.5 goals");
  assert.deepEqual(filter.confidence, { operator: "eq", value: 10 });
  assert.equal(filter.goals, "O");
  assert.deepEqual(filter.odds, []);
  assert.deepEqual(filter.outcomes, []);
  assert.equal(matchesFilter({ ...homeFixture, predictionPoints: 10, overUnder: "O" }, filter), true);
  assert.equal(matchesFilter({ ...homeFixture, predictionPoints: 9, overUnder: "O" }, filter), false);
  assert.equal(matchesFilter({ ...homeFixture, predictionPoints: 10, overUnder: null }, filter), false);
});

test("supports minimum confidence without confusing it with odds", () => {
  for (const prompt of ["at least 8/10 confidence", "confidence at least 8", "at least 8 confidence", ">=8/10"]) {
    const filter = parsePrompt(prompt);
    assert.deepEqual(filter.confidence, { operator: "gte", value: 8 }, prompt);
    assert.deepEqual(filter.odds, [], prompt);
    assert.equal(matchesFilter({ ...homeFixture, predictionPoints: 9 }, filter), true);
    assert.equal(matchesFilter({ ...homeFixture, predictionPoints: 7 }, filter), false);
  }
});

test("generic win counts include home and away, but not draws", () => {
  const filter = parsePrompt("2 wins");
  assert.equal(filter.count, 2);
  assert.deepEqual(filter.outcomes, ["home", "away"]);
  assert.equal(matchesFilter({ ...homeFixture, prediction: "draw" }, filter), false);
  assert.equal(matchesFilter(homeFixture, filter), true);
});

test("distinguishes goal predictions from odds at the same line", () => {
  assert.equal(parsePrompt("over 2.5 goals").goals, "O");
  assert.equal(parsePrompt("goals below 2.5").goals, "U");
  const filter = parsePrompt("odds over 2.5");
  assert.equal(filter.goals, null);
  assert.deepEqual(filter.odds, [{ outcome: "any", operator: "gt", value: 2.5 }]);
});

test("multiple results use each fixture's predicted odds", () => {
  const filter = parsePrompt("away or draw with odds above 2");
  assert.deepEqual(filter.odds, [{ outcome: "any", operator: "gt", value: 2 }]);
  assert.equal(matchesFilter({ ...homeFixture, prediction: "draw", drawOdds: 2.1, awayOdds: 1.5 }, filter), true);
  assert.equal(matchesFilter({ ...homeFixture, prediction: "away", drawOdds: 3, awayOdds: 2 }, filter), false);
});

test("warns rather than applying unsupported or ambiguous conditions", () => {
  for (const prompt of ["home wins under 3.5 goals", "over 3.5", "home wins with btts", "at least 10 corners", "tomorrow's home wins", "confidence between 8 and 10", "between 1.5 and 2.5 goals"]) {
    const filter = parsePrompt(prompt);
    assert.ok(filter.warnings.length > 0, prompt);
    assert.deepEqual(filter.odds, [], prompt);
  }
});

test("does not turn a requested exclusion into a positive outcome", () => {
  const filter = parsePrompt("5 matches, no draws");
  assert.deepEqual(filter.outcomes, []);
  assert.ok(filter.warnings.some((warning) => warning.includes("Exclusions")));
});

test("supports correct-score predictions without treating score digits as outcomes", () => {
  const filter = parsePrompt("correct score 2-1");
  assert.equal(filter.correctScore, "2:1");
  assert.deepEqual(filter.outcomes, []);
  assert.equal(matchesFilter({ ...homeFixture, correctScore: "2:1" }, filter), true);
  assert.equal(matchesFilter({ ...homeFixture, correctScore: "1:2" }, filter), false);
  assert.equal(matchesFilter(homeFixture, filter), false);
  assert.equal(parsePrompt("2-1 correct score").correctScore, "2:1");
  assert.equal(parsePrompt("odds 2:1").correctScore, null);
  assert.ok(parsePrompt("odds 2:1").warnings.length > 0);
  assert.equal(parsePrompt("matches at 20:30").correctScore, null);
  assert.ok(parsePrompt("matches at 20:30").warnings.length > 0);
});

test("only matches exact league names and reports unknown leagues", () => {
  const filter = parsePrompt("home wins in Premier League", ["Premier League", "Premier League 2"]);
  assert.deepEqual(filter.leagues, ["Premier League"]);
  assert.equal(matchesFilter({ ...homeFixture, league: "Premier League 2" }, filter), false);
  assert.ok(parsePrompt("home wins in Unknown League", ["Premier League"]).warnings.length > 0);
  assert.ok(parsePrompt("show me a lucky pick").warnings.length > 0);
});

test("example home wins prompt filters on home odds", () => {
  const filter = parsePrompt("Find 4 home wins with odds over 1.60");
  assert.equal(filter.count, 4);
  assert.deepEqual(filter.outcomes, ["home"]);
  assert.equal(matchesFilter(homeFixture, filter), true);
  assert.equal(matchesFilter({ ...homeFixture, homeOdds: 1.5 }, filter), false);
});
