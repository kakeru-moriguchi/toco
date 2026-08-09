import { DEFAULT_BRACKET_TIERS, type BracketTier } from "./types";

/**
 * 順位別トーナメントの「級」設定を扱うユーティリティ。
 * DBにはJSONで入っているので、読み込み時にここで形を整えてから使う。
 */

/** DBから読んだ値を安全な BracketTier[] に整える */
export function normalizeTiers(input: unknown): BracketTier[] {
  if (!Array.isArray(input) || input.length === 0) return DEFAULT_BRACKET_TIERS;

  const out: BracketTier[] = [];
  input.forEach((raw, i) => {
    if (!raw || typeof raw !== "object") return;
    const r = raw as Record<string, unknown>;
    const from = Math.trunc(Number(r.from_rank));
    const to = Math.trunc(Number(r.to_rank));
    if (!Number.isFinite(from) || !Number.isFinite(to)) return;
    out.push({
      key: String(r.key ?? "").trim() || `T${i + 1}`,
      name: String(r.name ?? "").trim() || `${i + 1}級`,
      from_rank: Math.max(1, from),
      to_rank: Math.max(Math.max(1, from), to),
      third_place: Boolean(r.third_place),
    });
  });

  return out.length > 0 ? out : DEFAULT_BRACKET_TIERS;
}

/**
 * 設定として成立しているかを検査する。問題があればメッセージ、なければ null。
 * 同じ順位が複数の級に入ると1チームが2つのトーナメントに出てしまうため、重なりは認めない。
 */
export function validateTiers(tiers: BracketTier[]): string | null {
  if (tiers.length === 0) return "級を1つ以上設定してください。";

  const keys = new Set<string>();
  for (const t of tiers) {
    if (!t.name) return "級の名前を入力してください。";
    if (keys.has(t.key)) return `級のキー「${t.key}」が重複しています。`;
    keys.add(t.key);
    if (t.from_rank < 1) return `${t.name}の対象順位は1位以上で指定してください。`;
    if (t.to_rank < t.from_rank) {
      return `${t.name}の対象順位が逆になっています（${t.from_rank}位〜${t.to_rank}位）。`;
    }
  }

  const sorted = [...tiers].sort((a, b) => a.from_rank - b.from_rank);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].from_rank <= sorted[i - 1].to_rank) {
      return `${sorted[i - 1].name}と${sorted[i].name}で対象の順位が重なっています。同じ順位を複数の級に入れることはできません。`;
    }
  }
  return null;
}

/** その順位がどの級に進むかを返す（順位表の表示用） */
export function tierForRank(tiers: BracketTier[], rank: number): BracketTier | undefined {
  return tiers.find((t) => rank >= t.from_rank && rank <= t.to_rank);
}

/** 使われていない次のキーを作る（級を追加するとき用） */
export function nextTierKey(tiers: BracketTier[]): string {
  const used = new Set(tiers.map((t) => t.key));
  for (const c of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    if (!used.has(c)) return c;
  }
  return `T${tiers.length + 1}`;
}

/** 対象順位を「1位〜2位」「3位」のように表示する */
export function tierRangeLabel(tier: BracketTier): string {
  return tier.from_rank === tier.to_rank
    ? `${tier.from_rank}位`
    : `${tier.from_rank}位〜${tier.to_rank}位`;
}
