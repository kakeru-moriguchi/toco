import type { Match, Team, Tiebreaker } from "./types";

/**
 * 順位計算ロジック（独立モジュール）
 * ------------------------------------------------------------
 * 同率時のルールを後から変更できるように、比較条件は tiebreakers 配列で
 * 外から渡す設計にしている。大会設定（tournaments.tiebreakers）を
 * 差し替えるだけでルールが変わり、この関数を呼ぶ画面側は一切変更不要。
 */

export type StandingRow = {
  teamId: string;
  teamName: string;
  members: string;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
  rank: number;
  /** 直前の順位と完全同着かどうか（表示で「=」を出すため） */
  tied: boolean;
};

export const DEFAULT_TIEBREAKERS: Tiebreaker[] = ["wins", "diff", "points_for"];

function isPlayable(m: Match): boolean {
  return (
    m.status === "done" &&
    m.team_a_id !== null &&
    m.team_b_id !== null &&
    m.score_a !== null &&
    m.score_b !== null
  );
}

/** 2チーム間の直接対決を集計（head_to_head 用） */
function headToHead(a: string, b: string, matches: Match[]) {
  let aWins = 0;
  let bWins = 0;
  let aPts = 0;
  let bPts = 0;
  for (const m of matches) {
    if (!isPlayable(m)) continue;
    const involved =
      (m.team_a_id === a && m.team_b_id === b) ||
      (m.team_a_id === b && m.team_b_id === a);
    if (!involved) continue;
    const aScore = m.team_a_id === a ? m.score_a! : m.score_b!;
    const bScore = m.team_a_id === a ? m.score_b! : m.score_a!;
    aPts += aScore;
    bPts += bScore;
    if (aScore > bScore) aWins++;
    else if (bScore > aScore) bWins++;
  }
  return { aWins, bWins, aPts, bPts };
}

/** tiebreaker 1つ分の比較。正なら x が上位。 */
function compareBy(
  key: Tiebreaker,
  x: StandingRow,
  y: StandingRow,
  matches: Match[]
): number {
  switch (key) {
    case "wins":
      return x.wins - y.wins;
    case "win_rate": {
      const rx = x.played === 0 ? 0 : x.wins / x.played;
      const ry = y.played === 0 ? 0 : y.wins / y.played;
      return rx - ry;
    }
    case "diff":
      return x.diff - y.diff;
    case "points_for":
      return x.pointsFor - y.pointsFor;
    case "points_against":
      // 失点は少ない方が上位
      return y.pointsAgainst - x.pointsAgainst;
    case "head_to_head": {
      const h = headToHead(x.teamId, y.teamId, matches);
      if (h.aWins !== h.bWins) return h.aWins - h.bWins;
      return h.aPts - h.bPts;
    }
    default:
      return 0;
  }
}

/**
 * リーグ1つ分の順位表を計算する。
 * @param teams    そのリーグのチーム
 * @param matches  そのリーグの試合（未実施を含んでよい）
 * @param tiebreakers 優先順位（先頭ほど優先）
 */
export function computeStandings(
  teams: Team[],
  matches: Match[],
  tiebreakers: Tiebreaker[] = DEFAULT_TIEBREAKERS
): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  for (const t of teams) {
    rows.set(t.id, {
      teamId: t.id,
      teamName: t.name,
      members: t.members,
      played: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      diff: 0,
      rank: 0,
      tied: false,
    });
  }

  for (const m of matches) {
    if (!isPlayable(m)) continue;
    const a = rows.get(m.team_a_id!);
    const b = rows.get(m.team_b_id!);
    if (!a || !b) continue;
    const sa = m.score_a!;
    const sb = m.score_b!;
    a.played++;
    b.played++;
    a.pointsFor += sa;
    a.pointsAgainst += sb;
    b.pointsFor += sb;
    b.pointsAgainst += sa;
    if (sa > sb) {
      a.wins++;
      b.losses++;
    } else if (sb > sa) {
      b.wins++;
      a.losses++;
    } else {
      a.draws++;
      b.draws++;
    }
  }

  const list = [...rows.values()];
  for (const r of list) r.diff = r.pointsFor - r.pointsAgainst;

  const keys = tiebreakers.length > 0 ? tiebreakers : DEFAULT_TIEBREAKERS;

  const cmp = (x: StandingRow, y: StandingRow): number => {
    for (const key of keys) {
      const d = compareBy(key, x, y, matches);
      if (d !== 0) return -d; // 大きい方を先頭に
    }
    return 0;
  };

  list.sort((x, y) => {
    const d = cmp(x, y);
    if (d !== 0) return d;
    // 完全同着のときは表示が毎回入れ替わらないよう名前で固定
    return x.teamName.localeCompare(y.teamName, "ja");
  });

  // 同着は同順位（1,2,2,4 方式）
  let lastRank = 0;
  list.forEach((row, i) => {
    if (i > 0 && cmp(list[i - 1], row) === 0) {
      row.rank = lastRank;
      row.tied = true;
      list[i - 1].tied = true;
    } else {
      row.rank = i + 1;
      lastRank = row.rank;
    }
  });

  return list;
}

/** 全リーグ分をまとめて計算する */
export function computeAllStandings(
  leagueIds: string[],
  teams: Team[],
  matches: Match[],
  tiebreakers: Tiebreaker[] = DEFAULT_TIEBREAKERS
): Record<string, StandingRow[]> {
  const result: Record<string, StandingRow[]> = {};
  for (const lid of leagueIds) {
    result[lid] = computeStandings(
      teams.filter((t) => t.league_id === lid),
      matches.filter((m) => m.stage === "league" && m.league_id === lid),
      tiebreakers
    );
  }
  return result;
}
