import { normalizeTiers } from "./tiers";
import type { BracketTier, Division, Tiebreaker, Tournament } from "./types";

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

export function divisionTeamsPerLeague(division: Division, tournament: Tournament): number {
  return Math.max(2, Math.trunc(division.teams_per_league ?? tournament.teams_per_league));
}

export function divisionPointTarget(division: Division, tournament: Tournament): number {
  return Math.max(1, Math.trunc(division.point_target ?? tournament.point_target));
}

export function divisionSetsToWin(division: Division, tournament: Tournament): number {
  return Math.max(1, Math.trunc(division.sets_to_win ?? tournament.sets_to_win));
}

export function divisionStartTime(division: Division, tournament: Tournament): string {
  return division.start_time || tournament.start_time;
}

export function divisionFinalsStartTime(division: Division, tournament: Tournament): string {
  return division.finals_start_time || division.start_time || tournament.start_time;
}

export function divisionQualifyingMinutes(division: Division, tournament: Tournament): number {
  return Math.max(5, Math.trunc(division.qualifying_minutes_per_match ?? tournament.minutes_per_match));
}

export function divisionFinalsMinutes(division: Division, tournament: Tournament): number {
  return Math.max(5, Math.trunc(division.finals_minutes_per_match ?? tournament.minutes_per_match));
}

export function divisionTiebreakers(division: Division, tournament: Tournament): Tiebreaker[] {
  return division.tiebreakers && division.tiebreakers.length > 0 ? division.tiebreakers : tournament.tiebreakers;
}

/** 既存画面が Tournament を参照しても、選択部門の実効設定だけを受け取れるようにする。 */
export function tournamentForDivision(tournament: Tournament, division: Division): Tournament {
  return {
    ...tournament,
    league_count: divisionLeagueCount(division, tournament),
    teams_per_league: divisionTeamsPerLeague(division, tournament),
    point_target: divisionPointTarget(division, tournament),
    sets_to_win: divisionSetsToWin(division, tournament),
    start_time: divisionStartTime(division, tournament),
    minutes_per_match: divisionQualifyingMinutes(division, tournament),
    courts: divisionCourts(division, tournament),
    tiebreakers: divisionTiebreakers(division, tournament),
    bracket_tiers: divisionTiers(division, tournament),
  };
}

export const TOCO_FIVE_TEAM_ORDER = [
  [0, 1], [2, 3], [0, 4], [1, 2], [3, 4],
  [0, 2], [1, 3], [2, 4], [0, 3], [1, 4],
] as const;
