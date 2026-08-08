import { bracketRoundName } from "./bracket";
import type { League, Match, Slot, Team, TournamentState } from "./types";

/** 表示用のちょっとした変換をまとめたもの */

export function teamById(teams: Team[], id: string | null): Team | undefined {
  if (!id) return undefined;
  return teams.find((t) => t.id === id);
}

/** 対戦相手の表示名。未確定なら「Aリーグ1位」等のラベルを返す。 */
export function sideName(match: Match, slot: Slot, teams: Team[]): string {
  const id = slot === "a" ? match.team_a_id : match.team_b_id;
  const team = teamById(teams, id);
  if (team) return team.name;
  const label = slot === "a" ? match.team_a_label : match.team_b_label;
  return label || "未定";
}

export function sideDecided(match: Match, slot: Slot): boolean {
  return Boolean(slot === "a" ? match.team_a_id : match.team_b_id);
}

export function isReady(match: Match): boolean {
  return Boolean(match.team_a_id && match.team_b_id);
}

export function maxBracketRound(matches: Match[]): number {
  const rounds = matches.filter((m) => m.stage === "bracket").map((m) => m.round ?? 0);
  return rounds.length > 0 ? Math.max(...rounds) : 0;
}

/** 「Aリーグ」「準決勝」など、その試合の所属を表す短い名前 */
export function matchGroupName(match: Match, state: TournamentState): string {
  if (match.stage === "league") {
    const league = state.leagues.find((l) => l.id === match.league_id);
    return league ? `${league.name}リーグ` : "リーグ戦";
  }
  return bracketRoundName(match.round ?? 1, maxBracketRound(state.matches), match.is_third_place);
}

export function leagueName(league: League | undefined): string {
  return league ? `${league.name}リーグ` : "";
}

/** 進行表の並び順（試合番号 → 時間） */
export function sortMatches(matches: Match[]): Match[] {
  return [...matches].sort((a, b) => {
    if (a.match_no !== b.match_no) return a.match_no - b.match_no;
    return a.scheduled_at.localeCompare(b.scheduled_at);
  });
}

/** 「次はどの試合？」用: まだ終わっていない試合を先頭から数件 */
export function upcomingMatches(matches: Match[], limit = 3): Match[] {
  return sortMatches(matches)
    .filter((m) => m.status !== "done")
    .slice(0, limit);
}

export function formatDate(value: string | null): string {
  if (!value) return "";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  const week = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${week})`;
}

export function scoreText(match: Match): string {
  if (match.score_a === null || match.score_b === null) return "";
  return `${match.score_a} - ${match.score_b}`;
}
