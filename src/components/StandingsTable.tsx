"use client";

import type { StandingRow } from "@/lib/standings";

/**
 * 順位表。スマホでは横スクロールし、順位とチーム名は左に固定して見失わないようにする。
 */
export function StandingsTable({
  rows,
  advanceCount = 0,
}: {
  rows: StandingRow[];
  advanceCount?: number;
}) {
  if (rows.length === 0) {
    return <p className="px-4 py-6 text-center text-sm text-ink-500">チームが登録されていません。</p>;
  }

  return (
    <div className="scroll-x">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr className="bg-court-50 text-xs font-black text-court-800">
            <th className="sticky left-0 z-10 w-[44px] bg-court-50 px-2 py-2 text-center">順位</th>
            <th className="sticky left-[44px] z-10 bg-court-50 px-2 py-2 text-left">チーム</th>
            <th className="px-2 py-2 text-center">試合</th>
            <th className="px-2 py-2 text-center">勝</th>
            <th className="px-2 py-2 text-center">負</th>
            <th className="px-2 py-2 text-center">得点</th>
            <th className="px-2 py-2 text-center">失点</th>
            <th className="px-2 py-2 text-center">得失差</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const advancing = advanceCount > 0 && r.rank <= advanceCount;
            return (
              <tr key={r.teamId} className="border-t border-court-100">
                <td
                  className={`sticky left-0 z-10 px-2 py-2.5 text-center font-black tabular-nums ${
                    advancing ? "bg-ball-500/25 text-court-900" : "bg-white text-ink-700"
                  }`}
                >
                  {r.rank}
                  {r.tied && <span className="ml-0.5 text-[10px] font-bold text-ink-500">=</span>}
                </td>
                <td
                  className={`sticky left-[44px] z-10 max-w-[150px] px-2 py-2.5 ${
                    advancing ? "bg-ball-500/10" : "bg-white"
                  }`}
                >
                  <div className="truncate text-[15px] font-bold text-ink-900">{r.teamName}</div>
                  {r.members && <div className="truncate text-[11px] text-ink-500">{r.members}</div>}
                </td>
                <td className="px-2 py-2.5 text-center tabular-nums text-ink-700">{r.played}</td>
                <td className="px-2 py-2.5 text-center font-black tabular-nums text-court-700">{r.wins}</td>
                <td className="px-2 py-2.5 text-center tabular-nums text-ink-700">{r.losses}</td>
                <td className="px-2 py-2.5 text-center tabular-nums text-ink-700">{r.pointsFor}</td>
                <td className="px-2 py-2.5 text-center tabular-nums text-ink-700">{r.pointsAgainst}</td>
                <td className="px-2 py-2.5 text-center font-bold tabular-nums text-ink-900">
                  {r.diff > 0 ? `+${r.diff}` : r.diff}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
