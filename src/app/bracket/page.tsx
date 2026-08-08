"use client";

import { useTournamentState } from "@/lib/useTournamentState";
import { BracketView } from "@/components/BracketView";
import { EmptyBlock, ErrorBlock, LiveDot, LoadingBlock, PageShell } from "@/components/ui";
import { teamById } from "@/lib/view";

export default function BracketPage() {
  const { state, loading, error, refresh, updatedAt } = useTournamentState();
  const bracketMatches = state?.matches.filter((m) => m.stage === "bracket") ?? [];

  // 優勝チーム（決勝が終わっていれば表示）
  const final = bracketMatches
    .filter((m) => !m.is_third_place)
    .sort((a, b) => (b.round ?? 0) - (a.round ?? 0))[0];
  const champion =
    final && final.status === "done" && state ? teamById(state.teams, final.winner_team_id) : undefined;

  return (
    <PageShell title="決勝トーナメント" subtitle="勝者は自動で次の試合へ進みます" action={<LiveDot updatedAt={updatedAt} />}>
      {loading && !state && <LoadingBlock />}
      {error && <ErrorBlock message={error} onRetry={refresh} />}

      {state && bracketMatches.length === 0 && (
        <EmptyBlock
          title="決勝トーナメントはまだ作成されていません"
          hint="予選リーグが終わると、主催者が順位をもとに組み合わせを作成します。"
        />
      )}

      {champion && (
        <div className="card mb-4 flex items-center gap-3 bg-ball-500 p-4">
          <span className="text-3xl" aria-hidden>
            🏆
          </span>
          <div>
            <p className="text-xs font-black text-court-900/70">優勝</p>
            <p className="text-xl font-black text-court-950">{champion.name}</p>
          </div>
        </div>
      )}

      {state && bracketMatches.length > 0 && <BracketView state={state} />}
    </PageShell>
  );
}
