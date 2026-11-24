"use client";

import { useMemo, useState } from "react";
import { AdminShell, Toast } from "@/components/AdminShell";
import { useTournamentState } from "@/lib/useTournamentState";
import { adminPost } from "@/lib/adminApi";
import { LoadingBlock, StatusBadge } from "@/components/ui";
import { ResultEditor } from "@/components/ResultEditor";
import { divisionGameLabels } from "@/lib/divisionFormat";
import { matchGroupName, sideName, sortMatches } from "@/lib/view";

export default function AdminMatchesPage() {
  const { state, loading, refresh } = useTournamentState();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "error" } | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const notify = (msg: string, tone: "ok" | "error" = "ok") => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 3000);
  };

  const call = async (path: string, body: unknown, message: string) => {
    setBusy(true);
    try {
      await adminPost(path, body);
      await refresh();
      notify(message);
    } catch (e) {
      notify(e instanceof Error ? e.message : "失敗しました", "error");
    } finally {
      setBusy(false);
    }
  };

  const matches = useMemo(() => {
    if (!state) return [];
    let list = sortMatches(state.matches);
    if (filter === "league") list = list.filter((m) => m.stage === "league");
    else if (filter === "bracket") list = list.filter((m) => m.stage === "bracket");
    else if (filter === "todo") list = list.filter((m) => m.status !== "done");
    else if (filter.startsWith("lg:")) list = list.filter((m) => m.league_id === filter.slice(3));
    return list;
  }, [state, filter]);

  return (
    <AdminShell title="対戦カード・試合結果" description="対戦表の作成と、結果の入力・修正ができます。">
      {loading && !state && <LoadingBlock />}

      {state && (
        <div className="space-y-4">
          <section className="card space-y-3 p-4">
            <h2 className="text-sm font-black text-court-800">リーグ戦の対戦カード</h2>
            <p className="text-xs text-ink-500">
              各リーグの総当たり表を自動作成します。作成し直すと<strong>既存のリーグ戦の結果は消えます</strong>。
            </p>
            <button
              className="btn-primary w-full"
              disabled={busy}
              onClick={() => {
                if (confirm("リーグ戦の対戦カードを作成し直します。入力済みのリーグ戦結果は消えます。よろしいですか？")) {
                  call("/api/admin/actions", { action: "generate_league" }, "対戦カードを作成しました");
                }
              }}
            >
              リーグ戦の対戦カードを作成する
            </button>
          </section>

          <div className="scroll-x -mx-1 flex gap-2 px-1">
            {[
              { key: "all", label: "すべて" },
              { key: "todo", label: "未消化" },
              { key: "league", label: "リーグ戦" },
              { key: "bracket", label: "決勝T" },
              ...state.leagues.map((l) => ({ key: `lg:${l.id}`, label: `${l.name}リーグ` })),
            ].map((f) => (
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

          <ul className="space-y-2">
            {matches.map((m) => (
              <li key={m.id} className="card space-y-2 p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-court-700">
                  <span className="rounded bg-court-800 px-1.5 py-0.5 text-white tabular-nums">
                    第{m.match_no}試合
                  </span>
                  {m.scheduled_at && <span className="tabular-nums">{m.scheduled_at}</span>}
                  {m.court && <span>コート{m.court}</span>}
                  <span className="text-ink-500">{matchGroupName(m, state)}</span>
                  <span className="ml-auto">
                    <StatusBadge status={m.status} approvalStatus={m.approval_status} />
                  </span>
                </div>
                <ResultEditor
                  key={`${m.id}-${m.status}-${JSON.stringify(m.sets)}`}
                  match={m}
                  teamA={sideName(m, "a", state.teams)}
                  teamB={sideName(m, "b", state.teams)}
                  busy={busy}
                  setsToWin={state.tournament.sets_to_win}
                  gameLabels={divisionGameLabels(state.division)}
                  onSave={(sets) =>
                    call("/api/admin/matches", { action: "result", id: m.id, sets }, "結果を保存しました")
                  }
                  onClear={() => call("/api/admin/matches", { action: "clear", id: m.id }, "結果を取り消しました")}
                  onStatus={(status) =>
                    call("/api/admin/matches", { action: "status", id: m.id, status }, "状態を変更しました")
                  }
                />
              </li>
            ))}
            {matches.length === 0 && (
              <li className="card p-6 text-center text-sm text-ink-500">試合がありません。</li>
            )}
          </ul>
        </div>
      )}
      <Toast message={toast?.msg ?? null} tone={toast?.tone} />
    </AdminShell>
  );
}
