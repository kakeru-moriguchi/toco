export type Phase = "setup" | "league" | "bracket" | "finished";

/** 1セット分のスコア */
export type SetScore = { a: number; b: number };
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
 * 「級」が各リーグの誰を対象にするかの指定方法。
 *  top    … 上位から。1位〜2位 など
 *  bottom … 下位から。最下位から1つ など
 *  rest   … 他の級に入らなかった残り全部
 *
 * リーグごとにチーム数が違っても（①5チーム・②③4チーム など）、
 * bottom と rest を使えば「最下位はCへ、間はBへ」が設定を変えずに成立する。
 * 当日欠場でチーム数が変わっても振り分けが崩れない。
 */
export type TierMode = "top" | "bottom" | "rest";

/** 級の進め方。トーナメント戦か、総当たりか。 */
export type TierFormat = "bracket" | "league";

/**
 * 順位別ラウンドの「級」の定義。
 * 例: Aトーナメント = 各リーグ上位2 / Bトーナメント = 残り / Cリーグ = 各リーグ最下位
 */
export type BracketTier = {
  /** 内部キー（matches.tier_key と対応。変更しない） */
  key: string;
  /** 表示名。例 "Aトーナメント" */
  name: string;
  /** 対象の選び方 */
  mode: TierMode;
  /** mode==='top' のとき使う（1位始まり、両端を含む） */
  from_rank: number;
  to_rank: number;
  /** mode==='bottom' のとき使う。最下位から何チームか */
  bottom_count: number;
  /** 進め方 */
  format: TierFormat;
  /** トーナメントのとき、3位決定戦を行うか */
  third_place: boolean;
};

export const DEFAULT_BRACKET_TIERS: BracketTier[] = [
  {
    key: "A",
    name: "Aトーナメント",
    mode: "top",
    from_rank: 1,
    to_rank: 2,
    bottom_count: 1,
    format: "bracket",
    third_place: true,
  },
  {
    key: "B",
    name: "Bトーナメント",
    mode: "rest",
    from_rank: 3,
    to_rank: 3,
    bottom_count: 1,
    format: "bracket",
    third_place: true,
  },
  {
    key: "C",
    name: "Cリーグ",
    mode: "bottom",
    from_rank: 4,
    to_rank: 4,
    bottom_count: 1,
    format: "league",
    third_place: false,
  },
];

export const TIER_MODE_LABELS: Record<TierMode, string> = {
  top: "上位から",
  bottom: "下位から",
  rest: "残り全部",
};

export const TIER_FORMAT_LABELS: Record<TierFormat, string> = {
  bracket: "トーナメント",
  league: "総当たり",
};

export type Tournament = {
  id: string;
  name: string;
  event_date: string | null;
  venue: string;
  note: string;
  league_count: number;
  teams_per_league: number;
  point_target: number;
  /** 試合形式。1 = 1セットのみ、2 = 3ゲームすべて実施、3 = 5セット中3セット先取 */
  sets_to_win: number;
  start_time: string;
  minutes_per_match: number;
  courts: string[];
  tiebreakers: Tiebreaker[];
  bracket_tiers: BracketTier[];
  phase: Phase;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TournamentSummary = Pick<
  Tournament,
  "id" | "name" | "event_date" | "venue" | "phase" | "archived_at" | "created_at" | "updated_at"
>;

export type League = {
  id: string;
  tournament_id: string;
  name: string;
  sort_order: number;
  /** 総当たり形式の級のリーグなら級のキー。予選リーグは null。 */
  tier_key: string | null;
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
  /** 各セットのスコア。[{a:11,b:7},{a:9,b:11},{a:11,b:5}] */
  sets: SetScore[];
  /** 全セットの合計点。順位表の得点・失点に使う */
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
