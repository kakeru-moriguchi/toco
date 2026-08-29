"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { Match, TournamentState } from "@/lib/types";
import { bracketRoundName } from "@/lib/bracket";
import { maxBracketRound, sideName } from "@/lib/view";

/**
 * トーナメント表。
 * ラウンドを横に並べ、スマホでは横スクロールで全体を追えるようにしている。
 * 縦の位置は「勝ち上がると1つ上のラウンドの中央に合流する」形で自動的に揃う。
 */

const ROW_HEIGHT = 92;

function MatchCard({
  match,
  state,
  showReport,
}: {
  match: Match;
  state: TournamentState;
  showReport: boolean;
}) {
  const ready = Boolean(match.team_a_id && match.team_b_id);
  const rounds = maxBracketRound(state.matches, match.tier_key);
  return (
    <div
      className={`w-full rounded-xl bg-white p-2 shadow-card ring-1 ${
        match.status === "in_progress" ? "ring-2 ring-ball-500" : "ring-court-900/10"
      }`}
    >
      <div className="mb-1 flex items-center gap-1 text-[10px] font-bold text-ink-500">
        <span className="rounded bg-court-100 px-1 py-0.5 text-court-800">
          {bracketRoundName(match.round ?? 1, rounds, match.is_third_place)}
        </span>
        {match.court && <span>コート{match.court}</span>}
      </div>
      {(["a", "b"] as const).map((slot) => {
        const teamId = slot === "a" ? match.team_a_id : match.team_b_id;
        const score = slot === "a" ? match.score_a : match.score_b;
        const isWinner = match.status === "done" && match.winner_team_id === teamId && teamId !== null;
        const isLoser = match.status === "done" && !isWinner;
        return (
          <div
            key={slot}
            className={`flex items-center gap-1 rounded px-1 py-1 ${
              isWinner ? "bg-ball-500/20" : ""
            }`}
          >
            <span
              className={`min-w-0 flex-1 truncate text-[13px] leading-tight ${
                isWinner ? "font-black text-court-900" : isLoser ? "text-ink-500" : "font-bold text-ink-900"
              } ${!teamId ? "italic text-ink-500" : ""}`}
            >
              {sideName(match, slot, state.teams)}
            </span>
            <span className="w-5 shrink-0 text-right text-sm font-black tabular-nums text-court-900">
              {match.status === "done" ? score : ""}
            </span>
          </div>
        );
      })}
      {showReport && ready && match.status !== "done" && (
        <Link href={`/report/${match.id}`} className="mt-1 block rounded-lg bg-ball-500 py-1.5 text-center text-xs font-black text-court-950">
          結果入力
        </Link>
      )}
    </div>
  );
}

export function BracketView({
  state,
  tierKey,
  showReport = true,
}: {
  state: TournamentState;
  /** 表示する級。省略すると全トーナメント試合をまとめて描くので、通常は必ず指定する */
  tierKey?: string;
  showReport?: boolean;
}) {
  const { rounds, thirdPlace, height } = useMemo(() => {
    const bracket = state.matches.filter(
      (m) => m.stage === "bracket" && (tierKey === undefined || m.tier_key === tierKey)
    );
    const third = bracket.find((m) => m.is_third_place) ?? null;
    const main = bracket.filter((m) => !m.is_third_place);
    const byRound = new Map<number, Match[]>();
    for (const m of main) {
      const r = m.round ?? 1;
      byRound.set(r, [...(byRound.get(r) ?? []), m]);
    }
    const list = [...byRound.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([round, ms]) => ({
        round,
        matches: ms.sort((a, b) => (a.bracket_index ?? 0) - (b.bracket_index ?? 0)),
      }));
    const first = list[0]?.matches.length ?? 0;
    return { rounds: list, thirdPlace: third, height: Math.max(first, 1) * ROW_HEIGHT };
  }, [state.matches, tierKey]);

  if (rounds.length === 0) return null;
  const lastRound = rounds[rounds.length - 1].round;

  return (
    <div className="space-y-4">
      <div className="scroll-x rounded-2xl bg-white/60 p-2">
        <div className="flex min-w-max" style={{ height }}>
          {rounds.map((column, ci) => {
            const isLast = ci === rounds.length - 1;
            return (
              <div key={column.round} className="flex w-[180px] flex-col sm:w-[210px]">
                <div className="pb-1 text-center text-[11px] font-black text-court-700">
                  {bracketRoundName(column.round, lastRound, false)}
                </div>
                <div className="flex flex-1 flex-col">
                  {column.matches.map((m, mi) => (
                    <div
                      key={m.id}
                      className={`relative flex flex-1 items-center ${ci > 0 ? "pl-3" : ""} ${
                        isLast ? "" : "pr-3"
                      }`}
                    >
                      <MatchCard match={m} state={state} showReport={showReport} />
                      {ci > 0 && (
                        <span className="absolute left-0 top-1/2 h-px w-3 bg-court-300" aria-hidden />
                      )}
                      {!isLast && (
                        <>
                          <span className="absolute right-0 top-1/2 h-px w-3 bg-court-300" aria-hidden />
                          <span
                            className={`absolute right-0 w-px bg-court-300 ${
                              mi % 2 === 0 ? "top-1/2 h-1/2" : "bottom-1/2 h-1/2"
                            }`}
                            aria-hidden
                          />
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {thirdPlace && (
        <div className="max-w-[260px]">
          <p className="mb-1 text-xs font-black text-court-700">3位決定戦</p>
          <MatchCard match={thirdPlace} state={state} showReport={showReport} />
        </div>
      )}
      <p className="text-center text-xs text-ink-500 sm:hidden">← 横にスクロールできます →</p>
    </div>
  );
}
