"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell, Toast } from "@/components/AdminShell";
import { adminPost } from "@/lib/adminApi";
import { selectDivision } from "@/lib/divisionSelection";
import { selectedTournamentId } from "@/lib/tournamentSelection";
import { useTournamentState } from "@/lib/useTournamentState";
import { LoadingBlock } from "@/components/ui";
import { divisionCourts, divisionLeagueCount } from "@/lib/divisionFormat";

export default function AdminDivisionsPage() {
  const router = useRouter();
  const { state, loading, refresh, updatedAt } = useTournamentState();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "error" } | null>(null);
  const [teamCounts, setTeamCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!state?.tournament.id) return;
    fetch("/api/admin/divisions", {
      cache: "no-store",
      headers: { "X-Tournament-Id": state.tournament.id },
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "部門一覧を取得できませんでした。");
        return (json.divisions ?? []) as Array<{ id: string; team_count?: number }>;
      })
      .then((items) => setTeamCounts(Object.fromEntries(items.map((item) => [item.id, item.team_count ?? 0]))))
      .catch(() => setTeamCounts({}));
  }, [state?.tournament.id, updatedAt]);

  const run = async (body: Record<string, unknown>, message: string) => {
    setBusy(true);
    try {
      const result = await adminPost("/api/admin/divisions", body);
      const divisions = (result.divisions ?? []) as Array<{ id: string; team_count?: number }>;
      if (divisions.length > 0) {
        setTeamCounts(Object.fromEntries(divisions.map((item) => [item.id, item.team_count ?? 0])));
      }
      await refresh();
      setToast({ msg: message, tone: "ok" });
      return result;
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : "操作できませんでした。", tone: "error" });
      return null;
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminShell title="部門管理" description="大会内の部門を追加し、部門ごとの運営画面へ切り替えます。">
      {loading && !state ? <LoadingBlock /> : state && (
        <div className="space-y-4">
          <section className="card space-y-3 border-ball-300 p-4">
            <div>
              <h2 className="text-sm font-black text-court-800">清武体育館大会の形式</h2>
              <p className="mt-1 text-xs leading-relaxed text-ink-500">
                PDFの形式に合わせて、初中級（4リーグ・1〜4番コート）、中上級（2リーグ・5〜6番コート）、
                50歳以上（1リーグ・7〜8番コート・決勝なし）を設定します。5チーム予選の試合順と3ゲーム名も設定します。
              </p>
            </div>
            <button
              className="btn-primary"
              disabled={busy}
              onClick={() => {
                if (!confirm("部門名に「初中級」「中上級」「50」を含む部門へPDFの大会形式を設定します。既存の結果は削除しません。続けますか？")) return;
                run({ action: "apply_toco_pdf_format" }, "PDFの大会形式を設定しました");
              }}
            >
              PDFの大会形式を適用
            </button>
          </section>

          <section className="card space-y-3 p-4">
            <h2 className="text-sm font-black text-court-800">新しい部門</h2>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input className="field flex-1" placeholder="例：初中級、50歳以上" value={name} onChange={(e) => setName(e.target.value)} />
              <button
                className="btn-primary"
                disabled={busy || !name.trim()}
                onClick={async () => {
                  const result = await run({ action: "add", name }, "部門を追加しました");
                  const division = result?.division as { id?: string } | undefined;
                  const tournamentId = selectedTournamentId();
                  if (division?.id && tournamentId) {
                    selectDivision(tournamentId, division.id);
                    setName("");
                    router.push("/admin/teams");
                  }
                }}
              >
                部門を追加
              </button>
            </div>
          </section>

          {state.divisions.map((division) => {
            const draft = editing[division.id] ?? division.name;
            const selected = state.division.id === division.id;
            return (
              <section key={division.id} className={`card p-4 ${division.is_active ? "" : "opacity-70"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className="field min-w-[180px] flex-1"
                    value={draft}
                    disabled={!division.is_active}
                    onChange={(e) => setEditing((current) => ({ ...current, [division.id]: e.target.value }))}
                  />
                  {selected && <span className="chip bg-ball-500 text-court-950">管理中</span>}
                  <span className="chip bg-ball-100 text-ink-700">{teamCounts[division.id] ?? 0} チーム</span>
                  <span className="chip bg-court-50 text-court-800">{divisionLeagueCount(division, state.tournament)}リーグ</span>
                  <span className="chip bg-court-50 text-court-800">コート {divisionCourts(division, state.tournament).join("・")}</span>
                  {!division.finals_enabled && <span className="chip bg-court-800 text-white">決勝なし</span>}
                  {!division.is_active && <span className="chip bg-ball-100 text-ink-700">無効</span>}
                </div>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  {division.is_active && (
                    <>
                      <button className="btn-ghost btn-sm" disabled={busy || draft.trim() === division.name} onClick={() => run({ action: "rename", id: division.id, name: draft }, "部門名を変更しました")}>名前を保存</button>
                      {!selected && <button className="btn-primary btn-sm" onClick={() => { selectDivision(state.tournament.id, division.id); router.push("/admin"); }}>この部門を管理</button>}
                      <button
                        className="btn-danger btn-sm"
                        disabled={busy}
                        onClick={() => {
                          if (!confirm(`「${division.name}」を無効化します。チーム・試合・結果は削除されません。`)) return;
                          run({ action: "deactivate", id: division.id }, "部門を無効化しました").then((result) => {
                            if (result && selected) {
                              const next = state.divisions.find((item) => item.id !== division.id && item.is_active);
                              if (next) selectDivision(state.tournament.id, next.id);
                            }
                          });
                        }}
                      >無効化</button>
                    </>
                  )}
                  {!division.is_active && <button className="btn-ghost btn-sm" disabled={busy} onClick={() => run({ action: "restore", id: division.id }, "部門を復元しました")}>復元</button>}
                </div>
              </section>
            );
          })}
        </div>
      )}
      <Toast message={toast?.msg ?? null} tone={toast?.tone} />
    </AdminShell>
  );
}
