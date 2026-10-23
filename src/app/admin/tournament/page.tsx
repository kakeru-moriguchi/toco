"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminShell, Toast } from "@/components/AdminShell";
import { useTournamentState } from "@/lib/useTournamentState";
import { adminPatch, adminPost } from "@/lib/adminApi";
import { LoadingBlock } from "@/components/ui";
import { describeTierAllocation, nextTierKey, validateTiers } from "@/lib/tiers";
import {
  TIEBREAKER_LABELS,
  TIER_FORMAT_LABELS,
  TIER_MODE_LABELS,
  type BracketTier,
  type Tiebreaker,
  type TierFormat,
  type TierMode,
} from "@/lib/types";

const ALL_TIEBREAKERS: Tiebreaker[] = [
  "wins",
  "diff",
  "points_for",
  "points_against",
  "win_rate",
  "head_to_head",
];

export default function AdminTournamentPage() {
  const { state, loading, refresh } = useTournamentState();
  const [form, setForm] = useState<Record<string, unknown> | null>(null);
  const [courts, setCourts] = useState("");
  const [tiebreakers, setTiebreakers] = useState<Tiebreaker[]>([]);
  const [tiers, setTiers] = useState<BracketTier[]>([]);
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "error" } | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (!state || form) return;
    const t = state.tournament;
    setForm({
      name: t.name,
      event_date: t.event_date ?? "",
      venue: t.venue,
      note: t.note,
      league_count: t.league_count,
      teams_per_league: t.teams_per_league,
      point_target: t.point_target,
      sets_to_win: t.sets_to_win,
      start_time: t.start_time,
      minutes_per_match: t.minutes_per_match,
    });
    setCourts(t.courts.join(", "));
    setTiebreakers(t.tiebreakers);
    setTiers(t.bracket_tiers);
  }, [state, form]);

  const set = (key: string, value: unknown) => setForm((f) => ({ ...(f ?? {}), [key]: value }));

  const updateTier = (index: number, patch: Partial<BracketTier>) => {
    setTiers((list) => list.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  };

  const addTier = () => {
    const maxRank = tiers.reduce((n, t) => Math.max(n, t.to_rank), 0);
    const key = nextTierKey(tiers);
    setTiers([
      ...tiers,
      {
        key,
        name: `${key}トーナメント`,
        mode: "top",
        from_rank: maxRank + 1,
        to_rank: maxRank + 1,
        bottom_count: 1,
        format: "bracket",
        third_place: false,
      },
    ]);
  };

  /** 実際の予選リーグ（チーム数つき）。誰がどの級に行くかの確認に使う。 */
  const qualifyingLeagues = useMemo(() => {
    if (!state) return [];
    return state.leagues
      .filter((l) => l.tier_key === null)
      .map((l) => ({
        name: `${l.name}リーグ`,
        teamCount: state.teams.filter((t) => t.league_id === l.id).length,
      }));
  }, [state]);

  const tierError = validateTiers(tiers);

  const move = (index: number, dir: -1 | 1) => {
    const next = [...tiebreakers];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setTiebreakers(next);
  };

  const toggle = (key: Tiebreaker) => {
    setTiebreakers((list) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]));
  };

  const save = async () => {
    if (!form) return;
    if (tierError) {
      setToast({ msg: tierError, tone: "error" });
      setTimeout(() => setToast(null), 4000);
      return;
    }
    setSaving(true);
    try {
      await adminPatch("/api/admin/tournament", {
        ...form,
        event_date: form.event_date || null,
        courts: courts.split(/[,、\s]+/).map((c) => c.trim()).filter(Boolean),
        tiebreakers,
        bracket_tiers: tiers,
      });
      await refresh();
      setToast({ msg: "保存しました", tone: "ok" });
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : "保存できませんでした", tone: "error" });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 2500);
    }
  };

  const resetTournament = async () => {
    if (!state || resetConfirmation !== state.tournament.name) return;
    setResetting(true);
    try {
      await adminPost("/api/admin/actions", {
        action: "reset_tournament",
        confirm: resetConfirmation,
      });
      setForm((current) => ({
        ...(current ?? {}),
        name: "ピックルボール大会",
        event_date: "",
        venue: "",
        note: "",
      }));
      await refresh();
      setResetOpen(false);
      setResetConfirmation("");
      setToast({ msg: "大会データをリセットしました", tone: "ok" });
    } catch (e) {
      setToast({
        msg: e instanceof Error ? e.message : "リセットできませんでした。もう一度お試しください。",
        tone: "error",
      });
    } finally {
      setResetting(false);
      setTimeout(() => setToast(null), 4000);
    }
  };

  return (
    <AdminShell title="大会情報" description="参加者のトップページに表示される内容と、大会全体の設定です。">
      {(loading && !state) || !form ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-4">
          <section className="card space-y-3 p-4">
            <h2 className="text-sm font-black text-court-800">基本情報</h2>
            <div>
              <label className="label" htmlFor="name">大会名</label>
              <input id="name" className="field" value={String(form.name ?? "")} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="date">開催日</label>
                <input id="date" type="date" className="field" value={String(form.event_date ?? "")} onChange={(e) => set("event_date", e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="venue">会場名</label>
                <input id="venue" className="field" value={String(form.venue ?? "")} onChange={(e) => set("venue", e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="note">お知らせ（任意・トップページに表示）</label>
              <textarea id="note" className="field min-h-[90px] py-2" value={String(form.note ?? "")} onChange={(e) => set("note", e.target.value)} />
            </div>
          </section>

          <section className="card space-y-3 p-4">
            <h2 className="text-sm font-black text-court-800">大会形式</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="lc">リーグ数</label>
                <input id="lc" type="number" min={1} max={26} className="field" value={Number(form.league_count)} onChange={(e) => set("league_count", Number(e.target.value))} />
                <p className="mt-1 text-xs text-ink-500">A〜の順で自動作成</p>
              </div>
              <div>
                <label className="label" htmlFor="tpl">1リーグのチーム数（目安）</label>
                <input id="tpl" type="number" min={2} max={20} className="field" value={Number(form.teams_per_league)} onChange={(e) => set("teams_per_league", Number(e.target.value))} />
              </div>
              <div>
                <label className="label" htmlFor="pt">1セットの目標点（表示用）</label>
                <input id="pt" type="number" min={1} max={99} className="field" value={Number(form.point_target)} onChange={(e) => set("point_target", Number(e.target.value))} />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="stw">1試合のセット数</label>
              <select
                id="stw"
                className="field sm:w-64"
                value={Number(form.sets_to_win)}
                onChange={(e) => set("sets_to_win", Number(e.target.value))}
              >
                <option value={1}>1セットのみ</option>
                <option value={2}>3セット中2セット先取</option>
                <option value={3}>5セット中3セット先取</option>
              </select>
              <p className="mt-1 text-xs leading-relaxed text-ink-500">
                結果入力の画面にセットごとの入力欄が出ます。
                勝敗は取ったセット数で決まり、順位表の得点・失点には<strong>全セットの合計点</strong>を使います。
              </p>
            </div>
          </section>

          <section className="card space-y-3 p-4">
            <h2 className="text-sm font-black text-court-800">順位別ラウンド（級）</h2>
            <p className="text-xs leading-relaxed text-ink-500">
              予選の順位ごとに別のラウンドを作ります。上から順に順位を取り合い、
              「残り全部」の級が最後にあまりを引き受けます。
              <br />
              例：<strong>上位から1〜2位＝A</strong> ／ <strong>下位から1チーム＝C</strong> ／{" "}
              <strong>残り全部＝B</strong>。
              こうしておくと、リーグごとにチーム数が違っても正しく振り分けられます。
            </p>

            <ul className="space-y-2">
              {tiers.map((tier, i) => (
                <li key={tier.key} className="space-y-2 rounded-xl bg-court-50 p-3">
                  <div className="flex items-center gap-2">
                    <span className="chip bg-court-800 text-white">{tier.key}</span>
                    <input
                      className="field h-11 flex-1"
                      value={tier.name}
                      placeholder="級の名前"
                      onChange={(e) => updateTier(i, { name: e.target.value })}
                    />
                    <button
                      className="btn-danger btn-sm"
                      onClick={() => setTiers(tiers.filter((_, j) => j !== i))}
                      disabled={tiers.length <= 1}
                    >
                      削除
                    </button>
                  </div>
                  {/* 対象の選び方 */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-court-800">対象：各リーグの</span>
                    <select
                      className="field h-11 w-auto"
                      value={tier.mode}
                      onChange={(e) => updateTier(i, { mode: e.target.value as TierMode })}
                      aria-label={`${tier.name}の対象の選び方`}
                    >
                      {(Object.keys(TIER_MODE_LABELS) as TierMode[]).map((m) => (
                        <option key={m} value={m}>
                          {TIER_MODE_LABELS[m]}
                        </option>
                      ))}
                    </select>

                    {tier.mode === "top" && (
                      <>
                        <input
                          type="number"
                          min={1}
                          max={30}
                          className="field h-11 w-16 text-center tabular-nums"
                          value={tier.from_rank}
                          onChange={(e) => updateTier(i, { from_rank: Number(e.target.value) })}
                        />
                        <span className="text-sm font-bold text-ink-700">位 〜</span>
                        <input
                          type="number"
                          min={1}
                          max={30}
                          className="field h-11 w-16 text-center tabular-nums"
                          value={tier.to_rank}
                          onChange={(e) => updateTier(i, { to_rank: Number(e.target.value) })}
                        />
                        <span className="text-sm font-bold text-ink-700">位</span>
                      </>
                    )}

                    {tier.mode === "bottom" && (
                      <>
                        <input
                          type="number"
                          min={1}
                          max={30}
                          className="field h-11 w-16 text-center tabular-nums"
                          value={tier.bottom_count}
                          onChange={(e) => updateTier(i, { bottom_count: Number(e.target.value) })}
                        />
                        <span className="text-sm font-bold text-ink-700">チーム</span>
                      </>
                    )}

                    {tier.mode === "rest" && (
                      <span className="text-sm font-bold text-ink-700">
                        （他の級に入らなかったチーム）
                      </span>
                    )}
                  </div>

                  {/* 進め方 */}
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-xs font-bold text-court-800">
                      進め方
                      <select
                        className="field h-11 w-auto"
                        value={tier.format}
                        onChange={(e) => updateTier(i, { format: e.target.value as TierFormat })}
                      >
                        {(Object.keys(TIER_FORMAT_LABELS) as TierFormat[]).map((f) => (
                          <option key={f} value={f}>
                            {TIER_FORMAT_LABELS[f]}
                          </option>
                        ))}
                      </select>
                    </label>
                    {tier.format === "bracket" && (
                      <label className="flex items-center gap-2 text-sm font-bold text-court-800">
                        <input
                          type="checkbox"
                          className="h-5 w-5"
                          checked={tier.third_place}
                          onChange={(e) => updateTier(i, { third_place: e.target.checked })}
                        />
                        3位決定戦
                      </label>
                    )}
                  </div>

                  {/* いま登録されているチーム数で、誰がこの級に来るかを表示 */}
                  {qualifyingLeagues.length > 0 &&
                    (() => {
                      const a = describeTierAllocation(tier, qualifyingLeagues, tiers);
                      return (
                        <p className="rounded-lg bg-white px-2 py-1.5 text-xs text-ink-700">
                          {a.total > 0 ? (
                            <>
                              <span className="font-bold text-court-800">{a.total}チーム</span>
                              　{a.text}
                            </>
                          ) : (
                            <span className="text-amber-700">
                              この設定では出場チームがいません
                            </span>
                          )}
                        </p>
                      );
                    })()}
                </li>
              ))}
            </ul>

            <button className="btn-ghost btn-sm" onClick={addTier}>
              ＋ 級を追加
            </button>

            {tierError && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{tierError}</p>
            )}
          </section>

          <section className="card space-y-3 p-4">
            <h2 className="text-sm font-black text-court-800">進行表の設定</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="st">開始時刻</label>
                <input id="st" className="field" placeholder="09:00" value={String(form.start_time ?? "")} onChange={(e) => set("start_time", e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="mpm">1試合の持ち時間（分）</label>
                <input id="mpm" type="number" min={5} max={180} className="field" value={Number(form.minutes_per_match)} onChange={(e) => set("minutes_per_match", Number(e.target.value))} />
              </div>
              <div>
                <label className="label" htmlFor="courts">コート番号（カンマ区切り）</label>
                <input id="courts" className="field" placeholder="1, 2, 3, 4" value={courts} onChange={(e) => setCourts(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-ink-500">
              ここを変更したあと「進行表」ページの自動割り当てを実行すると、時間とコートが割り振り直されます。
            </p>
          </section>

          <section className="card space-y-3 p-4">
            <h2 className="text-sm font-black text-court-800">順位の決め方</h2>
            <p className="text-xs text-ink-500">
              上から順に比較します。ドラッグではなく上下ボタンで並べ替えられます。
            </p>
            <ol className="space-y-2">
              {tiebreakers.map((key, i) => (
                <li key={key} className="flex items-center gap-2 rounded-xl bg-court-50 p-2">
                  <span className="w-6 text-center font-black text-court-700 tabular-nums">{i + 1}</span>
                  <span className="flex-1 font-bold">{TIEBREAKER_LABELS[key]}</span>
                  <button className="btn-ghost btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="上へ">↑</button>
                  <button className="btn-ghost btn-sm" onClick={() => move(i, 1)} disabled={i === tiebreakers.length - 1} aria-label="下へ">↓</button>
                  <button className="btn-danger btn-sm" onClick={() => toggle(key)} disabled={tiebreakers.length <= 1}>外す</button>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-2">
              {ALL_TIEBREAKERS.filter((k) => !tiebreakers.includes(k)).map((k) => (
                <button key={k} className="btn-ghost btn-sm" onClick={() => toggle(k)}>
                  ＋ {TIEBREAKER_LABELS[k]}
                </button>
              ))}
            </div>
          </section>

          <section className="card space-y-3 border border-red-200 p-4">
            <div>
              <h2 className="text-sm font-black text-red-800">大会データの一括リセット</h2>
              <p className="mt-1 text-xs leading-relaxed text-ink-600">
                次の大会を始めるために、大会名・開催日・会場・お知らせを初期化し、
                参加チーム・メンバー・リーグ分け・全試合・結果・変更履歴を削除します。
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-500">
                リーグ数、セット数、コート、順位ルール、順位別ラウンドの設定は残ります。
              </p>
            </div>
            <button className="btn-danger w-full" onClick={() => setResetOpen(true)}>
              大会データをリセットする
            </button>
          </section>

          <div className="sticky bottom-4">
            <button className="btn-primary w-full shadow-lg" onClick={save} disabled={saving || Boolean(tierError)}>
              {saving ? "保存中…" : "設定を保存する"}
            </button>
          </div>
        </div>
      )}
      {resetOpen && state && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-title"
        >
          <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-xl">
            <div>
              <h2 id="reset-title" className="text-lg font-black text-red-800">
                本当にリセットしますか？
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-700">
                参加チームとすべての試合結果は元に戻せません。確認のため、現在の大会名を入力してください。
              </p>
            </div>
            <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-800 break-words">
              {state.tournament.name}
            </div>
            <div>
              <label className="label" htmlFor="reset-confirmation">現在の大会名</label>
              <input
                id="reset-confirmation"
                className="field"
                value={resetConfirmation}
                onChange={(e) => setResetConfirmation(e.target.value)}
                autoComplete="off"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                className="btn-ghost"
                onClick={() => {
                  setResetOpen(false);
                  setResetConfirmation("");
                }}
                disabled={resetting}
              >
                やめる
              </button>
              <button
                className="btn-danger bg-red-700 text-white hover:bg-red-800"
                onClick={resetTournament}
                disabled={resetting || resetConfirmation !== state.tournament.name}
              >
                {resetting ? "リセット中…" : "すべて削除する"}
              </button>
            </div>
          </div>
        </div>
      )}
      <Toast message={toast?.msg ?? null} tone={toast?.tone} />
    </AdminShell>
  );
}
