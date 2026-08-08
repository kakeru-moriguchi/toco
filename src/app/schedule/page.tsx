"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTournamentState } from "@/lib/useTournamentState";
import { matchGroupName, scoreText, sideName, sortMatches } from "@/lib/view";
import { EmptyBlock, ErrorBlock, LiveDot, LoadingBlock, PageShell, StatusBadge } from "@/components/ui";
import type { Match } from "@/lib/types";

type Filter = "all" | "todo" | "league" | "bracket";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "todo", label: "これから" },
  { key: "league", label: "リーグ戦" },
  { key: "bracket", label: "決勝T" },
];

export default function SchedulePage() {
  const { state, loading, error, refresh, updatedAt } = useTournamentState();
  const [filter, setFilter] = useState<Filter>("all");
  const [keyword, setKeyword] = useState("");

  const rows = useMemo(() => {
    if (!state) return [];
    let list = sortMatches(state.matches);
    if (filter === "todo") list = list.filter((m) => m.status !== "done");
    if (filter === "league") list = list.filter((m) => m.stage === "league");
    if (filter === "bracket") list = list.filter((m) => m.stage === "bracket");
    const kw = keyword.trim();
    if (kw) {
      list = list.filter(
        (m) =>
          sideName(m, "a", state.teams).includes(kw) ||
          sideName(m, "b", state.teams).includes(kw) ||
          m.court.includes(kw)
      );
    }
    return list;
  }, [state, filter, keyword]);

  // 時間ごとにまとめて見やすくする
  const groups = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const m of rows) {
      const key = m.scheduled_at || "時間未定";
      map.set(key, [...(map.get(key) ?? []), m]);
    }
    return [...map.entries()];
  }, [rows]);

  return (
    <PageShell title="進行表" subtitle="試合の順番・時間・コート" action={<LiveDot updatedAt={updatedAt} />}>
      <div className="mb-4 space-y-3">
        <div className="scroll-x -mx-1 flex gap-2 px-1 pb-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`btn btn-sm shrink-0 ${
                filter === f.key ? "bg-court-700 text-white" : "bg-white text-court-800 ring-1 ring-court-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          className="field"
          placeholder="チーム名・コートで絞り込み"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          inputMode="search"
        />
      </div>

      {loading && !state && <LoadingBlock />}
      {error && <ErrorBlock message={error} onRetry={refresh} />}
      {state && rows.length === 0 && (
        <EmptyBlock
          title="表示できる試合がありません"
          hint="対戦カードがまだ作成されていないか、絞り込み条件に合う試合がありません。"
        />
      )}

      <div className="space-y-5">
        {state &&
          groups.map(([time, list]) => (
            <section key={time}>
              <h2 className="mb-2 flex items-center gap-2 px-1 text-sm font-black text-court-800">
                <span className="tabular-nums text-base">{time}</span>
                <span className="h-px flex-1 bg-court-200" />
              </h2>
              <ul className="space-y-2">
                {list.map((m) => (
                  <li key={m.id} className="card overflow-hidden">
                    <div className="flex items-center gap-2 border-b border-court-100 bg-court-50/60 px-3 py-1.5 text-xs font-bold text-court-700">
                      <span className="rounded bg-court-800 px-1.5 py-0.5 text-white tabular-nums">
                        第{m.match_no}試合
                      </span>
                      {m.court && <span className="rounded bg-white px-1.5 py-0.5 ring-1 ring-court-200">コート{m.court}</span>}
                      <span className="truncate text-ink-500">{matchGroupName(m, state)}</span>
                      <span className="ml-auto">
                        <StatusBadge status={m.status} />
                      </span>
                    </div>
                    <div className="flex items-center gap-3 px-3 py-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        {(["a", "b"] as const).map((slot) => {
                          const isWinner =
                            m.status === "done" &&
                            m.winner_team_id !== null &&
                            m.winner_team_id === (slot === "a" ? m.team_a_id : m.team_b_id);
                          const score = slot === "a" ? m.score_a : m.score_b;
                          return (
                            <div key={slot} className="flex items-baseline gap-2">
                              <span
                                className={`min-w-0 flex-1 truncate text-[15px] ${
                                  isWinner ? "font-black text-court-800" : "font-bold text-ink-900"
                                }`}
                              >
                                {isWinner && <span className="mr-1 text-ball-600">●</span>}
                                {sideName(m, slot, state.teams)}
                              </span>
                              {m.status === "done" && (
                                <span className="w-8 shrink-0 text-right text-lg font-black tabular-nums text-court-900">
                                  {score}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {m.status !== "done" && m.team_a_id && m.team_b_id && (
                        <Link href={`/report/${m.id}`} className="btn-accent btn-sm shrink-0">
                          結果入力
                        </Link>
                      )}
                    </div>
                    {m.status === "done" && (
                      <p className="sr-only">
                        {sideName(m, "a", state.teams)} {scoreText(m)} {sideName(m, "b", state.teams)}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>
    </PageShell>
  );
}
