import { strict as assert } from "node:assert";
import { test } from "node:test";
import { fetchFixturesViaApi, parseHtmlFixtures } from "../lib/scraper";

test("only show over/under predictions supplied by the API", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json([{
    id: "league",
    name: "League",
    countryName: "Country",
    countryCode: "CO",
    events: [
      { id: "1", timeStart: 1700000000, time: "12:00", homeTeam: "A", awayTeam: "B", prediction1x2: 1, predictionOu: "O" },
      { id: "2", timeStart: 1700000001, time: "12:30", homeTeam: "C", awayTeam: "D", prediction1x2: 1, predictionOu: "U" },
      { id: "3", timeStart: 1700000002, time: "13:00", homeTeam: "E", awayTeam: "F", prediction1x2: 1 },
    ],
  }]);
  try {
    const fixtures = await fetchFixturesViaApi(new Date("2024-01-01"));
    assert.deepEqual(fixtures.map((fixture) => fixture.overUnder), ["O", "U", null]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HTML fallback does not invent an under prediction", () => {
  const fixtures = parseHtmlFixtures(`<script type="application/ld+json">${JSON.stringify({
    "@type": "SportsEvent",
    homeTeam: "A",
    awayTeam: "B",
    startDate: "2024-01-01T12:00:00Z",
  })}</script>`);
  assert.equal(fixtures.length, 1);
  assert.equal(fixtures[0].overUnder, null);
});
