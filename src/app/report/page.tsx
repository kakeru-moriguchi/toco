"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTournamentState } from "@/lib/useTournamentState";
import { matchGroupName, scoreText, sideName, sortMatches } from "@/lib/view";
import { EmptyBlock, ErrorBlock, LoadingBlock, PageShell, StatusBadge } from "@/components/ui";

export default function ReportListPage() {
  const { state, loading, error, refresh } = useTournamentState();
  const [keyword, setKeyword] = useState("");
  const [showDone, setShowDone] = useState(false);

  const matches = useMemo(() => {
    if (!state) return [];
    let list = sortMatches(state.matches).filter((m) => m.team_a_id && m.team_b_id);
    if (!showDone) list = list.filter((m) => m.status !== "done");
    const kw = keyword.trim();
    if (kw) {
      list = list.filter(
        (m) => sideName(m, "a", state.teams).includes(kw) || sideName(m, "b", state.teams).includes(kw)
      );
    }
    return list;
  }, [state, keyword, showDone]);

  return (
    <PageShell title="試合結果を入力する" subtitle="自分のチームの試合を選んでください">
      <div className="card mb-4 space-y-3 p-4">
        <div>
          <label className="label" htmlFor="team-search">
            チーム名で探す
          </label>
          <input
            id="team-search"
            className="field"
            placeholder="例：チーム名の一部"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            inputMode="search"
          />
        </div>
        <label className="flex items-center gap-2 text-sm font-bold text-court-800">
          <input
            type="checkbox"
            className="h-5 w-5 rounded border-court-300"
            checked={showDone}
            onChange={(e) => setShowDone(e.target.checked)}
          />
          登録済みの試合も表示する（入力し直せます）
        </label>
      </div>

      {loading && !state && <LoadingBlock />}
      {error && <ErrorBlock message={error} onRetry={refresh} />}
      {state && matches.length === 0 && (
        <EmptyBlock
          title="入力できる試合がありません"
          hint="対戦カードが作成されていないか、すべての試合が終了しています。"
        />
      )}

      <ul className="space-y-2">
        {state &&
          matches.map((m) => (
            <li key={m.id}>
              <Link href={`/report/${m.id}`} className="card flex items-center gap-3 p-3 active:scale-[.99]">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-court-700">
                    {m.court && (
                      <span className="rounded bg-court-800 px-1.5 py-0.5 text-white">
                        コート{m.court}
                      </span>
                    )}
                    <span className="text-ink-500">{matchGroupName(m, state)}</span>
                    <StatusBadge status={m.status} />
                  </div>
                  <p className="text-[15px] font-bold leading-snug">
                    {sideName(m, "a", state.teams)}
                    <span className="mx-2 text-ink-500">vs</span>
                    {sideName(m, "b", state.teams)}
                  </p>
                  {m.status === "done" && (
                    <p className="mt-0.5 text-sm font-black text-court-700 tabular-nums">
                      登録済み {scoreText(m)}
                    </p>
                  )}
                </div>
                <span className="btn-accent btn-sm shrink-0">入力</span>
              </Link>
            </li>
          ))}
      </ul>
    </PageShell>
  );
}
