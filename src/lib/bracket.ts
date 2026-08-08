import type { League, Match, Slot, Team } from "./types";
import { computeStandings, type StandingRow } from "./standings";
import type { Tiebreaker } from "./types";

/**
 * 決勝トーナメントの組み合わせ生成ロジック（独立モジュール）
 * ------------------------------------------------------------
 * 16チーム / 4リーグ / 各上位2チーム のときは
 *   A1-B2 ・ D1-C2 ・ B1-A2 ・ C1-D2
 * という「同じリーグ同士が初戦で当たらない」クロス方式になる。
 * チーム数・リーグ数・進出数が変わっても動くように一般化してある。
 */

export type Qualifier = {
  teamId: string;
  teamName: string;
  leagueName: string;
  rankInLeague: number;
  /** 「Aリーグ1位」のような表示ラベル */
  label: string;
};

export type PlannedMatch = {
  key: string; // 生成中の一時ID
  round: number;
  bracketIndex: number;
  isThirdPlace: boolean;
  teamAId: string | null;
  teamBId: string | null;
  teamALabel: string;
  teamBLabel: string;
  nextKey: string | null;
  nextSlot: Slot | null;
  loserNextKey: string | null;
  loserNextSlot: Slot | null;
};

export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return Math.max(p, 2);
}

/**
 * N人用トーナメントの「シード番号の並び」を返す。
 * N=8 なら [1,8,4,5,2,7,3,6]（＝1位と8位が初戦で当たる標準配置）
 */
export function standardSeedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    const next: number[] = [];
    for (const s of order) {
      next.push(s, n + 1 - s);
    }
    order = next;
  }
  return order;
}

export function roundLabel(teamsInRound: number): string {
  if (teamsInRound <= 2) return "決勝";
  if (teamsInRound === 4) return "準決勝";
  if (teamsInRound === 8) return "準々決勝";
  return `ベスト${teamsInRound}`;
}

/**
 * 予選順位から進出チームを強い順（シード順）に並べる。
 * 1位グループ → 2位グループ …の順。ただし2位以降のグループは
 * リーグの並びをずらして、同じリーグ同士が早い段階で当たらないようにする。
 */
export function buildQualifiers(
  leagues: League[],
  standingsByLeague: Record<string, StandingRow[]>,
  advancePerLeague: number
): Qualifier[] {
  const sortedLeagues = [...leagues].sort((a, b) => a.sort_order - b.sort_order);
  const L = sortedLeagues.length;
  const out: Qualifier[] = [];

  for (let rank = 1; rank <= advancePerLeague; rank++) {
    const shift = ((rank - 1) * Math.ceil(L / 2)) % Math.max(L, 1);
    for (let i = 0; i < L; i++) {
      const league = sortedLeagues[(i + shift) % L];
      const rows = standingsByLeague[league.id] ?? [];
      const row = rows[rank - 1];
      if (!row) continue;
      out.push({
        teamId: row.teamId,
        teamName: row.teamName,
        leagueName: league.name,
        rankInLeague: rank,
        label: `${league.name}リーグ${rank}位`,
      });
    }
  }
  return out;
}

/** 初戦で同じリーグ同士になってしまった場合に入れ替えて解消する */
function resolveSameLeagueClashes(
  pairs: (Qualifier | null)[][],
): void {
  for (let i = 0; i < pairs.length; i++) {
    const [a, b] = pairs[i];
    if (!a || !b || a.leagueName !== b.leagueName) continue;
    for (let j = 0; j < pairs.length; j++) {
      if (i === j) continue;
      const [c, d] = pairs[j];
      if (!c || !d) continue;
      // pairs[i][1] と pairs[j][1] を交換して両方解消できるか
      if (a.leagueName !== d.leagueName && c.leagueName !== b.leagueName) {
        pairs[i][1] = d;
        pairs[j][1] = b;
        break;
      }
    }
  }
}

/**
 * トーナメント表（試合の木構造）を組み立てる。
 * 不戦勝（BYE）が出る場合、その試合は作らずに次のラウンドへ直接置く。
 */
