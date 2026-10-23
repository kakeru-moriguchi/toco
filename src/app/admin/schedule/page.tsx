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
  const [courtFilter, setCourtFilter] = useState<string>("all");

  const notify = (msg: string, tone: "ok" | "error" = "ok") => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 3000);
  };

  const call = async (path: string, body: unknown, message: string): Promise<boolean> => {
    setBusy(true);
    try {
      await adminPost(path, body);
      await refresh();
      notify(message);
      return true;
    } catch (e) {
      notify(e instanceof Error ? e.message : "失敗しました", "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveDrafts = async (ids?: string[]) => {
    const targets = ids ?? Object.keys(drafts);
    const updates = targets.flatMap((id) => {
      const draft = drafts[id];
      return draft ? [{ id, ...draft }] : [];
    });
    if (updates.length === 0) {
      notify("変更した項目がありません", "error");
      return;
    }
    const saved = await call(
      "/api/admin/matches",
      { action: "bulk_schedule", updates },
      updates.length === 1 ? "保存しました" : `${updates.length}試合をまとめて保存しました`
    );
    if (saved) {
      setDrafts((current) => {
        const next = { ...current };
        targets.forEach((id) => delete next[id]);
        return next;
      });
    }
  };

  const allMatches = useMemo(() => (state ? sortMatches(state.matches) : []), [state]);

  /** コート名の一覧（進行表がコート別になったので、ここでも絞り込めるようにする） */
  const courtList = useMemo(() => {
    const set = new Set(allMatches.map((m) => m.court.trim()).filter(Boolean));
    return [...set].sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return a.localeCompare(b, "ja");
    });
  }, [allMatches]);

  const matches = useMemo(
    () => (courtFilter === "all" ? allMatches : allMatches.filter((m) => m.court.trim() === courtFilter)),
    [allMatches, courtFilter]
  );

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
              同じチームが重ならないように、コートへ順番に割り当てます。手直しは下の一覧から行えます。
            </p>
            <p className="rounded-xl bg-court-50 px-3 py-2 text-xs text-ink-700">
              参加者の進行表は<strong>コート別の順番</strong>で表示されます（予定時刻は表示されません）。
              下の「時刻」は主催者の手元用です。空欄でも問題ありません。
            </p>
          </section>

          <section className="card space-y-3 border border-court-200 p-4">
            <div>
              <h2 className="text-sm font-black text-court-800">進行表を手動で入力</h2>
              <p className="mt-1 text-xs leading-relaxed text-ink-600">
                下の試合ごとに、試合番号・開始時刻・コートを直接入力できます。
                変更した項目はまとめて保存できます。
              </p>
            </div>
            <button
              className="btn-primary w-full"
              disabled={busy || Object.keys(drafts).length === 0}
              onClick={() => saveDrafts()}
            >
              {Object.keys(drafts).length === 0
                ? "変更するとまとめて保存できます"
                : `変更した ${Object.keys(drafts).length}試合をまとめて保存`}
            </button>
          </section>

          {courtList.length > 0 && (
            <div className="scroll-x -mx-1 flex gap-2 px-1">
              <button
                onClick={() => setCourtFilter("all")}
                className={`btn btn-sm shrink-0 ${
                  courtFilter === "all"
                    ? "bg-court-700 text-white"
                    : "bg-white text-court-800 ring-1 ring-court-200"
                }`}
              >
                全コート
              </button>
              {courtList.map((c) => (
                <button
                  key={c}
                  onClick={() => setCourtFilter(c)}
                  className={`btn btn-sm shrink-0 ${
                    courtFilter === c
                      ? "bg-court-700 text-white"
                      : "bg-white text-court-800 ring-1 ring-court-200"
                  }`}
                >
                  コート{c}
                </button>
              ))}
            </div>
          )}

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
                      disabled={busy || !drafts[m.id]}
                      onClick={() => saveDrafts([m.id])}
                    >
                      この試合を保存
                    </button>
                    {/* コートで絞り込んでいるときは、そのコート内の隣と入れ替える */}
                    <button
                      className="btn-ghost btn-sm"
                      disabled={busy || i === 0}
                      onClick={() =>
                        call(
                          "/api/admin/matches",
                          { action: "move", id: m.id, targetId: matches[i - 1]?.id },
                          "順番を変更しました"
                        )
                      }
                    >
                      ↑ 前へ
                    </button>
                    <button
                      className="btn-ghost btn-sm"
                      disabled={busy || i === matches.length - 1}
                      onClick={() =>
                        call(
                          "/api/admin/matches",
                          { action: "move", id: m.id, targetId: matches[i + 1]?.id },
                          "順番を変更しました"
                        )
                      }
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

          {Object.keys(drafts).length > 0 && (
            <div className="sticky bottom-4 z-20">
              <button className="btn-primary w-full shadow-lg" disabled={busy} onClick={() => saveDrafts()}>
                {busy ? "保存中…" : `変更した ${Object.keys(drafts).length}試合をまとめて保存`}
              </button>
            </div>
          )}
        </div>
      )}
      <Toast message={toast?.msg ?? null} tone={toast?.tone} />
    </AdminShell>
  );
}
