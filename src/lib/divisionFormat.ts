import { normalizeTiers } from "./tiers";
import type { BracketTier, Division, Tournament } from "./types";

export function divisionLeagueCount(division: Division, tournament: Tournament): number {
  return Math.max(1, Math.trunc(division.league_count ?? tournament.league_count));
}

export function divisionCourts(division: Division, tournament: Tournament): string[] {
  return division.courts && division.courts.length > 0 ? division.courts : tournament.courts;
}

export function divisionTiers(division: Division, tournament: Tournament): BracketTier[] {
  return division.bracket_tiers ? normalizeTiers(division.bracket_tiers) : tournament.bracket_tiers;
}

export function divisionGameLabels(division: Division): string[] {
  return division.game_labels?.filter(Boolean) ?? [];
}

export const TOCO_FIVE_TEAM_ORDER = [
  [0, 1], [2, 3], [0, 4], [1, 2], [3, 4],
  [0, 2], [1, 3], [2, 4], [0, 3], [1, 4],
] as const;
