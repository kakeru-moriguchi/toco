"use client";

import { useEffect, useState } from "react";
import { divisionCourts, divisionGameLabels, divisionLeagueCount, divisionTiers } from "@/lib/divisionFormat";
import { nextTierKey, validateTiers } from "@/lib/tiers";
import {
  TIER_FORMAT_LABELS,
  TIER_MODE_LABELS,
  type BracketTier,
  type Division,
  type TierFormat,
  type TierMode,
  type Tournament,
} from "@/lib/types";

export function DivisionFormatEditor({
  division,
  tournament,
  busy,
  onSave,
  onReset,
}: {
  division: Division;
  tournament: Tournament;
  busy: boolean;
  onSave: (body: Record<string, unknown>) => Promise<unknown>;
  onReset: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [leagueCount, setLeagueCount] = useState(1);
  const [courts, setCourts] = useState("");
  const [finalsEnabled, setFinalsEnabled] = useState(true);
  const [matchOrder, setMatchOrder] = useState<"balanced" | "toco_5_team">("balanced");
  const [gameLabels, setGameLabels] = useState("");
  const [tiers, setTiers] = useState<BracketTier[]>([]);

  useEffect(() => {
    setLeagueCount(divisionLeagueCount(division, tournament));
    setCourts(divisionCourts(division, tournament).join(", "));
    setFinalsEnabled(division.finals_enabled);
    setMatchOrder(division.qualifying_match_order);
    setGameLabels(divisionGameLabels(division).join(", "));
    setTiers(divisionTiers(division, tournament));
  }, [division, tournament]);

  const updateTier = (index: number, patch: Partial<BracketTier>) => {
    setTiers((items) => items.map((item, i) => i === index ? { ...item, ...patch } : item));
  };
  const addTier = () => {
    const key = nextTierKey(tiers);
    setTiers((items) => [...items, {
      key,
      name: `${key}トーナメント`,
      mode: "top",
      from_rank: 1,
      to_rank: 1,
      bottom_count: 1,
      format: "bracket",
      third_place: false,
    }]);
  };
  const tierError = finalsEnabled ? validateTiers(tiers) : null;
  const inherits = division.league_count === null && division.courts === null && division.bracket_tiers === null;

  return (
    <div className="mt-3 min-w-0 overflow-hidden border-t border-court-100 pt-3">
      <button className="btn-ghost btn-sm w-full" onClick={() => setOpen((value) => !value)}>
        {open ? "大会形式の設定を閉じる" : "大会形式を設定"}
      </button>

      {open && (
        <div className="mt-3 min-w-0 space-y-4 overflow-hidden rounded-xl bg-court-50 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="label">
              リーグ数
              <input className="field mt-1" type="number" min={1} max={26} value={leagueCount} onChange={(e) => setLeagueCount(Number(e.target.value))} />
            </label>
            <label className="label">
              使用コート（カンマ区切り）
              <input className="field mt-1" placeholder="1, 2, 3, 4" value={courts} onChange={(e) => setCourts(e.target.value)} />
            </label>
            <label className="label">
              予選の試合順
              <select className="field mt-1" value={matchOrder} onChange={(e) => setMatchOrder(e.target.value as "balanced" | "toco_5_team")}>
                <option value="balanced">通常（連戦を避けるサークル方式）</option>
                <option value="toco_5_team">5チーム指定順（1-2、3-4、1-5…）</option>
              </select>
            </label>
            <label className="label">
              ゲーム名（カンマ区切り・任意）
              <input className="field mt-1" placeholder="女子ダブルス, 男子ダブルス, ミックスダブルス" value={gameLabels} onChange={(e) => setGameLabels(e.target.value)} />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm font-black text-court-800">
            <input className="h-5 w-5" type="checkbox" checked={finalsEnabled} onChange={(e) => setFinalsEnabled(e.target.checked)} />
            予選後に決勝ラウンドを行う
          </label>

          {finalsEnabled && (
            <div className="space-y-2">
              <p className="text-xs font-black text-court-800">決勝ラウンドの区分</p>
              {tiers.map((tier, index) => (
                <div key={tier.key} className="min-w-0 space-y-2 overflow-hidden rounded-xl bg-white p-3">
                  <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                    <span className="chip bg-court-800 text-white">{tier.key}</span>
                    <input className="field h-11 min-w-0" value={tier.name} onChange={(e) => updateTier(index, { name: e.target.value })} />
                    <button className="btn-danger btn-sm col-span-2 w-full sm:col-span-1 sm:w-auto" disabled={tiers.length <= 1} onClick={() => setTiers((items) => items.filter((_, i) => i !== index))}>削除</button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select className="field h-11 w-auto" value={tier.mode} onChange={(e) => updateTier(index, { mode: e.target.value as TierMode })}>
                      {(Object.keys(TIER_MODE_LABELS) as TierMode[]).map((mode) => <option key={mode} value={mode}>{TIER_MODE_LABELS[mode]}</option>)}
                    </select>
                    {tier.mode === "top" && <>
                      <input className="field h-11 w-16 text-center" type="number" min={1} value={tier.from_rank} onChange={(e) => updateTier(index, { from_rank: Number(e.target.value) })} />
                      <span className="text-xs font-bold">位〜</span>
                      <input className="field h-11 w-16 text-center" type="number" min={1} value={tier.to_rank} onChange={(e) => updateTier(index, { to_rank: Number(e.target.value) })} />
                      <span className="text-xs font-bold">位</span>
                    </>}
                    {tier.mode === "bottom" && <>
                      <input className="field h-11 w-16 text-center" type="number" min={1} value={tier.bottom_count} onChange={(e) => updateTier(index, { bottom_count: Number(e.target.value) })} />
                      <span className="text-xs font-bold">チーム</span>
                    </>}
                    <select className="field h-11 w-auto" value={tier.format} onChange={(e) => updateTier(index, { format: e.target.value as TierFormat })}>
                      {(Object.keys(TIER_FORMAT_LABELS) as TierFormat[]).map((format) => <option key={format} value={format}>{TIER_FORMAT_LABELS[format]}</option>)}
                    </select>
                    {tier.format === "bracket" && <label className="flex items-center gap-1 text-xs font-bold"><input type="checkbox" checked={tier.third_place} onChange={(e) => updateTier(index, { third_place: e.target.checked })} />3位決定戦</label>}
                  </div>
                </div>
              ))}
              <button className="btn-ghost btn-sm" onClick={addTier}>＋ 区分を追加</button>
              {tierError && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{tierError}</p>}
            </div>
          )}

          <p className="text-xs leading-relaxed text-ink-500">
            保存しても既存の試合結果は削除されません。リーグ数や試合順の変更は、次に対戦カードを作り直したときに反映されます。
          </p>
          <div className="grid gap-2 sm:flex sm:flex-wrap sm:justify-end">
            {!inherits && <button className="btn-ghost btn-sm w-full sm:w-auto" disabled={busy} onClick={onReset}>大会共通設定に戻す</button>}
            <button
              className="btn-primary btn-sm w-full sm:w-auto"
              disabled={busy || Boolean(tierError) || !courts.trim()}
              onClick={() => onSave({
                action: "update_format",
                id: division.id,
                league_count: leagueCount,
                courts: courts.split(/[,、\s]+/).map((value) => value.trim()).filter(Boolean),
                finals_enabled: finalsEnabled,
                qualifying_match_order: matchOrder,
                game_labels: gameLabels.split(/[,、\n]+/).map((value) => value.trim()).filter(Boolean),
                bracket_tiers: tiers,
              })}
            >
              この部門の形式を保存
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
