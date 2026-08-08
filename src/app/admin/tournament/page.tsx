"use client";

import { useEffect, useState } from "react";
import { AdminShell, Toast } from "@/components/AdminShell";
import { useTournamentState } from "@/lib/useTournamentState";
import { adminPatch } from "@/lib/adminApi";
import { LoadingBlock } from "@/components/ui";
import { TIEBREAKER_LABELS, type Tiebreaker } from "@/lib/types";

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
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "error" } | null>(null);
  const [saving, setSaving] = useState(false);

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
      advance_per_league: t.advance_per_league,
      point_target: t.point_target,
      third_place_match: t.third_place_match,
      start_time: t.start_time,
      minutes_per_match: t.minutes_per_match,
    });
    setCourts(t.courts.join(", "));
    setTiebreakers(t.tiebreakers);
  }, [state, form]);

  const set = (key: string, value: unknown) => setForm((f) => ({ ...(f ?? {}), [key]: value }));

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
    setSaving(true);
    try {
      await adminPatch("/api/admin/tournament", {
        ...form,
        event_date: form.event_date || null,
        courts: courts.split(/[,、\s]+/).map((c) => c.trim()).filter(Boolean),
        tiebreakers,
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
                <label className="label" htmlFor="apl">各リーグの決勝T進出数</label>
                <input id="apl" type="number" min={1} max={8} className="field" value={Number(form.advance_per_league)} onChange={(e) => set("advance_per_league", Number(e.target.value))} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm font-bold text-court-800">
              <input type="checkbox" className="h-5 w-5" checked={Boolean(form.third_place_match)} onChange={(e) => set("third_place_match", e.target.checked)} />
              3位決定戦を行う
            </label>
            <div>
              <label className="label" htmlFor="pt">1試合の目標点（表示用）</label>
              <input id="pt" type="number" min={1} max={99} className="field sm:w-40" value={Number(form.point_target)} onChange={(e) => set("point_target", Number(e.target.value))} />
            </div>
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

          <div className="sticky bottom-4">
            <button className="btn-primary w-full shadow-lg" onClick={save} disabled={saving}>
              {saving ? "保存中…" : "設定を保存する"}
            </button>
          </div>
        </div>
      )}
      <Toast message={toast?.msg ?? null} tone={toast?.tone} />
    </AdminShell>
  );
}
