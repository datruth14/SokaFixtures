export type Outcome = "home" | "draw" | "away";

export type OddsSource = "live" | "model";

export type FixtureStatus =
  | "scheduled"
  | "live"
  | "finished"
  | "postponed"
  | "cancelled";

export interface Fixture {
  id: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  country: string;
  countryCode: string;
  time: string;
  isoDate: string;
  kickoff: number;
  homeOdds: number;
  drawOdds: number;
  awayOdds: number;
  oddsSource: OddsSource;
  prediction: Outcome;
  predictionPoints: number;
  correctScore: string;
  overUnder: "O" | "U";
  status: FixtureStatus;
}

export interface FixturesResponse {
  source: string;
  fetchedAt: string;
  cached: boolean;
  count: number;
  fixtures: Fixture[];
}