"use client";

import { useMemo, useState } from "react";
import { AdminShell, Toast } from "@/components/AdminShell";
import { useTournamentState } from "@/lib/useTournamentState";
import { adminPost } from "@/lib/adminApi";
import { LoadingBlock, StatusBadge } from "@/components/ui";
import { BracketView } from "@/components/BracketView";
import { ResultEditor } from "@/components/ResultEditor";
import { StandingsTable } from "@/components/StandingsTable";
import { computeAllStandings, computeStandings } from "@/lib/standings";
import { tierRangeLabel } from "@/lib/tiers";
import { matchGroupName, qualifyingLeagues, sideName, tierLeagueTeams } from "@/lib/view";
import { TIER_FORMAT_LABELS } from "@/lib/types";
import { divisionGameLabels, divisionTiers } from "@/lib/divisionFormat";

export default function AdminBracketPage() {
  const { state, loading, refresh } = useTournamentState("admin");
  const [busy, setBusy] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "error" } | null>(null);
  const [swapSlot, setSwapSlot] = useState<{ id: string; slot: "a" | "b" } | null>(null);

  const notify = (msg: string, tone: "ok" | "error" = "ok") => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 5000);
  };

  const call = async (body: unknown, message: string) => {
    setBusy(true);
    try {
      const res = await adminPost("/api/admin/actions", body);
      await refresh();
      const tiers = (res as { tiers?: { name: string; teams: number; matches: number; skippedReason?: string }[] }).tiers;
      if (tiers) {
        const summary = tiers
          .map((t) => (t.skippedReason ? t.skippedReason : `${t.name} ${t.teams}チーム/${t.matches}試合`))
          .join(" ・ ");
        notify(summary);
      } else {
        notify(message);
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : "失敗しました", "error");
    } finally {
      setBusy(false);
    }
  };

  const callMatch = async (body: unknown, message: string) => {
    setBusy(true);
    try {
      await adminPost("/api/admin/matches", body);
      await refresh();
      notify(message);
    } catch (e) {
      notify(e instanceof Error ? e.message : "失敗しました", "error");
    } finally {
      setBusy(false);
    }
  };

  const standings = useMemo(() => {
    if (!state) return {};
    return computeAllStandings(
      qualifyingLeagues(state).map((l) => l.id),
      state.teams,
      state.matches,
      state.tournament.tiebreakers
    );
  }, [state]);

  // 級ごとに試合をまとめる（トーナメント形式・総当たり形式の両方）
  const tierGroups = useMemo(() => {
    if (!state) return [];
    if (!state.division.finals_enabled) return [];
    return divisionTiers(state.division, state.tournament)
      .map((tier) => ({
        tier,
        matches: state.matches
          .filter((m) => m.tier_key === tier.key)
          .sort(
            (a, b) =>
              (a.round ?? 0) - (b.round ?? 0) ||
              (a.bracket_index ?? 0) - (b.bracket_index ?? 0) ||
              a.match_no - b.match_no
          ),
        rows:
          tier.format === "league"
            ? computeStandings(
                tierLeagueTeams(state, tier.key),
                state.matches.filter((m) => m.tier_key === tier.key && m.stage === "league"),
                state.tournament.tiebreakers
              )
            : [],
      }))
      .filter((g) => g.matches.length > 0);
  }, [state]);

  const bracketCount = tierGroups.reduce((n, g) => n + g.matches.length, 0);
  const leagueRemaining = useMemo(() => {
    if (!state) return 0;
    const ids = new Set(qualifyingLeagues(state).map((l) => l.id));
    return state.matches.filter(
      (m) => m.stage === "league" && m.league_id && ids.has(m.league_id) && m.status !== "done"
    ).length;
  }, [state]);

  return (
    <AdminShell
      title="決勝ラウンド"
      description="予選順位をもとに、すべての級（トーナメント・総当たり）をまとめて作成します。"
    >
      {loading && !state && <LoadingBlock />}

      {state && (
        <div className="space-y-4">
          <section className="card space-y-3 p-4">
            <h2 className="text-sm font-black text-court-800">組み合わせの作成</h2>
            <ul className="space-y-1 text-xs text-ink-700">
              {(state.division.finals_enabled ? divisionTiers(state.division, state.tournament) : []).map((t) => (
                <li key={t.key} className="flex items-center gap-2">
                  <span className="chip bg-court-100 text-court-800">{t.name}</span>
                  <span>各リーグ{tierRangeLabel(t)}</span>
                  <span className="text-ink-500">・{TIER_FORMAT_LABELS[t.format]}</span>
                  {t.format === "bracket" && t.third_place && (
                    <span className="text-ink-500">・3位決定戦あり</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-xs text-ink-500">
              級の設定は「大会情報」ページで変更できます。同じリーグ同士が初戦で当たらないよう自動配置します。
              {leagueRemaining > 0 && (
                <span className="mt-1 block font-bold text-amber-700">
                  予選が {leagueRemaining} 試合残っています。
                </span>
              )}
            </p>
            {!state.division.finals_enabled && (
              <p className="rounded-xl bg-court-50 px-3 py-2 text-sm font-bold text-court-800">
                この部門は予選リーグの順位が最終順位です。決勝ラウンドは作成しません。
              </p>
            )}
            {state.division.finals_enabled && <div className="grid gap-2 sm:grid-cols-3">
              <input
                className="field"
                placeholder={`開始時刻（未入力なら ${state.tournament.start_time}）`}
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
              <button
                className="btn-primary"
                disabled={busy}
                onClick={() => {
                  if (
                    confirm(
                      "予選順位をもとに、すべての級の組み合わせを作成します。既存の決勝ラウンドの結果は消えます。よろしいですか？"
                    )
                  ) {
                    call(
                      { action: "generate_bracket", startTime: startTime || undefined },
                      "作成しました"
                    );
                  }
                }}
              >
                決勝ラウンドを作成
              </button>
              {leagueRemaining > 0 && (
                <button
                  className="btn-ghost"
                  disabled={busy}
                  onClick={() => {
                    if (confirm("予選が未消化の状態で作成します。よろしいですか？")) {
                      call(
                        { action: "generate_bracket", force: true, startTime: startTime || undefined },
                        "作成しました"
                      );
                    }
                  }}
                >
                  未消化でも作成
                </button>
              )}
            </div>}
            {bracketCount > 0 && (
              <button
                className="btn-danger btn-sm"
                disabled={busy}
                onClick={() => {
                  if (confirm("すべての級の決勝ラウンドを削除します。よろしいですか？")) {
                    call({ action: "reset_bracket" }, "削除しました");
                  }
                }}
              >
                決勝ラウンドを削除する
              </button>
            )}
          </section>

          {tierGroups.map(({ tier, matches, rows }) => (
            <section key={tier.key} className="space-y-2">
              <div className="card p-3">
                <h2 className="mb-2 flex flex-wrap items-center gap-2 px-1 text-sm font-black text-court-800">
                  <span className="chip bg-court-800 text-white">{tier.name}</span>
                  <span className="chip bg-court-100 text-court-800">
                    {TIER_FORMAT_LABELS[tier.format]}
                  </span>
                  <span className="text-xs font-bold text-ink-500">
                    各リーグ{tierRangeLabel(tier)}・{matches.length}試合
                  </span>
                </h2>
                {tier.format === "bracket" ? (
                  <BracketView state={state} tierKey={tier.key} showReport={false} />
                ) : (
                  <div className="overflow-hidden rounded-xl ring-1 ring-court-100">
                    <StandingsTable rows={rows} />
                  </div>
                )}
              </div>

              <details className="card">
                <summary className="cursor-pointer p-3 text-sm font-black text-court-800">
                  {tier.name}の結果を入力・修正する
                </summary>
                <ul className="space-y-2 border-t border-court-100 p-3">
                  {matches.map((m) => (
                    <li key={m.id} className="space-y-2 rounded-xl bg-court-50 p-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-court-700">
                        <span className="rounded bg-court-800 px-1.5 py-0.5 text-white">
                          {matchGroupName(m, state)}
                        </span>
                        {m.scheduled_at && <span className="tabular-nums">{m.scheduled_at}</span>}
                        {m.court && <span>コート{m.court}</span>}
                        <span className="ml-auto">
                          <StatusBadge status={m.status} approvalStatus={m.approval_status} />
                        </span>
                      </div>
                      <ResultEditor
                        key={`${m.id}-${m.status}-${m.team_a_id}-${m.team_b_id}-${JSON.stringify(m.sets)}`}
                        match={m}
                        teamA={sideName(m, "a", state.teams)}
                        teamB={sideName(m, "b", state.teams)}
                        busy={busy}
                        setsToWin={state.tournament.sets_to_win}
                        gameLabels={divisionGameLabels(state.division)}
                        onSave={(sets) => {
                          callMatch({ action: "result", id: m.id, sets }, "結果を保存しました");
                        }}
                        onClear={() => callMatch({ action: "clear", id: m.id }, "結果を取り消しました")}
                        onStatus={(status) =>
                          callMatch({ action: "status", id: m.id, status }, "状態を変更しました")
                        }
                      />
                      {m.stage === "bracket" && m.status === "pending" && (
                        <div className="grid grid-cols-2 gap-2">
                          {(["a", "b"] as const).map((slot) => {
                            const teamId = slot === "a" ? m.team_a_id : m.team_b_id;
                            if (!teamId) return <span key={slot} />;
                            const selected = swapSlot?.id === m.id && swapSlot.slot === slot;
                            return (
                              <button
                                key={slot}
                                className={selected ? "btn-primary btn-sm" : "btn-ghost btn-sm"}
                                disabled={busy}
                                onClick={async () => {
                                  if (!swapSlot) {
                                    setSwapSlot({ id: m.id, slot });
                                    notify("入れ替え先のチーム枠を選んでください");
                                    return;
                                  }
                                  if (swapSlot.id === m.id && swapSlot.slot === slot) {
                                    setSwapSlot(null);
                                    return;
                                  }
                                  await callMatch({ action: "swap_bracket_slots", id: swapSlot.id, slot: swapSlot.slot, target_id: m.id, target_slot: slot }, "組み合わせを入れ替えました");
                                  setSwapSlot(null);
                                }}
                              >
                                {selected ? "選択中（解除）" : `${slot === "a" ? "上" : "下"}枠を入替`}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            </section>
          ))}

          <section className="space-y-3">
            <h2 className="px-1 text-sm font-black text-court-800">予選順位（進出先の確認）</h2>
            {qualifyingLeagues(state).map((l) => (
              <div key={l.id} className="card overflow-hidden">
                <header className="bg-court-800 px-4 py-2 text-sm font-black text-white">
                  {l.name}リーグ
                </header>
                <StandingsTable
                  rows={standings[l.id] ?? []}
                  tiers={divisionTiers(state.division, state.tournament)}
                />
              </div>
            ))}
          </section>
        </div>
      )}
      <Toast message={toast?.msg ?? null} tone={toast?.tone} />
    </AdminShell>
  );
}