export function planBracket(
  qualifiers: Qualifier[],
  options: { thirdPlaceMatch: boolean }
): PlannedMatch[] {
  const q = qualifiers.length;
  if (q < 2) return [];

  const size = nextPowerOfTwo(q);
  const totalRounds = Math.log2(size);
  const order = standardSeedOrder(size);

  // 初戦の組み合わせ（シード番号 > q は BYE）
  const firstRoundPairs: (Qualifier | null)[][] = [];
  for (let i = 0; i < size / 2; i++) {
    const seedA = order[i * 2];
    const seedB = order[i * 2 + 1];
    firstRoundPairs.push([qualifiers[seedA - 1] ?? null, qualifiers[seedB - 1] ?? null]);
  }
  resolveSameLeagueClashes(firstRoundPairs);

  const key = (r: number, i: number) => `r${r}i${i}`;
  const planned: PlannedMatch[] = [];

  // 空の試合枠を全ラウンド分作る
  for (let r = 1; r <= totalRounds; r++) {
    const count = size / Math.pow(2, r);
    for (let i = 0; i < count; i++) {
      const isFinal = r === totalRounds;
      planned.push({
        key: key(r, i),
        round: r,
        bracketIndex: i,
        isThirdPlace: false,
        teamAId: null,
        teamBId: null,
        teamALabel: "",
        teamBLabel: "",
        nextKey: isFinal ? null : key(r + 1, Math.floor(i / 2)),
        nextSlot: isFinal ? null : i % 2 === 0 ? "a" : "b",
        loserNextKey: null,
        loserNextSlot: null,
      });
    }
  }
  const byKey = new Map(planned.map((m) => [m.key, m]));

  const setSlot = (m: PlannedMatch, slot: Slot, entry: Qualifier | null, label: string) => {
    if (slot === "a") {
      m.teamAId = entry?.teamId ?? null;
      m.teamALabel = entry ? entry.label : label;
    } else {
      m.teamBId = entry?.teamId ?? null;
      m.teamBLabel = entry ? entry.label : label;
    }
  };

  // 初戦に選手を配置。BYE のある試合は削除して次ラウンドへ繰り上げ。
  const removed = new Set<string>();
  firstRoundPairs.forEach((pair, i) => {
    const m = byKey.get(key(1, i))!;
    const [a, b] = pair;
    if (a && b) {
      setSlot(m, "a", a, "");
      setSlot(m, "b", b, "");
      return;
    }
    const survivor = a ?? b;
    removed.add(m.key);
    if (survivor && m.nextKey && m.nextSlot) {
      const parent = byKey.get(m.nextKey)!;
      setSlot(parent, m.nextSlot, survivor, "");
    }
  });

  let list = planned.filter((m) => !removed.has(m.key));

  // 1ラウンド目が全部 BYE で消えた場合はラウンド番号を詰める
  const minRound = Math.min(...list.map((m) => m.round));
  if (minRound > 1) {
    for (const m of list) m.round -= minRound - 1;
  }

  // 「◯回戦 第n試合の勝者」ラベルを埋める
  const maxRound = Math.max(...list.map((m) => m.round));
  const teamsInRound = (r: number) => Math.pow(2, maxRound - r + 1);
  const labelOf = (m: PlannedMatch) =>
    `${roundLabel(teamsInRound(m.round))}${m.bracketIndex + 1}の勝者`;
  for (const m of list) {
    if (!m.nextKey) continue;
    const parent = list.find((x) => x.key === m.nextKey);
    if (!parent) continue;
    if (m.nextSlot === "a" && !parent.teamAId && !parent.teamALabel) {
      parent.teamALabel = labelOf(m);
    }
    if (m.nextSlot === "b" && !parent.teamBId && !parent.teamBLabel) {
      parent.teamBLabel = labelOf(m);
    }
  }

  // 3位決定戦（準決勝の敗者同士）
  if (options.thirdPlaceMatch && maxRound >= 2) {
    const semis = list
      .filter((m) => m.round === maxRound - 1)
      .sort((a, b) => a.bracketIndex - b.bracketIndex);
    if (semis.length === 2) {
      const third: PlannedMatch = {
        key: "third",
        round: maxRound,
        bracketIndex: 1,
        isThirdPlace: true,
        teamAId: null,
        teamBId: null,
        teamALabel: "準決勝1の敗者",
        teamBLabel: "準決勝2の敗者",
        nextKey: null,
        nextSlot: null,
        loserNextKey: null,
        loserNextSlot: null,
      };
      semis[0].loserNextKey = "third";
      semis[0].loserNextSlot = "a";
      semis[1].loserNextKey = "third";
      semis[1].loserNextSlot = "b";
      list = [...list, third];
    }
  }

  return list.sort((a, b) => a.round - b.round || a.bracketIndex - b.bracketIndex);
}

