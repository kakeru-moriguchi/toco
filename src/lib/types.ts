export type Phase = "setup" | "league" | "bracket" | "finished";
export type Stage = "league" | "bracket";
export type MatchStatus = "pending" | "in_progress" | "done";
export type Slot = "a" | "b";

/** 順位決定の基準。並び順を変えるだけで同率時のルールを差し替えられる。 */
export type Tiebreaker =
  | "wins"
  | "diff"
  | "points_for"
  | "points_against"
  | "head_to_head"
  | "win_rate";

export type Tournament = {
  id: string;
  name: string;
  event_date: string | null;
  venue: string;
  note: string;
  league_count: number;
  teams_per_league: number;
  advance_per_league: number;
  point_target: number;
  third_place_match: boolean;
  start_time: string;
  minutes_per_match: number;
  courts: string[];
  tiebreakers: Tiebreaker[];
  phase: Phase;
};

export type League = {
  id: string;
  tournament_id: string;
  name: string;
  sort_order: number;
};

export type Team = {
  id: string;
  tournament_id: string;
  league_id: string | null;
  name: string;
  members: string;
  sort_order: number;
};

export type Match = {
  id: string;
  tournament_id: string;
  stage: Stage;
  league_id: string | null;
  round: number | null;
  bracket_index: number | null;
  is_third_place: boolean;
  match_no: number;
  court: string;
  scheduled_at: string;
  status: MatchStatus;
  team_a_id: string | null;
  team_b_id: string | null;
  team_a_label: string;
  team_b_label: string;
  score_a: number | null;
  score_b: number | null;
  winner_team_id: string | null;
  next_match_id: string | null;
  next_slot: Slot | null;
  loser_next_match_id: string | null;
  loser_next_slot: Slot | null;
  reported_at: string | null;
  reported_by: string | null;
};

/** 参加者画面が使う「大会の全状態」。1回の取得でどの画面も描ける。 */
export type TournamentState = {
  tournament: Tournament;
  leagues: League[];
  teams: Team[];
  matches: Match[];
};

export const TIEBREAKER_LABELS: Record<Tiebreaker, string> = {
  wins: "勝数",
  win_rate: "勝率",
  diff: "得失点差",
  points_for: "総得点",
  points_against: "総失点の少なさ",
  head_to_head: "直接対決の結果",
};

export const STATUS_LABELS: Record<MatchStatus, string> = {
  pending: "待機中",
  in_progress: "試合中",
  done: "終了",
};
