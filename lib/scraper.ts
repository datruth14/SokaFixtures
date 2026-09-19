import * as cheerio from "cheerio";
import type {
  Fixture,
  FixtureStatus,
  FixturesResponse,
  OddsSource,
  Outcome,
} from "./types";
import { deriveModelPrices, round2 } from "./odds";

const BASE_URL = "https://www.soccervista.com";

const HEADERS = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "X-Requested-With": "XMLHttpRequest",
};

const CACHE_TTL_MS = 15 * 60 * 1000;

interface CacheEntry {
  key: string;
  data: FixturesResponse;
  at: number;
}

let cache: CacheEntry | null = null;

interface RawEvent {
  id: string;
  timeStart: number;
  time: string;
  homeTeam: string;
  awayTeam: string;
  homeEventParticipantId?: string;
  awayEventParticipantId?: string;
  odds?: Array<Record<string, unknown>>;
  isLive?: boolean;
  isFinished?: boolean;
  isScheduled?: boolean;
  isPaused?: boolean;
  isPostponed?: boolean;
  isCancelled?: boolean;
  prediction1x2?: number | string;
  predictionOu?: string;
  predictionScore?: string;
  predictionPoints?: number;
}

interface RawTournament {
  id: string;
  name: string;
  countryName: string;
  countryCode: string;
  events: RawEvent[];
}

interface RawOddsRow {
  odds_1?: number;
  odds_x?: number;
  odds_2?: number;
  odds_home?: number;
  odds_draw?: number;
  odds_away?: number;
  homeEventParticipantId?: string;
  awayEventParticipantId?: string;
}

