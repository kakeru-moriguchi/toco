import { DEFAULT_BRACKET_TIERS, type BracketTier, type TierFormat, type TierMode } from "./types";

/**
 * 順位別ラウンドの「級」設定を扱うユーティリティ。
 * DBにはJSONで入っているので、読み込み時にここで形を整えてから使う。
 */

const MODES: TierMode[] = ["top", "bottom", "rest"];
const FORMATS: TierFormat[] = ["bracket", "league"];

/** DBから読んだ値を安全な BracketTier[] に整える（古い形式も読めるようにする） */
export function normalizeTiers(input: unknown): BracketTier[] {
  if (!Array.isArray(input) || input.length === 0) return DEFAULT_BRACKET_TIERS;

  const out: BracketTier[] = [];
  input.forEach((raw, i) => {
    if (!raw || typeof raw !== "object") return;
    const r = raw as Record<string, unknown>;

    const from = Math.trunc(Number(r.from_rank));
    const to = Math.trunc(Number(r.to_rank));
    const safeFrom = Number.isFinite(from) ? Math.max(1, from) : 1;
    const safeTo = Number.isFinite(to) ? Math.max(safeFrom, to) : safeFrom;

    // mode / format が無い古いデータは、従来どおり「上位から・トーナメント」とみなす
    const mode = MODES.includes(r.mode as TierMode) ? (r.mode as TierMode) : "top";
    const format = FORMATS.includes(r.format as TierFormat) ? (r.format as TierFormat) : "bracket";
    const bottom = Math.trunc(Number(r.bottom_count));

    out.push({
      key: String(r.key ?? "").trim() || `T${i + 1}`,
      name: String(r.name ?? "").trim() || `${i + 1}級`,
      mode,
      from_rank: safeFrom,
      to_rank: safeTo,
      bottom_count: Number.isFinite(bottom) ? Math.max(1, bottom) : 1,
      format,
      third_place: Boolean(r.third_place),
    });
  });

  return out.length > 0 ? out : DEFAULT_BRACKET_TIERS;
}

/** 設定として成立しているかを検査する。問題があればメッセージ、なければ null。 */
export function validateTiers(tiers: BracketTier[]): string | null {
  if (tiers.length === 0) return "級を1つ以上設定してください。";

  const keys = new Set<string>();
  for (const t of tiers) {
    if (!t.name) return "級の名前を入力してください。";
    if (keys.has(t.key)) return `級のキー「${t.key}」が重複しています。`;
    keys.add(t.key);
    if (t.mode === "top") {
      if (t.from_rank < 1) return `${t.name}の対象順位は1位以上で指定してください。`;
      if (t.to_rank < t.from_rank) {
        return `${t.name}の対象順位が逆になっています（${t.from_rank}位〜${t.to_rank}位）。`;
      }
    }
    if (t.mode === "bottom" && t.bottom_count < 1) {
      return `${t.name}は下位から1チーム以上を指定してください。`;
    }
  }

  // 「残り」は、どこまでが残りか決められなくなるので1つだけ
  if (tiers.filter((t) => t.mode === "rest").length > 1) {
    return "「残り全部」を指定できる級は1つだけです。";
  }

  // 上位から同士の重なりだけは、設定ミスとして先に知らせる
  const tops = tiers.filter((t) => t.mode === "top").sort((a, b) => a.from_rank - b.from_rank);
  for (let i = 1; i < tops.length; i++) {
    if (tops[i].from_rank <= tops[i - 1].to_rank) {
      return `${tops[i - 1].name}と${tops[i].name}で対象の順位が重なっています。`;
    }
  }
  return null;
}

/**
 * 1つのリーグ（チーム数 teamCount）の中で、どの順位がどの級に行くかを決める。
 * 返り値は rank(1始まり) → 級のキー。
 *
 * 決め方:
 *   1. 「上位から」「下位から」を設定順に処理して順位を取り合う（先に書いた級が優先）
 *   2. 最後に「残り全部」の級が、まだ誰も取っていない順位をすべて引き受ける
 * この順にすることで、B=残り・C=最下位 のような指定でも意図どおりになる。
 */
export function assignRanksToTiers(
  tiers: BracketTier[],
  teamCount: number
): Map<number, string> {
  const result = new Map<number, string>();
  if (teamCount <= 0) return result;

  const claim = (rank: number, key: string) => {
    if (rank >= 1 && rank <= teamCount && !result.has(rank)) result.set(rank, key);
  };

  for (const tier of tiers) {
    if (tier.mode === "top") {
      for (let r = tier.from_rank; r <= Math.min(tier.to_rank, teamCount); r++) claim(r, tier.key);
    } else if (tier.mode === "bottom") {
      const start = Math.max(1, teamCount - tier.bottom_count + 1);
      for (let r = start; r <= teamCount; r++) claim(r, tier.key);
    }
  }

  const rest = tiers.find((t) => t.mode === "rest");
  if (rest) {
    for (let r = 1; r <= teamCount; r++) claim(r, rest.key);
  }

  return result;
}

/** その順位がどの級に進むかを返す（順位表の表示用） */
export function tierForRank(
  tiers: BracketTier[],
  rank: number,
  teamCount: number
): BracketTier | undefined {
  const key = assignRanksToTiers(tiers, teamCount).get(rank);
  return key ? tiers.find((t) => t.key === key) : undefined;
}

/** 使われていない次のキーを作る（級を追加するとき用） */
export function nextTierKey(tiers: BracketTier[]): string {
  const used = new Set(tiers.map((t) => t.key));
  for (const c of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    if (!used.has(c)) return c;
  }
  return `T${tiers.length + 1}`;
}

/** 対象の選び方を「1位〜2位」「最下位」のように短く表す */
export function tierRangeLabel(tier: BracketTier): string {
  if (tier.mode === "rest") return "残り全部";
  if (tier.mode === "bottom") {
    return tier.bottom_count === 1 ? "最下位" : `下位${tier.bottom_count}チーム`;
  }
  return tier.from_rank === tier.to_rank
    ? `${tier.from_rank}位`
    : `${tier.from_rank}位〜${tier.to_rank}位`;
}

/**
 * 各リーグのチーム数を渡して、級ごとの内訳を説明する文字列を作る。
 * 管理画面で「この設定だと誰がどこへ行くか」を保存前に確認できるようにするため。
 */
export function describeTierAllocation(
  tier: BracketTier,
  leagues: { name: string; teamCount: number }[],
  tiers: BracketTier[]
): { text: string; total: number } {
  const parts: string[] = [];
  let total = 0;
  for (const l of leagues) {
    const ranks = [...assignRanksToTiers(tiers, l.teamCount).entries()]
      .filter(([, key]) => key === tier.key)
      .map(([rank]) => rank)
      .sort((a, b) => a - b);
    if (ranks.length === 0) continue;
    total += ranks.length;
    parts.push(`${l.name}=${ranks.map((r) => `${r}位`).join("・")}`);
  }
  return { text: parts.join(" / "), total };
}
