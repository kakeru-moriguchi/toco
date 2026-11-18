"use client";

import { useEffect, useState } from "react";
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
 *  3. z-index は 10 まで。ページ上部の固定ヘッダー(z-30)より前に出ると、
 *     下方向にスクロールしたときヘッダーの上に表を描いてしまう。
 */

const RANK_W = 46; // 順位列の幅(px)
const NAME_W = 150; // チーム名列の幅(px)

/** 固定列の右端に影を付けて、スクロールの境目を分かりやすくする */
const EDGE_SHADOW = "shadow-[6px_0_8px_-6px_rgba(120,50,12,0.22)]";

/** チーム名をタップしたときに出すメンバー一覧 */
function MemberDialog({
  teamName,
  members,
  onClose,
}: {
  teamName: string;
  members: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 「山田/佐藤」「山田、佐藤」「山田・佐藤」いずれの区切りでも1人ずつに分ける
  const list = members
    .split(/[\/、,・]/)
    .map((m) => m.trim())
    .filter(Boolean);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-court-950/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`${teamName} のメンバー`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs font-bold text-ink-500">チーム</p>
        <h3 className="mb-3 break-words text-xl font-black leading-snug text-court-900">
          {teamName}
        </h3>
        <p className="text-xs font-bold text-ink-500">メンバー</p>
        {list.length > 0 ? (
          <ul className="mt-1 space-y-1">
            {list.map((m, i) => (
              <li key={i} className="flex items-center gap-2 text-[15px] font-bold text-ink-900">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-court-100 text-xs font-black text-court-700">
                  {i + 1}
                </span>
                <span className="break-words">{m}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-ink-500">登録されていません</p>
        )}
        <button className="btn-primary mt-5 w-full" onClick={onClose} autoFocus>
          閉じる
        </button>
      </div>
    </div>
  );
}

export function StandingsTable({
  rows,
  tiers = [],
}: {
  rows: StandingRow[];
  tiers?: BracketTier[];
}) {
  const [openTeam, setOpenTeam] = useState<StandingRow | null>(null);

  if (rows.length === 0) {
    return <p className="px-4 py-6 text-center text-sm text-ink-500">チームが登録されていません。</p>;
  }

  const rankStyle = { width: RANK_W, minWidth: RANK_W, maxWidth: RANK_W } as const;
  const nameStyle = { left: RANK_W, width: NAME_W, minWidth: NAME_W, maxWidth: NAME_W } as const;

  return (
    <>
      <div className="scroll-x">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="bg-court-50 text-xs font-black text-court-800">
              <th className="sticky left-0 z-10 bg-court-50 px-2 py-2 text-center" style={rankStyle}>
                順位
              </th>
              <th
                className={`sticky z-10 bg-court-50 px-2 py-2 text-left ${EDGE_SHADOW}`}
                style={nameStyle}
              >
                チーム
              </th>
              <th className="px-2 py-2 text-center">試合</th>
              <th className="px-2 py-2 text-center">勝</th>
              <th className="px-2 py-2 text-center">負</th>
              <th className="whitespace-nowrap px-2 py-2 text-center">得セット</th>
              <th className="whitespace-nowrap px-2 py-2 text-center">失セット</th>
              <th className="whitespace-nowrap px-2 py-2 text-center">セット差</th>
              <th className="px-2 py-2 text-center">得点</th>
              <th className="px-2 py-2 text-center">失点</th>
              <th className="px-2 py-2 text-center">得失差</th>
              {tiers.length > 0 && <th className="px-2 py-2 text-center">進出先</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              // どの級に進むかは、そのリーグのチーム数によって変わる
              // （「最下位」「残り」の指定があるため）
              const tier = tierForRank(tiers, r.rank, rows.length);
              const top = Boolean(tier && tiers[0] && tier.key === tiers[0].key);
              return (
                <tr key={r.teamId} className="border-t border-court-100">
                  <td
                    className={`sticky left-0 z-10 px-2 py-2.5 text-center font-black tabular-nums ${
                      top ? "bg-ball-100 text-court-900" : "bg-white text-ink-700"
                    }`}
                    style={rankStyle}
                  >
                    {r.rank}
                    {r.tied && <span className="ml-0.5 text-[10px] font-bold text-ink-500">=</span>}
                  </td>
                  <td
                    className={`sticky z-10 p-0 ${EDGE_SHADOW} ${top ? "bg-ball-50" : "bg-white"}`}
                    style={nameStyle}
                  >
                    {/* チーム名だけを表示し、タップするとメンバーを出す */}
                    <button
                      type="button"
                      className="flex w-full items-center gap-1 px-2 py-3 text-left active:opacity-60"
                      onClick={() => setOpenTeam(r)}
                      aria-label={`${r.teamName} のメンバーを見る`}
                    >
                      {/* メンバー行が無くなったぶん、長いチーム名は2行まで折り返して全部見せる */}
                      <span className="line-clamp-2 min-w-0 flex-1 text-[15px] font-bold leading-tight text-ink-900">
                        {r.teamName}
                      </span>
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4 shrink-0 text-court-500"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden
                      >
                        <circle cx="9" cy="8" r="3" />
                        <path d="M3.5 19a5.5 5.5 0 0 1 11 0" strokeLinecap="round" />
                        <path d="M16 6.5a3 3 0 0 1 0 5M18.5 19a5.6 5.6 0 0 0-2-4" strokeLinecap="round" />
                      </svg>
                    </button>
                  </td>
                  <td className="px-2 py-2.5 text-center tabular-nums text-ink-700">{r.played}</td>
                  <td className="px-2 py-2.5 text-center font-black tabular-nums text-court-700">
                    {r.wins}
                  </td>
                  <td className="px-2 py-2.5 text-center tabular-nums text-ink-700">{r.losses}</td>
                  <td className="px-2 py-2.5 text-center font-bold tabular-nums text-court-700">
                    {r.setsFor}
                  </td>
                  <td className="px-2 py-2.5 text-center tabular-nums text-ink-700">
                    {r.setsAgainst}
                  </td>
                  <td className="px-2 py-2.5 text-center font-bold tabular-nums text-ink-900">
                    {r.setDiff > 0 ? `+${r.setDiff}` : r.setDiff}
                  </td>
                  <td className="px-2 py-2.5 text-center tabular-nums text-ink-700">
                    {r.pointsFor}
                  </td>
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

      {openTeam && (
        <MemberDialog
          teamName={openTeam.teamName}
          members={openTeam.members}
          onClose={() => setOpenTeam(null)}
        />
      )}
    </>
  );
}
