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
  assert.deepEqual(filter.odds, [{ outcome: "away", operator: "gte", value: 2 }]);
  assert.equal(matchesFilter({ ...homeFixture, prediction: "away" }, filter), true);
});

test("example home wins prompt filters on home odds", () => {
  const filter = parsePrompt("Find 4 home wins with odds over 1.60");
  assert.equal(filter.count, 4);
  assert.deepEqual(filter.outcomes, ["home"]);
  assert.equal(matchesFilter(homeFixture, filter), true);
  assert.equal(matchesFilter({ ...homeFixture, homeOdds: 1.5 }, filter), false);
});
