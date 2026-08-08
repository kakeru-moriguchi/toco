"use client";

import { useMemo, useState } from "react";
import { AdminShell, Toast } from "@/components/AdminShell";
import { useTournamentState } from "@/lib/useTournamentState";
import { adminPost } from "@/lib/adminApi";
import { LoadingBlock, StatusBadge } from "@/components/ui";
import { matchGroupName, sideName, sortMatches } from "@/lib/view";

export default function AdminSchedulePage() {
  const { state, loading, refresh } = useTournamentState();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "error" } | null>(null);
  const [stage, setStage] = useState<"league" | "bracket">("league");
  const [startTime, setStartTime] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { court?: string; scheduled_at?: string; match_no?: string }>>({});

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

  const matches = useMemo(() => (state ? sortMatches(state.matches) : []), [state]);

  return (
    <AdminShell
      title="進行表の編集"
      description="試合の順番・開始時間・コート番号を調整できます。参加者の画面にもそのまま反映されます。"
    >
      {loading && !state && <LoadingBlock />}

      {state && (
        <div className="space-y-4">
          <section className="card space-y-3 p-4">
            <h2 className="text-sm font-black text-court-800">時間とコートの自動割り当て</h2>
            <p className="text-xs text-ink-500">
              現在の設定：開始 {state.tournament.start_time} / 1試合 {state.tournament.minutes_per_match}分 / コート{" "}
              {state.tournament.courts.join("・")}（変更は「大会情報」ページ）
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              <select className="field" value={stage} onChange={(e) => setStage(e.target.value as "league" | "bracket")}>
                <option value="league">リーグ戦</option>
                <option value="bracket">決勝トーナメント</option>
              </select>
              <input
                className="field"
                placeholder={`開始時刻（未入力なら ${state.tournament.start_time}）`}
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
              <button
                className="btn-primary"
                disabled={busy}
                onClick={() =>
                  call(
                    "/api/admin/actions",
                    { action: "auto_schedule", stage, startTime: startTime || undefined },
                    "自動で割り当てました"
                  )
                }
              >
                自動で割り当てる
              </button>
            </div>
            <p className="text-xs text-ink-500">
              同じ時間帯に同じチームが重複しないように割り当てます。手直しは下の一覧から行えます。
            </p>
          </section>

          <ul className="space-y-2">
            {matches.map((m, i) => {
              const d = drafts[m.id] ?? {};
              return (
                <li key={m.id} className="card space-y-2 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-court-700">
                    <span className="text-ink-500">{matchGroupName(m, state)}</span>
                    <span className="ml-auto">
                      <StatusBadge status={m.status} />
                    </span>
                  </div>
                  <p className="text-sm font-bold">
                    {sideName(m, "a", state.teams)}
                    <span className="mx-2 text-ink-500">vs</span>
                    {sideName(m, "b", state.teams)}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="text-xs font-bold text-court-800">
                      試合番号
                      <input
                        className="field mt-1 h-11 text-center tabular-nums"
                        inputMode="numeric"
                        value={d.match_no ?? String(m.match_no)}
                        onChange={(e) =>
                          setDrafts((s) => ({ ...s, [m.id]: { ...d, match_no: e.target.value.replace(/[^0-9]/g, "") } }))
                        }
                      />
                    </label>
                    <label className="text-xs font-bold text-court-800">
                      時刻
                      <input
                        className="field mt-1 h-11 text-center"
                        placeholder="09:00"
                        value={d.scheduled_at ?? m.scheduled_at}
                        onChange={(e) =>
                          setDrafts((s) => ({ ...s, [m.id]: { ...d, scheduled_at: e.target.value } }))
                        }
                      />
                    </label>
                    <label className="text-xs font-bold text-court-800">
                      コート
                      <input
                        className="field mt-1 h-11 text-center"
                        value={d.court ?? m.court}
                        onChange={(e) => setDrafts((s) => ({ ...s, [m.id]: { ...d, court: e.target.value } }))}
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="btn-primary btn-sm"
                      disabled={busy}
                      onClick={() =>
                        call(
                          "/api/admin/matches",
                          {
                            action: "schedule",
                            id: m.id,
                            match_no: d.match_no ?? m.match_no,
                            scheduled_at: d.scheduled_at ?? m.scheduled_at,
                            court: d.court ?? m.court,
                          },
                          "保存しました"
                        )
                      }
                    >
                      保存
                    </button>
                    <button
                      className="btn-ghost btn-sm"
                      disabled={busy || i === 0}
                      onClick={() => call("/api/admin/matches", { action: "move", id: m.id, direction: "up" }, "順番を変更しました")}
                    >
                      ↑ 前へ
                    </button>
                    <button
                      className="btn-ghost btn-sm"
                      disabled={busy || i === matches.length - 1}
                      onClick={() => call("/api/admin/matches", { action: "move", id: m.id, direction: "down" }, "順番を変更しました")}
                    >
                      ↓ 後へ
                    </button>
                  </div>
                </li>
              );
            })}
            {matches.length === 0 && (
              <li className="card p-6 text-center text-sm text-ink-500">
                試合がありません。「対戦・結果」ページで対戦カードを作成してください。
              </li>
            )}
          </ul>
        </div>
      )}
      <Toast message={toast?.msg ?? null} tone={toast?.tone} />
    </AdminShell>
  );
}
