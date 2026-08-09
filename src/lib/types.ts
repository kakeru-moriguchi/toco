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

/**
 * 順位別トーナメントの「級」の定義。
 * 例: A級 = 各リーグ1〜2位 / B級 = 各リーグ3位 / C級 = 各リーグ4位
 * 対象順位を範囲で持たせているので、チーム数やリーグ数が変わっても使い回せる。
 */
export type BracketTier = {
  /** 内部キー（matches.tier_key と対応。変更しない） */
  key: string;
  /** 表示名。例 "A級" */
  name: string;
  /** 対象にする順位の範囲（1位始まり、両端を含む） */
  from_rank: number;
  to_rank: number;
  /** その級で3位決定戦を行うか */
  third_place: boolean;
};

export const DEFAULT_BRACKET_TIERS: BracketTier[] = [
  { key: "A", name: "A級", from_rank: 1, to_rank: 2, third_place: true },
  { key: "B", name: "B級", from_rank: 3, to_rank: 3, third_place: false },
  { key: "C", name: "C級", from_rank: 4, to_rank: 4, third_place: false },
];

export type Tournament = {
  id: string;
  name: string;
  event_date: string | null;
  venue: string;
  note: string;
  league_count: number;
  teams_per_league: number;
  point_target: number;
  start_time: string;
  minutes_per_match: number;
  courts: string[];
  tiebreakers: Tiebreaker[];
  bracket_tiers: BracketTier[];
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
  /** トーナメントの場合、どの級の試合か（BracketTier.key）。リーグ戦は null */
  tier_key: string | null;
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
