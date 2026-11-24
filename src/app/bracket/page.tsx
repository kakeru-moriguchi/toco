"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTournamentState } from "@/lib/useTournamentState";
import { BracketView } from "@/components/BracketView";
import { StandingsTable } from "@/components/StandingsTable";
import { EmptyBlock, ErrorBlock, LiveDot, LoadingBlock, PageShell, StatusBadge } from "@/components/ui";
import { computeStandings } from "@/lib/standings";
import { scoreText, sideName, sortMatches, teamById, tierLeagueTeams } from "@/lib/view";
import { tierRangeLabel } from "@/lib/tiers";
import { setsDetail } from "@/lib/score";
import { divisionTiers } from "@/lib/divisionFormat";

export default function BracketPage() {
  const { state, loading, error, refresh, updatedAt } = useTournamentState();
  const [tierKey, setTierKey] = useState<string | null>(null);

  // 実際に試合が作られている級だけをタブに出す
  const tiers = useMemo(() => {
    if (!state) return [];
    return divisionTiers(state.division, state.tournament).filter((t) =>
      state.matches.some((m) => m.tier_key === t.key)
    );
  }, [state]);

  useEffect(() => {
    if (tiers.length > 0 && !tiers.some((t) => t.key === tierKey)) {
      setTierKey(tiers[0].key);
    }
  }, [tiers, tierKey]);

  const current = tiers.find((t) => t.key === tierKey);

  /** 総当たり形式の級の順位表 */
  const leagueRows = useMemo(() => {
    if (!state || !current || current.format !== "league") return [];
    return computeStandings(
      tierLeagueTeams(state, current.key),
      state.matches.filter((m) => m.tier_key === current.key && m.stage === "league"),
      state.tournament.tiebreakers
    );
  }, [state, current]);

  /** 総当たり形式の級の試合一覧 */
  const leagueMatches = useMemo(() => {
    if (!state || !current || current.format !== "league") return [];
    return sortMatches(state.matches.filter((m) => m.tier_key === current.key));
  }, [state, current]);

  /** トーナメント形式の級の優勝チーム */
  const champion = useMemo(() => {
    if (!state || !current || current.format !== "bracket") return undefined;
    const final = state.matches
      .filter((m) => m.stage === "bracket" && m.tier_key === current.key && !m.is_third_place)
      .sort((a, b) => (b.round ?? 0) - (a.round ?? 0))[0];
    if (!final || final.status !== "done") return undefined;
    return teamById(state.teams, final.winner_team_id);
  }, [state, current]);

  const hasRounds = tiers.length > 0;

  return (
    <PageShell
      title="決勝ラウンド"
      subtitle="予選の順位ごとに分かれています"
      action={<LiveDot updatedAt={updatedAt} />}
    >
      {loading && !state && <LoadingBlock />}
      {error && <ErrorBlock message={error} onRetry={refresh} />}

      {state && !hasRounds && (
        <EmptyBlock
          title={state.division.finals_enabled ? "決勝ラウンドはまだ作成されていません" : "この部門は決勝ラウンドを行いません"}
          hint={state.division.finals_enabled ? "予選リーグが終わると、主催者が順位をもとに組み合わせを作成します。" : "リーグ表・順位ページの順位が最終順位です。"}
        />
      )}

      {state && hasRounds && current && (
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

          {/* トーナメント形式 */}
          {current.format === "bracket" && <BracketView state={state} tierKey={current.key} />}

          {/* 総当たり形式：順位表＋試合一覧 */}
          {current.format === "league" && (
            <div className="space-y-4">
              <section className="card overflow-hidden">
                <header className="bg-court-800 px-4 py-2.5 text-sm font-black text-white">
                  {current.name} 順位表
                </header>
                <StandingsTable rows={leagueRows} />
              </section>

              <section className="card overflow-hidden">
                <header className="bg-court-800 px-4 py-2.5 text-sm font-black text-white">
                  {current.name} 試合
                </header>
                <ul className="divide-y divide-court-100">
                  {leagueMatches.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 px-3 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-court-700">
                          {m.court && (
                            <span className="rounded bg-court-800 px-1.5 py-0.5 text-white">
                              コート{m.court}
                            </span>
                          )}
                          <StatusBadge status={m.status} approvalStatus={m.approval_status} />
                        </div>
                        <p className="text-[15px] font-bold leading-snug">
                          {sideName(m, "a", state.teams)}
                          <span className="mx-2 text-ink-500">vs</span>
                          {sideName(m, "b", state.teams)}
                        </p>
                        {m.status === "done" && (
                          <p className="mt-0.5 text-sm font-black tabular-nums text-court-800">
                            {scoreText(m, state)}
                            {setsDetail(m, state.tournament) && (
                              <span className="ml-2 text-[11px] font-bold text-ink-500">
                                {setsDetail(m, state.tournament)}
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                      {m.status !== "done" && m.team_a_id && m.team_b_id && (
                        <Link href={`/report/${m.id}`} className="btn-accent btn-sm shrink-0">
                          結果入力
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