function ddMMyyyy(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${date.getFullYear()}`;
}

function isoDateFromEpoch(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

function toStatus(event: RawEvent): FixtureStatus {
  if (event.isCancelled) return "cancelled";
  if (event.isPostponed) return "postponed";
  if (event.isLive) return "live";
  if (event.isFinished) return "finished";
  return "scheduled";
}

function toOutcome(value: number | string | undefined): Outcome | null {
  if (value === 1 || value === "1") return "home";
  if (value === 2 || value === "2") return "away";
  if (value === "X" || value === "x") return "draw";
  return null;
}

function mapEvent(
  event: RawEvent,
  tournament: RawTournament,
  source: OddsSource,
): Fixture | null {
  const prediction = toOutcome(event.prediction1x2);
  if (!prediction) return null;

  const points = event.predictionPoints ?? 3;
  const prices = deriveModelPrices(prediction, points);

  return {
    id: event.id,
    homeTeam: event.homeTeam,
    awayTeam: event.awayTeam,
    league: tournament.name,
    country: tournament.countryName,
    countryCode: tournament.countryCode,
    time: event.time,
    isoDate: isoDateFromEpoch(event.timeStart),
    kickoff: event.timeStart,
    homeOdds: prices.homeOdds,
    drawOdds: prices.drawOdds,
    awayOdds: prices.awayOdds,
    oddsSource: source,
    prediction,
    predictionPoints: points,
    correctScore: event.predictionScore ?? "",
    overUnder: event.predictionOu === "O" ? "O" : "U",
    status: toStatus(event),
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function oddsRowPrice(row: RawOddsRow, key: 1 | "x" | 2): number | null {
  const raw =
    key === 1
      ? row.odds_1 ?? row.odds_home
      : key === "x"
        ? row.odds_x ?? row.odds_draw
        : row.odds_2 ?? row.odds_away;
  const value = typeof raw === "number" && Number.isFinite(raw) ? raw : Number(raw);
  return typeof value === "number" && Number.isFinite(value) && value > 1 ? value : null;
}

async function attachLiveOdds(
  tournaments: RawTournament[],
  fixturesByTournament: Map<string, Fixture[]>,
): Promise<void> {
  const jobs = tournaments
    .map((t) => ({
      tournament: t,
      ids: t.events
        .filter((e) => e.homeEventParticipantId && e.awayEventParticipantId)
        .map(
          (e) => `${e.homeEventParticipantId}_${e.awayEventParticipantId}`,
        ),
    }))
    .filter((j) => j.ids.length > 0);

  for (const group of chunk(jobs, 6)) {
    await Promise.all(
      group.map(async ({ tournament, ids }) => {
        try {
          const url = `${BASE_URL}/events/${tournament.id}/pre-match-odds-batch?events=${ids.join(",")}`;
          const res = await fetch(url, {
            headers: HEADERS,
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) return;
          const rows = (await res.json()) as RawOddsRow[];
          if (!Array.isArray(rows)) return;

          const fixtures = fixturesByTournament.get(tournament.id) ?? [];
          rows.forEach((row, idx) => {
            const fixture = fixtures[idx];
            if (!fixture) return;
            const home = oddsRowPrice(row, 1);
            const draw = oddsRowPrice(row, "x");
            const away = oddsRowPrice(row, 2);
            if (home !== null && draw !== null && away !== null) {
              fixture.homeOdds = round2(home);
              fixture.drawOdds = round2(draw);
              fixture.awayOdds = round2(away);
              fixture.oddsSource = "live";
            }
          });
        } catch {
          /* odds are best effort */
        }
      }),
    );
  }
}

export async function fetchFixturesViaApi(date: Date): Promise<Fixture[]> {
  const key = ddMMyyyy(date);
  const res = await fetch(`${BASE_URL}/events/by/date/${key}/`, {
    headers: HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`SoccerVista API responded with HTTP ${res.status}`);
  }
  const data = (await res.json()) as RawTournament[];
  if (!Array.isArray(data)) {
    throw new Error("SoccerVista API returned an unexpected payload");
  }

  const fixturesByTournament = new Map<string, Fixture[]>();
  const fixtures: Fixture[] = [];

  for (const tournament of data) {
    const mapped = tournament.events
      .map((event) => mapEvent(event, tournament, "model"))
      .filter((f): f is Fixture => f !== null);
    fixturesByTournament.set(tournament.id, mapped);
    fixtures.push(...mapped);
  }

  await attachLiveOdds(data, fixturesByTournament);

  fixtures.sort((a, b) => a.kickoff - b.kickoff);
  return fixtures;
}

function jsonLdString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "name" in value) {
    return String((value as { name: unknown }).name ?? "");
  }
  return "";
}

export function parseHtmlFixtures(
  html: string,
  fallbackLeague = "International",
  fallbackCountry = "World",
): Fixture[] {
  const $ = cheerio.load(html);
  const fixtures: Fixture[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse($(el).text());
    } catch {
      return;
    }
    const nodes = Array.isArray(parsed) ? parsed : [parsed];
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const obj = node as Record<string, unknown>;
      const type = obj["@type"];
      const isSport =
        String(type ?? "").includes("SportsEvent") ||
        (String(type ?? "").includes("Event") && Boolean(obj["sport"]));
      if (!isSport) continue;

      const home =
        typeof obj["homeTeam"] === "object"
          ? jsonLdString((obj["homeTeam"] as Record<string, unknown>)["name"])
          : jsonLdString(obj["homeTeam"]);
      const away =
        typeof obj["awayTeam"] === "object"
          ? jsonLdString((obj["awayTeam"] as Record<string, unknown>)["name"])
          : jsonLdString(obj["awayTeam"]);
      if (!home || !away) continue;

      const startDate =
        typeof obj["startDate"] === "string" ? new Date(obj["startDate"]) : new Date();
      const kickoff = Math.floor(startDate.getTime() / 1000);
      const prediction = "home";
      const points = 5;
      const prices = deriveModelPrices(prediction, points);

      fixtures.push({
        id: `html-${fixtures.length}-${kickoff}`,
        homeTeam: home,
        awayTeam: away,
        league: jsonLdString(obj["sport"]) || fallbackLeague,
        country: fallbackCountry,
        countryCode: "WC",
        time: startDate.toTimeString().slice(0, 5),
        isoDate: startDate.toISOString().slice(0, 10),
        kickoff,
        homeOdds: prices.homeOdds,
        drawOdds: prices.drawOdds,
        awayOdds: prices.awayOdds,
        oddsSource: "model",
        prediction,
        predictionPoints: points,
        correctScore: "",
        overUnder: "U",
        status: "scheduled",
      });
    }
  });

  return fixtures;
}

export async function fetchFixturesViaHtml(date: Date): Promise<Fixture[]> {
  const res = await fetch(`${BASE_URL}/`, {
    headers: HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`SoccerVista HTML responded with HTTP ${res.status}`);
  const html = await res.text();
  const fixtures = parseHtmlFixtures(html);
  if (fixtures.length === 0) {
    throw new Error("No fixtures could be parsed from SoccerVista");
  }
  return fixtures;
}

export async function getFixtures(
  options: { date?: Date; refresh?: boolean } = {},
): Promise<FixturesResponse> {
  const date = options.date ?? new Date();
  const key = ddMMyyyy(date);

  if (!options.refresh && cache && cache.key === key) {
    const age = Date.now() - cache.at;
    if (age < CACHE_TTL_MS) {
      return { ...cache.data, cached: true };
    }
  }

  const attempts: Array<{ label: string; run: () => Promise<Fixture[]> }> = [
    { label: "soccervista-api", run: () => fetchFixturesViaApi(date) },
    { label: "soccervista-html", run: () => fetchFixturesViaHtml(date) },
  ];

  const failures: string[] = [];
  for (const attempt of attempts) {
    try {
      const fixtures = await attempt.run();
      const body: FixturesResponse = {
        source: attempt.label,
        fetchedAt: new Date().toISOString(),
        cached: false,
        count: fixtures.length,
        fixtures,
      };
      cache = { key, data: body, at: Date.now() };
      return body;
    } catch (error) {
      failures.push(`${attempt.label}: ${(error as Error).message}`);
    }
  }

  throw new Error(`All SoccerVista sources failed. ${failures.join(" | ")}`);
}