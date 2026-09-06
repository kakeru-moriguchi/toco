"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTournamentState } from "@/lib/useTournamentState";
import { matchGroupName, sideName, sortMatches } from "@/lib/view";
import { headlineSide, setsDetail } from "@/lib/score";
import { EmptyBlock, ErrorBlock, LiveDot, LoadingBlock, PageShell, StatusBadge } from "@/components/ui";
import type { Match, TournamentState } from "@/lib/types";

/**
 * 進行表（コート別）
 * ------------------------------------------------------------
 * 予定時刻ではなく「そのコートで何番目にやる試合か」で並べる。
 * 会場では「今このコートは何番目まで終わった？次は誰？」が知りたいので、
 * 各コートの一番上に、次にやる試合を目立たせて出している。
 */

type Filter = "all" | "todo";

const NO_COURT = "__none__";

function MatchRow({
  match,
  order,
  state,
  isNext,
}: {
  match: Match;
  order: number;
  state: TournamentState;
  isNext: boolean;
}) {
  const done = match.status === "done";
  const canReport = !done && match.team_a_id && match.team_b_id;

  return (
    <li
      className={`flex gap-3 px-3 py-3 ${isNext ? "bg-ball-50" : ""} ${
        done ? "opacity-60" : ""
      }`}
    >
      {/* そのコートでの順番 */}
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black tabular-nums ${
          done
            ? "bg-court-100 text-court-700"
            : isNext
              ? "bg-ball-500 text-court-950"
              : "bg-court-800 text-white"
        }`}
        aria-label={`${order}番目`}
      >
        {order}
      </span>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
          {isNext && (
            <span className="chip bg-ball-500 text-court-950">次の試合</span>
          )}
          <span className="text-ink-500">{matchGroupName(match, state)}</span>
          <StatusBadge status={match.status} />
        </div>

        <div>
          {(["a", "b"] as const).map((slot) => {
            const teamId = slot === "a" ? match.team_a_id : match.team_b_id;
            const score = headlineSide(match, slot, state.tournament);
            const isWinner = done && match.winner_team_id !== null && match.winner_team_id === teamId;
            return (
              <div key={slot}>
                {/* 2チームが続けて並ぶと1つの名前に見えるので、間に区切りを入れる */}
                {slot === "b" && (
                  <div className="flex items-center gap-2 py-0.5">
                    <span className="text-[10px] font-black text-ink-500">vs</span>
                    <span className="h-px flex-1 bg-court-100" />
                  </div>
                )}
                <div className="flex items-baseline gap-2">
                  <span
                    className={`min-w-0 flex-1 break-words text-[15px] leading-snug ${
                      isWinner ? "font-black text-court-800" : "font-bold text-ink-900"
                    }`}
                  >
                    {isWinner && <span className="mr-1 text-ball-600">●</span>}
                    {sideName(match, slot, state.teams)}
                  </span>
                  {done && (
                    <span className="w-7 shrink-0 text-right text-lg font-black tabular-nums text-court-900">
                      {score}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {done && setsDetail(match, state.tournament) && (
          <p className="mt-1 text-[11px] font-bold tabular-nums text-ink-500">
            {setsDetail(match, state.tournament)}
          </p>
        )}
      </div>

      {canReport && (
        <Link href={`/report/${match.id}`} className="btn-accent btn-sm shrink-0 self-center">
          結果入力
        </Link>
      )}
    </li>
  );
}

export default function SchedulePage() {
  const { state, loading, error, refresh, updatedAt } = useTournamentState();
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedCourt, setSelectedCourt] = useState<string>("all");

  /** コートごとに、進行順で試合をまとめる */
  const courtGroups = useMemo(() => {
    if (!state) return [];
    const ordered = sortMatches(state.matches);

    const map = new Map<string, Match[]>();
    for (const m of ordered) {
      const key = m.court.trim() || NO_COURT;
      map.set(key, [...(map.get(key) ?? []), m]);
    }

    // コート名は数字なら数値順、それ以外は文字順。未設定は最後。
    const keys = [...map.keys()].sort((a, b) => {
      if (a === NO_COURT) return 1;
      if (b === NO_COURT) return -1;
      const na = Number(a);
      const nb = Number(b);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return a.localeCompare(b, "ja");
    });

    return keys.map((key) => {
      const all = map.get(key)!;
      // 「次の試合」はそのコートで最初の未終了の試合
      const nextId = all.find((m) => m.status !== "done")?.id ?? null;
      return {
        key,
        label: key === NO_COURT ? "コート未設定" : `コート${key}`,
        // 順番の番号は絞り込みに関係なく固定したいので、全件から求めた位置を持たせる
        rows: all.map((m, i) => ({ match: m, order: i + 1 })),
        nextId,
        remaining: all.filter((m) => m.status !== "done").length,
        total: all.length,
      };
    });
  }, [state]);

  const visibleGroups = useMemo(() => {
    return courtGroups
      .filter((g) => selectedCourt === "all" || g.key === selectedCourt)
      .map((g) => ({
        ...g,
        rows: filter === "todo" ? g.rows.filter((r) => r.match.status !== "done") : g.rows,
      }))
      .filter((g) => g.rows.length > 0);
  }, [courtGroups, selectedCourt, filter]);

  return (
    <PageShell
      title="進行表"
      subtitle="コートごとの試合の順番"
      action={<LiveDot updatedAt={updatedAt} />}
    >
      {loading && !state && <LoadingBlock />}
      {error && <ErrorBlock message={error} onRetry={refresh} />}

      {state && courtGroups.length > 0 && (
        <div className="mb-4 space-y-2">
          {/* コートの絞り込み */}
          <div className="scroll-x -mx-1 flex gap-2 px-1 pb-1">
            <button
              onClick={() => setSelectedCourt("all")}
              className={`btn btn-sm shrink-0 ${
                selectedCourt === "all"
                  ? "bg-court-700 text-white"
                  : "bg-white text-court-800 ring-1 ring-court-200"
              }`}
            >
              全コート
            </button>
            {courtGroups.map((g) => (
              <button
                key={g.key}
                onClick={() => setSelectedCourt(g.key)}
                className={`btn btn-sm shrink-0 ${
                  selectedCourt === g.key
                    ? "bg-court-700 text-white"
                    : "bg-white text-court-800 ring-1 ring-court-200"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>

          {/* 終了した試合を隠すかどうか */}
          <label className="flex items-center gap-2 px-1 text-sm font-bold text-court-800">
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-court-300"
              checked={filter === "todo"}
              onChange={(e) => setFilter(e.target.checked ? "todo" : "all")}
            />
            終わった試合を隠す
          </label>
        </div>
      )}

      {state && visibleGroups.length === 0 && (
        <EmptyBlock
          title="表示できる試合がありません"
          hint="対戦カードがまだ作成されていないか、条件に合う試合がありません。"
        />
      )}

      <div className="space-y-4">
        {visibleGroups.map((g) => (
          <section key={g.key} className="card overflow-hidden">
            <header className="flex items-center gap-2 bg-court-800 px-4 py-2.5 text-white">
              <h2 className="text-lg font-black">{g.label}</h2>
              <span className="ml-auto text-xs text-court-100 tabular-nums">
                残り {g.remaining} / {g.total} 試合
              </span>
            </header>
            <ul className="divide-y divide-court-100">
              {g.rows.map(({ match, order }) => (
                <MatchRow
                  key={match.id}
                  match={match}
                  order={order}
                  state={state!}
                  isNext={match.id === g.nextId}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </PageShell>
  );
}
