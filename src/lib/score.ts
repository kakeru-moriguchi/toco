import type { Match, SetScore, Tournament } from "./types";

/**
 * セット制のスコアを扱うロジック（独立モジュール）
 * ------------------------------------------------------------
 * 「何セット先取か」は大会設定（tournaments.sets_to_win）で決まる。
 *   1 … 1セットのみ（従来どおり）
 *   2 … 3セット中2セット先取
 *   3 … 5セット中3セット先取
 *
 * 勝敗は「取ったセット数」で決まり、
 * 順位表の得点・失点には「全セットの合計点」を使う。
 * どちらもこのファイルで計算するので、ルールを変えたいときはここだけ見ればよい。
 */

/** 何セットまで行う可能性があるか（2セット先取なら3セット） */
export function maxSets(setsToWin: number): number {
  return Math.max(1, setsToWin) * 2 - 1;
}

/** DBから来た値を安全な SetScore[] に整える */
export function normalizeSets(input: unknown): SetScore[] {
  if (!Array.isArray(input)) return [];
  const out: SetScore[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const a = Math.trunc(Number(r.a));
    const b = Math.trunc(Number(r.b));
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    out.push({ a: Math.max(0, a), b: Math.max(0, b) });
  }
  return out;
}

/**
 * 古い形式（1セットぶんの score_a / score_b しか無い試合）でも
 * セットの配列として扱えるようにする。
 */
export function matchSets(match: Match): SetScore[] {
  const sets = normalizeSets(match.sets);
  if (sets.length > 0) return sets;
  if (match.score_a !== null && match.score_b !== null) {
    return [{ a: match.score_a, b: match.score_b }];
  }
  return [];
}

/** 取ったセット数 */
export function setsWon(sets: SetScore[]): { a: number; b: number } {
  let a = 0;
  let b = 0;
  for (const s of sets) {
    if (s.a > s.b) a++;
    else if (s.b > s.a) b++;
  }
  return { a, b };
}

/** 全セットの合計点 */
export function totalPoints(sets: SetScore[]): { a: number; b: number } {
  return sets.reduce((acc, s) => ({ a: acc.a + s.a, b: acc.b + s.b }), { a: 0, b: 0 });
}

export type SetsValidation = {
  ok: boolean;
  error?: string;
  /** 勝者の側。決着していなければ null */
  winner: "a" | "b" | null;
  setsWon: { a: number; b: number };
  totalPoints: { a: number; b: number };
};

/**
 * 入力されたセットスコアが試合結果として成立しているか確認する。
 * 空のセット（両方未入力）は「まだやっていないセット」として無視する。
 */
export function validateSets(sets: SetScore[], setsToWin: number): SetsValidation {
  const need = Math.max(1, setsToWin);
  const limit = maxSets(need);
  const empty = { winner: null, setsWon: { a: 0, b: 0 }, totalPoints: { a: 0, b: 0 } };

  if (sets.length === 0) {
    return { ok: false, error: "スコアを入力してください。", ...empty };
  }
  if (sets.length > limit) {
    return { ok: false, error: `セットは${limit}セットまでです。`, ...empty };
  }

  let a = 0;
  let b = 0;
  for (const [i, s] of sets.entries()) {
    if (s.a > 99 || s.b > 99) {
      return { ok: false, error: "スコアが大きすぎます。", ...empty };
    }
    if (s.a === s.b) {
      return {
        ok: false,
        error:
          need === 1
            ? "同点では登録できません。どちらかが勝った状態で入力してください。"
            : `第${i + 1}セットが同点です。どちらかが勝った点数を入力してください。`,
        ...empty,
      };
    }
    // すでに決着しているのに、さらにセットが入力されている
    if (a >= need || b >= need) {
      return {
        ok: false,
        error: `${need}セット先取なので、第${i + 1}セットは不要です。空欄にしてください。`,
        ...empty,
      };
    }
    if (s.a > s.b) a++;
    else b++;
  }

  const won = { a, b };
  const points = totalPoints(sets);

  if (a < need && b < need) {
    return {
      ok: false,
      error: `まだ決着がついていません（${a}-${b}）。${need}セット先取まで入力してください。`,
      winner: null,
      setsWon: won,
      totalPoints: points,
    };
  }

  return { ok: true, winner: a > b ? "a" : "b", setsWon: won, totalPoints: points };
}

/** 「2 - 1」「11 - 7」のような見出し用スコア */
export function headlineScore(match: Match, tournament: Pick<Tournament, "sets_to_win">): string {
  const sets = matchSets(match);
  if (sets.length === 0) return "";
  if (Math.max(1, tournament.sets_to_win) === 1) {
    return `${sets[0].a} - ${sets[0].b}`;
  }
  const won = setsWon(sets);
  return `${won.a} - ${won.b}`;
}

/** 「11-7 / 9-11 / 11-5」のようなセットごとの内訳 */
export function setsDetail(match: Match, tournament: Pick<Tournament, "sets_to_win">): string {
  if (Math.max(1, tournament.sets_to_win) === 1) return "";
  const sets = matchSets(match);
  if (sets.length === 0) return "";
  return sets.map((s) => `${s.a}-${s.b}`).join(" / ");
}

/** 片側だけの見出しスコア（表で左右に分けて出すとき用） */
export function headlineSide(
  match: Match,
  side: "a" | "b",
  tournament: Pick<Tournament, "sets_to_win">
): number | null {
  const sets = matchSets(match);
  if (sets.length === 0) return null;
  if (Math.max(1, tournament.sets_to_win) === 1) return sets[0][side];
  return setsWon(sets)[side];
}
