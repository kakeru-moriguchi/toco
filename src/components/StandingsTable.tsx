"use client";

import type { StandingRow } from "@/lib/standings";
import { tierForRank } from "@/lib/tiers";
import type { BracketTier } from "@/lib/types";

/**
 * 順位表。スマホでは横スクロールし、順位とチーム名は左に固定して見失わないようにする。
 * 級（A級/B級/C級）が設定されていれば、その順位がどの級に進むかを表示する。
 *
 * 固定列で気をつけていること:
 *  1. 背景色は必ず不透明にする。半透明にすると、下を流れるスコアが透けて
 *     チーム名に重なって見える。
 *  2. 順位列の幅と、チーム名列の left の値を必ず一致させる。
 *     ずれると固定列同士が重なる。定数にして両方から参照している。
 */

const RANK_W = 46; // 順位列の幅(px)
const NAME_W = 150; // チーム名列の幅(px)

/** 固定列の右端に影を付けて、スクロールの境目を分かりやすくする */
const EDGE_SHADOW = "shadow-[6px_0_8px_-6px_rgba(11,65,51,0.25)]";

export function StandingsTable({
  rows,
  tiers = [],
}: {
  rows: StandingRow[];
  tiers?: BracketTier[];
}) {
  if (rows.length === 0) {
    return <p className="px-4 py-6 text-center text-sm text-ink-500">チームが登録されていません。</p>;
  }

  const rankStyle = { width: RANK_W, minWidth: RANK_W, maxWidth: RANK_W } as const;
  const nameStyle = { left: RANK_W, width: NAME_W, minWidth: NAME_W, maxWidth: NAME_W } as const;

  return (
    <div className="scroll-x">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="bg-court-50 text-xs font-black text-court-800">
            <th className="sticky left-0 z-20 bg-court-50 px-2 py-2 text-center" style={rankStyle}>
              順位
            </th>
            <th
              className={`sticky z-20 bg-court-50 px-2 py-2 text-left ${EDGE_SHADOW}`}
              style={nameStyle}
            >
              チーム
            </th>
            <th className="px-2 py-2 text-center">試合</th>
            <th className="px-2 py-2 text-center">勝</th>
            <th className="px-2 py-2 text-center">負</th>
            <th className="px-2 py-2 text-center">得点</th>
            <th className="px-2 py-2 text-center">失点</th>
            <th className="px-2 py-2 text-center">得失差</th>
            {tiers.length > 0 && <th className="px-2 py-2 text-center">進出先</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const tier = tierForRank(tiers, r.rank);
            const top = Boolean(tier && tier.from_rank === 1);
            return (
              <tr key={r.teamId} className="border-t border-court-100">
                <td
                  className={`sticky left-0 z-20 px-2 py-2.5 text-center font-black tabular-nums ${
                    top ? "bg-ball-100 text-court-900" : "bg-white text-ink-700"
                  }`}
                  style={rankStyle}
                >
                  {r.rank}
                  {r.tied && <span className="ml-0.5 text-[10px] font-bold text-ink-500">=</span>}
                </td>
                <td
                  className={`sticky z-20 px-2 py-2.5 ${EDGE_SHADOW} ${
                    top ? "bg-ball-50" : "bg-white"
                  }`}
                  style={nameStyle}
                >
                  <div className="truncate text-[15px] font-bold text-ink-900">{r.teamName}</div>
                  {r.members && <div className="truncate text-[11px] text-ink-500">{r.members}</div>}
                </td>
                <td className="px-2 py-2.5 text-center tabular-nums text-ink-700">{r.played}</td>
                <td className="px-2 py-2.5 text-center font-black tabular-nums text-court-700">
                  {r.wins}
                </td>
                <td className="px-2 py-2.5 text-center tabular-nums text-ink-700">{r.losses}</td>
                <td className="px-2 py-2.5 text-center tabular-nums text-ink-700">{r.pointsFor}</td>
                <td className="px-2 py-2.5 text-center tabular-nums text-ink-700">
                  {r.pointsAgainst}
                </td>
                <td className="px-2 py-2.5 text-center font-bold tabular-nums text-ink-900">
                  {r.diff > 0 ? `+${r.diff}` : r.diff}
                </td>
                {tiers.length > 0 && (
                  <td className="whitespace-nowrap px-2 py-2.5 text-center">
                    {tier ? (
                      <span
                        className={`chip ${
                          top ? "bg-ball-500 text-court-950" : "bg-court-100 text-court-800"
                        }`}
                      >
                        {tier.name}
                      </span>
                    ) : (
                      <span className="text-xs text-ink-500">—</span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
