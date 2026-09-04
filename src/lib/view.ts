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

/**
 * その級の最終ラウンド番号。
 * 級ごとにチーム数が違う（A級=8チーム、B級=4チーム など）ため、
 * 「決勝」「準決勝」の判定は必ず級を指定して行う。
 */
export function maxBracketRound(matches: Match[], tierKey?: string | null): number {
  const rounds = matches
    .filter((m) => m.stage === "bracket" && (tierKey === undefined || m.tier_key === tierKey))
    .map((m) => m.round ?? 0);
  return rounds.length > 0 ? Math.max(...rounds) : 0;
}

/** その試合が属する級の表示名（"Aトーナメント" など）。予選リーグなら空文字 */
export function tierName(match: Match, state: TournamentState): string {
  if (!match.tier_key) return "";
  const tier = state.tournament.bracket_tiers.find((t) => t.key === match.tier_key);
  return tier?.name ?? "";
}

/** 予選のリーグだけ（総当たり形式の級のリーグを除く） */
export function qualifyingLeagues(state: TournamentState) {
  return state.leagues.filter((l) => l.tier_key === null);
}

/** 総当たり形式の級のリーグを探す */
export function tierLeague(state: TournamentState, tierKey: string) {
  return state.leagues.find((l) => l.tier_key === tierKey);
}

/**
 * 総当たり形式の級に出場しているチーム。
 * チームの所属（teams.league_id）は予選リーグのままなので、
 * 出場者はその級の試合から拾う。
 */
export function tierLeagueTeams(state: TournamentState, tierKey: string): Team[] {
  const ids = new Set<string>();
  for (const m of state.matches) {
    if (m.tier_key !== tierKey || m.stage !== "league") continue;
    if (m.team_a_id) ids.add(m.team_a_id);
    if (m.team_b_id) ids.add(m.team_b_id);
  }
  return state.teams.filter((t) => ids.has(t.id));
}

/** 「①リーグ」「Aトーナメント 準決勝」など、その試合の所属を表す短い名前 */
export function matchGroupName(match: Match, state: TournamentState): string {
  if (match.stage === "league") {
    // 総当たり形式の級（例: Cリーグ）は、級の名前をそのまま出す
    if (match.tier_key) return tierName(match, state) || "順位別リーグ";
    const league = state.leagues.find((l) => l.id === match.league_id);
    return league ? `${league.name}リーグ` : "リーグ戦";
  }
  const round = bracketRoundName(
    match.round ?? 1,
    maxBracketRound(state.matches, match.tier_key),
    match.is_third_place
  );
  const tier = tierName(match, state);
  return tier ? `${tier} ${round}` : round;
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