/** 予選結果からトーナメント表を作るための入口 */
export function planBracketFromLeagues(params: {
  leagues: League[];
  teams: Team[];
  matches: Match[];
  advancePerLeague: number;
  thirdPlaceMatch: boolean;
  tiebreakers: Tiebreaker[];
}): { planned: PlannedMatch[]; qualifiers: Qualifier[] } {
  const standingsByLeague: Record<string, StandingRow[]> = {};
  for (const l of params.leagues) {
    standingsByLeague[l.id] = computeStandings(
      params.teams.filter((t) => t.league_id === l.id),
      params.matches.filter((m) => m.stage === "league" && m.league_id === l.id),
      params.tiebreakers
    );
  }
  const qualifiers = buildQualifiers(
    params.leagues,
    standingsByLeague,
    params.advancePerLeague
  );
  return {
    planned: planBracket(qualifiers, { thirdPlaceMatch: params.thirdPlaceMatch }),
    qualifiers,
  };
}

/**
 * トーナメントの勝ち上がりを最初から計算し直し、更新すべき内容だけを返す。
 * ------------------------------------------------------------
 * ・終わった試合の勝者を次のラウンドの枠へ入れる（3位決定戦には敗者を入れる）
 * ・結果が修正されて出場チームが変わった試合は、古い結果を取り消す
 *   → その先のラウンドも連鎖して取り消されるので、途中結果を直しても矛盾しない
 * 純粋な関数なのでDBに触らずテストできる。
 */
export type BracketPatch = {
  id: string;
  patch: {
    team_a_id?: string | null;
    team_b_id?: string | null;
    score_a?: null;
    score_b?: null;
    winner_team_id?: null;
    status?: "pending";
  };
};

export function resolveBracketProgress(matches: Match[]): BracketPatch[] {
  const bracket = matches.filter((m) => m.stage === "bracket");
  if (bracket.length === 0) return [];

  const working = new Map(bracket.map((m) => [m.id, { ...m }]));

  // 「この枠は、どの試合の勝者（または敗者）で埋まるか」の対応表
  const feeders = new Map<string, { childId: string; kind: "winner" | "loser" }>();
  for (const m of bracket) {
    if (m.next_match_id && m.next_slot) {
      feeders.set(`${m.next_match_id}:${m.next_slot}`, { childId: m.id, kind: "winner" });
    }
    if (m.loser_next_match_id && m.loser_next_slot) {
      feeders.set(`${m.loser_next_match_id}:${m.loser_next_slot}`, { childId: m.id, kind: "loser" });
    }
  }

  const patches: BracketPatch[] = [];
  const ordered = [...bracket].sort((a, b) => (a.round ?? 0) - (b.round ?? 0));

  for (const item of ordered) {
    const m = working.get(item.id)!;
    const patch: BracketPatch["patch"] = {};

    for (const slot of ["a", "b"] as Slot[]) {
      const feeder = feeders.get(`${m.id}:${slot}`);
      if (!feeder) continue;
      const child = working.get(feeder.childId);
      let expected: string | null = null;
      if (child && child.status === "done" && child.winner_team_id) {
        expected =
          feeder.kind === "winner"
            ? child.winner_team_id
            : child.team_a_id === child.winner_team_id
              ? child.team_b_id
              : child.team_a_id;
      }
      const field = slot === "a" ? "team_a_id" : "team_b_id";
      if (m[field] !== expected) {
        patch[field] = expected;
        m[field] = expected;
      }
    }

    // 出場チームが入れ替わった試合に古い結果が残っていたら取り消す
    if ((patch.team_a_id !== undefined || patch.team_b_id !== undefined) && m.status === "done") {
      patch.score_a = null;
      patch.score_b = null;
      patch.winner_team_id = null;
      patch.status = "pending";
      m.score_a = null;
      m.score_b = null;
      m.winner_team_id = null;
      m.status = "pending";
    }

    if (Object.keys(patch).length > 0) patches.push({ id: m.id, patch });
  }

  return patches;
}

/** 表示用: ラウンド番号 → 名称 */
export function bracketRoundName(
  round: number,
  maxRound: number,
  isThirdPlace: boolean
): string {
  if (isThirdPlace) return "3位決定戦";
  return roundLabel(Math.pow(2, maxRound - round + 1));
}
