"use client";

import { useEffect, useMemo, useState } from "react";
import { useTournamentState } from "@/lib/useTournamentState";
import { BracketView } from "@/components/BracketView";
import { EmptyBlock, ErrorBlock, LiveDot, LoadingBlock, PageShell } from "@/components/ui";
import { teamById } from "@/lib/view";
import { tierRangeLabel } from "@/lib/tiers";

export default function BracketPage() {
  const { state, loading, error, refresh, updatedAt } = useTournamentState();
  const [tierKey, setTierKey] = useState<string | null>(null);

  // 実際に試合が作られている級だけをタブに出す
  const tiers = useMemo(() => {
    if (!state) return [];
    return state.tournament.bracket_tiers.filter((t) =>
      state.matches.some((m) => m.stage === "bracket" && m.tier_key === t.key)
    );
  }, [state]);

  useEffect(() => {
    if (tiers.length > 0 && !tiers.some((t) => t.key === tierKey)) {
      setTierKey(tiers[0].key);
    }
  }, [tiers, tierKey]);

  const current = tiers.find((t) => t.key === tierKey);

  // その級の優勝チーム（決勝が終わっていれば表示）
  const champion = useMemo(() => {
    if (!state || !current) return undefined;
    const final = state.matches
      .filter((m) => m.stage === "bracket" && m.tier_key === current.key && !m.is_third_place)
      .sort((a, b) => (b.round ?? 0) - (a.round ?? 0))[0];
    if (!final || final.status !== "done") return undefined;
    return teamById(state.teams, final.winner_team_id);
  }, [state, current]);

  const hasBracket = tiers.length > 0;

  return (
    <PageShell
      title="決勝トーナメント"
      subtitle="勝者は自動で次の試合へ進みます"
      action={<LiveDot updatedAt={updatedAt} />}
    >
      {loading && !state && <LoadingBlock />}
      {error && <ErrorBlock message={error} onRetry={refresh} />}

      {state && !hasBracket && (
        <EmptyBlock
          title="決勝トーナメントはまだ作成されていません"
          hint="予選リーグが終わると、主催者が順位をもとに組み合わせを作成します。"
        />
      )}

      {state && hasBracket && current && (
        <>
          {/* 級の切り替えタブ */}
          <div className="scroll-x -mx-1 mb-3 flex gap-2 px-1 pb-1">
            {tiers.map((t) => (
              <button
                key={t.key}
                onClick={() => setTierKey(t.key)}
                className={`btn btn-sm shrink-0 flex-col !items-start gap-0 py-1.5 ${
                  t.key === current.key
                    ? "bg-court-700 text-white"
                    : "bg-white text-court-800 ring-1 ring-court-200"
                }`}
              >
                <span className="text-base font-black leading-tight">{t.name}</span>
                <span
                  className={`text-[10px] font-bold leading-tight ${
                    t.key === current.key ? "text-court-100" : "text-ink-500"
                  }`}
                >
                  各リーグ{tierRangeLabel(t)}
                </span>
              </button>
            ))}
          </div>

          {champion && (
            <div className="card mb-4 flex items-center gap-3 bg-ball-500 p-4">
              <span className="text-3xl" aria-hidden>
                🏆
              </span>
              <div>
                <p className="text-xs font-black text-court-900/70">{current.name} 優勝</p>
                <p className="text-xl font-black text-court-950">{champion.name}</p>
              </div>
            </div>
          )}

          <BracketView state={state} tierKey={current.key} />
        </>
      )}
    </PageShell>
  );
}
