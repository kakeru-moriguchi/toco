"use client";

import { useState } from "react";
import { AdminShell, Toast } from "@/components/AdminShell";
import { useTournamentState } from "@/lib/useTournamentState";
import { adminPost } from "@/lib/adminApi";
import { LoadingBlock } from "@/components/ui";
import type { Team } from "@/lib/types";

export default function AdminTeamsPage() {
  const { state, loading, refresh } = useTournamentState("admin");
  const [bulk, setBulk] = useState("");
  const [name, setName] = useState("");
  const [members, setMembers] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "error" } | null>(null);
  const [editing, setEditing] = useState<Record<string, Partial<Team>>>({});
  const [leagueNames, setLeagueNames] = useState<Record<string, string>>({});
  const [pins, setPins] = useState<Record<string, string>>({});

  const notify = (msg: string, tone: "ok" | "error" = "ok") => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 2500);
  };

  const call = async (body: unknown, successMessage: string) => {
    setBusy(true);
    try {
      await adminPost("/api/admin/teams", body);
      await refresh();
      notify(successMessage);
      return true;
    } catch (e) {
      notify(e instanceof Error ? e.message : "失敗しました", "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const unassigned = state?.teams.filter((t) => !t.league_id) ?? [];

  return (
    <AdminShell
      title="チーム登録・リーグ分け"
      description="まとめて登録して、A〜Dリーグへ自動で振り分けられます。"
    >
      {loading && !state && <LoadingBlock />}

      {state && (
        <div className="space-y-4">
          <section className="card space-y-3 p-4">
            <h2 className="text-sm font-black text-court-800">まとめて登録</h2>
            <p className="text-xs text-ink-500">
              1行に1チーム。「チーム名,メンバー名」と書くとメンバーも登録されます。
            </p>
            <textarea
              className="field min-h-[130px] py-2 font-mono text-sm"
              placeholder={"サンダース,山田/佐藤\nレイカーズ,鈴木/高橋\nウィングス"}
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
            />
            <button
              className="btn-primary w-full"
              disabled={busy || bulk.trim().length === 0}
              onClick={async () => {
                if (await call({ action: "bulk_add", text: bulk }, "登録しました")) setBulk("");
              }}
            >
              まとめて追加
            </button>
          </section>

          <section className="card space-y-3 p-4">
            <h2 className="text-sm font-black text-court-800">1チームずつ追加</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              <input className="field" placeholder="チーム名" value={name} onChange={(e) => setName(e.target.value)} />
              <input className="field" placeholder="メンバー（任意）" value={members} onChange={(e) => setMembers(e.target.value)} />
            </div>
            <button
              className="btn-ghost w-full"
              disabled={busy || name.trim().length === 0}
              onClick={async () => {
                if (await call({ action: "add", name, members }, "追加しました")) {
                  setName("");
                  setMembers("");
                }
              }}
            >
              追加
            </button>
          </section>

          <section className="card space-y-3 p-4">
            <h2 className="text-sm font-black text-court-800">リーグ分け</h2>
            <p className="text-xs text-ink-500">
              {state.division.name}：現在 {state.teams.length} チーム / {state.leagues.length} リーグ。
              {unassigned.length > 0 && ` 未設定 ${unassigned.length} チーム。`}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                className="btn-primary"
                disabled={busy}
                onClick={() => call({ action: "auto_assign" }, "登録順に振り分けました")}
              >
                登録順に自動で振り分け
              </button>
              <button
                className="btn-ghost"
                disabled={busy}
                onClick={() => {
                  if (confirm("ランダムに振り分け直します。よろしいですか？")) {
                    call({ action: "shuffle" }, "ランダムに振り分けました");
                  }
                }}
              >
                ランダムに振り分け
              </button>
            </div>
            <p className="text-xs text-ink-500">
              振り分け後は「対戦・結果」ページで対戦カードを作成してください。
            </p>
          </section>

          <section className="card space-y-3 p-4">
            <h2 className="text-sm font-black text-court-800">リーグ名</h2>
            <p className="text-xs text-ink-500">
              参加者の画面には「{state.leagues[0]?.name ?? "①"}リーグ」のように表示されます。
            </p>
            <ul className="space-y-2">
              {state.leagues.map((l) => {
                const draft = leagueNames[l.id] ?? l.name;
                return (
                  <li key={l.id} className="flex items-center gap-2">
                    <input
                      className="field h-11 flex-1"
                      value={draft}
                      aria-label={`${l.name}リーグの名前`}
                      onChange={(e) =>
                        setLeagueNames((s) => ({ ...s, [l.id]: e.target.value }))
                      }
                    />
                    <span className="text-sm font-bold text-ink-700">リーグ</span>
                    <button
                      className="btn-primary btn-sm"
                      disabled={busy || draft.trim() === "" || draft === l.name}
                      onClick={() =>
                        call({ action: "rename_league", id: l.id, name: draft }, "変更しました")
                      }
                    >
                      保存
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              className="btn-ghost btn-sm"
              disabled={busy}
              onClick={() => {
                if (confirm("リーグ名を ①②③… に付け直します。よろしいですか？")) {
                  setLeagueNames({});
                  call({ action: "renumber_leagues" }, "①②③形式にしました");
                }
              }}
            >
              ①②③… に一括で付け直す
            </button>
          </section>

          {[...state.leagues, null].map((league) => {
            const list = state.teams
              .filter((t) => (league ? t.league_id === league.id : !t.league_id))
              .sort((a, b) => a.sort_order - b.sort_order);
            if (!league && list.length === 0) return null;
            return (
              <section key={league?.id ?? "none"} className="card overflow-hidden">
                <header className="flex items-center gap-2 bg-court-800 px-4 py-2 text-white">
                  <h2 className="text-sm font-black">{league ? `${league.name}リーグ` : "リーグ未設定"}</h2>
                  <span className="ml-auto text-xs text-court-100">{list.length} チーム</span>
                </header>
                <ul className="divide-y divide-court-100">
                  {list.map((team) => {
                    const draft = editing[team.id] ?? {};
                    return (
                      <li key={team.id} className="space-y-2 p-3">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <input
                            className="field"
                            value={draft.name ?? team.name}
                            onChange={(e) =>
                              setEditing((s) => ({ ...s, [team.id]: { ...draft, name: e.target.value } }))
                            }
                          />
                          <input
                            className="field"
                            placeholder="メンバー"
                            value={draft.members ?? team.members}
                            onChange={(e) =>
                              setEditing((s) => ({ ...s, [team.id]: { ...draft, members: e.target.value } }))
                            }
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            className="field w-36"
                            inputMode="numeric"
                            type="password"
                            placeholder="結果入力PIN"
                            value={pins[team.id] ?? ""}
                            onChange={(event) => setPins((current) => ({ ...current, [team.id]: event.target.value.replace(/\D/g, "").slice(0, 12) }))}
                            aria-label={`${team.name}の結果入力PIN`}
                          />
                          <button
                            className="btn-ghost btn-sm"
                            disabled={busy || !/^\d{6,12}$/.test(pins[team.id] ?? "")}
                            onClick={async () => {
                              if (await call({ action: "set_result_pin", id: team.id, pin: pins[team.id] }, "結果入力PINを設定しました")) {
                                setPins((current) => ({ ...current, [team.id]: "" }));
                              }
                            }}
                          >
                            PIN設定
                          </button>
                          <select
                            className="field w-auto min-w-[140px]"
                            value={team.league_id ?? ""}
                            disabled={busy}
                            onChange={(e) =>
                              call({ action: "update", id: team.id, league_id: e.target.value }, "変更しました")
                            }
                          >
                            <option value="">リーグ未設定</option>
                            {state.leagues.map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.name}リーグ
                              </option>
                            ))}
                          </select>
                          <select
                            className="field w-auto min-w-[150px]"
                            value={team.division_id}
                            disabled={busy || state.divisions.filter((item) => item.is_active).length < 2}
                            aria-label={`${team.name}の所属部門`}
                            onChange={(e) => {
                              const target = state.divisions.find((item) => item.id === e.target.value);
                              if (!target || target.id === team.division_id) return;
                              if (!confirm(`「${team.name}」を「${target.name}」へ移動します。移動後はリーグ未設定になります。よろしいですか？`)) return;
                              call(
                                { action: "move_division", id: team.id, target_division_id: target.id },
                                `${target.name}へ移動しました`
                              );
                            }}
                          >
                            {state.divisions.filter((item) => item.is_active).map((division) => (
                              <option key={division.id} value={division.id}>
                                {division.name}
                              </option>
                            ))}
                          </select>
                          <button
                            className="btn-primary btn-sm"
                            disabled={busy}
                            onClick={() =>
                              call(
                                {
                                  action: "update",
                                  id: team.id,
                                  name: draft.name ?? team.name,
                                  members: draft.members ?? team.members,
                                },
                                "保存しました"
                              )
                            }
                          >
                            保存
                          </button>
                          <button
                            className="btn-danger btn-sm ml-auto"
                            disabled={busy}
                            onClick={() => {
                              if (confirm(`「${team.name}」を削除します。試合が登録されている場合は削除できません。よろしいですか？`)) {
                                call({ action: "remove", id: team.id }, "削除しました");
                              }
                            }}
                          >
                            削除
                          </button>
                        </div>
                      </li>
                    );
                  })}
                  {list.length === 0 && (
                    <li className="p-4 text-center text-sm text-ink-500">チームがありません</li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      <Toast message={toast?.msg ?? null} tone={toast?.tone} />
    </AdminShell>
  );
}
