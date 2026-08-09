"use client";

import { useMemo, useState } from "react";
import { AdminShell, Toast } from "@/components/AdminShell";
import { useTournamentState } from "@/lib/useTournamentState";
import { adminPost } from "@/lib/adminApi";
import { LoadingBlock, StatusBadge } from "@/components/ui";
import { BracketView } from "@/components/BracketView";
import { ResultEditor } from "@/components/ResultEditor";
import { StandingsTable } from "@/components/StandingsTable";
import { computeAllStandings } from "@/lib/standings";
import { tierRangeLabel } from "@/lib/tiers";
import { matchGroupName, sideName } from "@/lib/view";

export default function AdminBracketPage() {
  const { state, loading, refresh } = useTournamentState();
  const [busy, setBusy] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "error" } | null>(null);

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
      state.leagues.map((l) => l.id),
      state.teams,
      state.matches,
      state.tournament.tiebreakers
    );
  }, [state]);

  // 級ごとに試合をまとめる
  const tierGroups = useMemo(() => {
    if (!state) return [];
    return state.tournament.bracket_tiers
      .map((tier) => ({
        tier,
        matches: state.matches
          .filter((m) => m.stage === "bracket" && m.tier_key === tier.key)
          .sort(
            (a, b) =>
              (a.round ?? 0) - (b.round ?? 0) || (a.bracket_index ?? 0) - (b.bracket_index ?? 0)
          ),
      }))
      .filter((g) => g.matches.length > 0);
  }, [state]);

  const bracketCount = tierGroups.reduce((n, g) => n + g.matches.length, 0);
  const leagueRemaining = (state?.matches ?? []).filter(
    (m) => m.stage === "league" && m.status !== "done"
  ).length;

  return (
    <AdminShell
      title="順位別トーナメント"
      description="予選順位をもとに、A級・B級・C級のトーナメントをまとめて作成します。"
    >
      {loading && !state && <LoadingBlock />}

      {state && (
        <div className="space-y-4">
          <section className="card space-y-3 p-4">
            <h2 className="text-sm font-black text-court-800">組み合わせの作成</h2>
            <ul className="space-y-1 text-xs text-ink-700">
              {state.tournament.bracket_tiers.map((t) => (
                <li key={t.key} className="flex items-center gap-2">
                  <span className="chip bg-court-100 text-court-800">{t.name}</span>
                  <span>各リーグ{tierRangeLabel(t)}</span>
                  {t.third_place && <span className="text-ink-500">・3位決定戦あり</span>}
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
            <div className="grid gap-2 sm:grid-cols-3">
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
                      "予選順位をもとに全ての級のトーナメント表を作成します。既存のトーナメント結果は消えます。よろしいですか？"
                    )
                  ) {
                    call(
                      { action: "generate_bracket", startTime: startTime || undefined },
                      "トーナメント表を作成しました"
                    );
                  }
                }}
              >
                トーナメント表を作成
              </button>
              {leagueRemaining > 0 && (
                <button
                  className="btn-ghost"
                  disabled={busy}
                  onClick={() => {
                    if (confirm("予選が未消化の状態で作成します。よろしいですか？")) {
                      call(
                        { action: "generate_bracket", force: true, startTime: startTime || undefined },
                        "トーナメント表を作成しました"
                      );
                    }
                  }}
                >
                  未消化でも作成
                </button>
              )}
            </div>
            {bracketCount > 0 && (
              <button
                className="btn-danger btn-sm"
                disabled={busy}
                onClick={() => {
                  if (confirm("すべての級のトーナメント表を削除します。よろしいですか？")) {
                    call({ action: "reset_bracket" }, "トーナメント表を削除しました");
                  }
                }}
              >
                トーナメント表を削除する
              </button>
            )}
          </section>

          {tierGroups.map(({ tier, matches }) => (
            <section key={tier.key} className="space-y-2">
              <div className="card p-3">
                <h2 className="mb-2 flex items-center gap-2 px-1 text-sm font-black text-court-800">
                  <span className="chip bg-court-800 text-white">{tier.name}</span>
                  <span className="text-xs font-bold text-ink-500">
                    各リーグ{tierRangeLabel(tier)}・{matches.length}試合
                  </span>
                </h2>
                <BracketView state={state} tierKey={tier.key} showReport={false} />
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
                          <StatusBadge status={m.status} />
                        </span>
                      </div>
                      <ResultEditor
                        key={`${m.id}-${m.score_a}-${m.score_b}-${m.status}-${m.team_a_id}-${m.team_b_id}`}
                        match={m}
                        teamA={sideName(m, "a", state.teams)}
                        teamB={sideName(m, "b", state.teams)}
                        busy={busy}
                        onSave={(a, b) =>
                          callMatch(
                            { action: "result", id: m.id, scoreA: a, scoreB: b },
                            "結果を保存しました"
                          )
                        }
                        onClear={() => callMatch({ action: "clear", id: m.id }, "結果を取り消しました")}
                        onStatus={(status) =>
                          callMatch({ action: "status", id: m.id, status }, "状態を変更しました")
                        }
                      />
                    </li>
                  ))}
                </ul>
              </details>
            </section>
          ))}

          <section className="space-y-3">
            <h2 className="px-1 text-sm font-black text-court-800">予選順位（進出先の確認）</h2>
            {state.leagues.map((l) => (
              <div key={l.id} className="card overflow-hidden">
                <header className="bg-court-800 px-4 py-2 text-sm font-black text-white">
                  {l.name}リーグ
                </header>
                <StandingsTable
                  rows={standings[l.id] ?? []}
                  tiers={state.tournament.bracket_tiers}
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
