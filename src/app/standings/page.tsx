"use client";

import { useMemo } from "react";
import { useTournamentState } from "@/lib/useTournamentState";
import { computeAllStandings } from "@/lib/standings";
import { TIEBREAKER_LABELS } from "@/lib/types";
import { qualifyingLeagues, scoreText, sideName } from "@/lib/view";
import { StandingsTable } from "@/components/StandingsTable";
import { tierRangeLabel } from "@/lib/tiers";
import { EmptyBlock, ErrorBlock, LiveDot, LoadingBlock, PageShell } from "@/components/ui";

export default function StandingsPage() {
  const { state, loading, error, refresh, updatedAt } = useTournamentState();

  const standings = useMemo(() => {
    if (!state) return {};
    return computeAllStandings(
      qualifyingLeagues(state).map((l) => l.id),
      state.teams,
      state.matches,
      state.tournament.tiebreakers
    );
  }, [state]);

  return (
    <PageShell title="リーグ表・順位" subtitle="結果が入ると自動で再計算されます" action={<LiveDot updatedAt={updatedAt} />}>
      {loading && !state && <LoadingBlock />}
      {error && <ErrorBlock message={error} onRetry={refresh} />}
      {state && qualifyingLeagues(state).length === 0 && (
        <EmptyBlock title="リーグがまだありません" hint="主催者がリーグ分けを行うと表示されます。" />
      )}

      <div className="space-y-5">
        {state && qualifyingLeagues(state).map((league) => {
          const rows = standings[league.id] ?? [];
          const matches = state.matches
            .filter((m) => m.stage === "league" && m.league_id === league.id)
            .sort((a, b) => a.match_no - b.match_no);
          const done = matches.filter((m) => m.status === "done").length;
          return (
            <section key={league.id} className="card overflow-hidden">
              <header className="flex items-center gap-2 bg-court-800 px-4 py-2.5 text-white">
                <h2 className="text-base font-black">{league.name}リーグ</h2>
                <span className="ml-auto text-xs text-court-100 tabular-nums">
                  {done} / {matches.length} 試合終了
                </span>
              </header>
              <StandingsTable rows={rows} tiers={state.tournament.bracket_tiers} />
              <details className="border-t border-court-100">
                <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-court-800">
                  {league.name}リーグの試合結果を見る
                </summary>
                <ul className="divide-y divide-court-100 border-t border-court-100">
                  {matches.map((m) => (
                    <li key={m.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                      <span className="w-10 shrink-0 text-xs text-ink-500 tabular-nums">
                        第{m.match_no}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-bold">
                        {sideName(m, "a", state.teams)}
                      </span>
                      <span className="shrink-0 px-2 font-black tabular-nums text-court-800">
                        {m.status === "done" ? scoreText(m) : "-"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-right font-bold">
                        {sideName(m, "b", state.teams)}
                      </span>
                    </li>
                  ))}
                  {matches.length === 0 && (
                    <li className="px-4 py-4 text-center text-sm text-ink-500">対戦カード未作成</li>
                  )}
                </ul>
              </details>
            </section>
          );
        })}
      </div>

      {state && qualifyingLeagues(state).length > 0 && (
        <p className="mt-4 rounded-xl bg-white/70 px-4 py-3 text-xs leading-relaxed text-ink-500">
          <span className="font-bold text-court-800">順位の決め方：</span>
          {state.tournament.tiebreakers.map((t, i) => (
            <span key={t}>
              {i > 0 && " → "}
              {TIEBREAKER_LABELS[t]}
            </span>
          ))}
          <br />
          <span className="font-bold text-court-800">決勝トーナメントの進出先：</span>
          {state.tournament.bracket_tiers.map((t, i) => (
            <span key={t.key}>
              {i > 0 && " / "}
              各リーグ{tierRangeLabel(t)} → {t.name}
            </span>
          ))}
        </p>
      )}
    </PageShell>
  );
}
