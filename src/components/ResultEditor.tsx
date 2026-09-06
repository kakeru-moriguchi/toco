"use client";

import { useMemo, useState } from "react";
import { matchSets, maxSets, validateSets } from "@/lib/score";
import type { Match, SetScore } from "@/lib/types";

/** 管理画面用の結果入力・修正フォーム（リーグ戦・トーナメント共通） */
export function ResultEditor({
  match,
  teamA,
  teamB,
  setsToWin,
  busy,
  onSave,
  onClear,
  onStatus,
}: {
  match: Match;
  teamA: string;
  teamB: string;
  /** 何セット先取か */
  setsToWin: number;
  busy: boolean;
  onSave: (sets: SetScore[]) => void;
  onClear: () => void;
  onStatus: (status: "pending" | "in_progress") => void;
}) {
  const need = Math.max(1, setsToWin);
  const limit = maxSets(need);
  const ready = Boolean(match.team_a_id && match.team_b_id);

  const [inputs, setInputs] = useState<{ a: string; b: string }[]>(() => {
    const existing = matchSets(match);
    return Array.from({ length: limit }, (_, i) =>
      existing[i] ? { a: String(existing[i].a), b: String(existing[i].b) } : { a: "", b: "" }
    );
  });

  const sets: SetScore[] = useMemo(
    () =>
      inputs
        .filter((s) => s.a !== "" || s.b !== "")
        .map((s) => ({ a: Number(s.a || 0), b: Number(s.b || 0) })),
    [inputs]
  );
  const check = useMemo(() => validateSets(sets, need), [sets, need]);
  const clean = (s: string) => s.replace(/[^0-9]/g, "").slice(0, 2);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-bold">
        <span className="w-14 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{teamA}</span>
        <span className="shrink-0 text-ink-500">vs</span>
        <span className="min-w-0 flex-1 truncate text-right">{teamB}</span>
      </div>

      {inputs.map((v, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-xs font-bold text-court-800">
            {need === 1 ? "スコア" : `第${i + 1}`}
          </span>
          <input
            className="field h-11 flex-1 text-center text-lg font-black tabular-nums"
            inputMode="numeric"
            aria-label={`${teamA} 第${i + 1}セットの得点`}
            value={v.a}
            disabled={!ready}
            onChange={(e) =>
              setInputs((list) => list.map((x, j) => (j === i ? { ...x, a: clean(e.target.value) } : x)))
            }
          />
          <span className="shrink-0 text-ink-500">-</span>
          <input
            className="field h-11 flex-1 text-center text-lg font-black tabular-nums"
            inputMode="numeric"
            aria-label={`${teamB} 第${i + 1}セットの得点`}
            value={v.b}
            disabled={!ready}
            onChange={(e) =>
              setInputs((list) => list.map((x, j) => (j === i ? { ...x, b: clean(e.target.value) } : x)))
            }
          />
        </div>
      ))}

      {!ready && (
        <p className="text-xs text-ink-500">対戦チームが未確定のため、まだ結果を入力できません。</p>
      )}
      {ready && need > 1 && check.setsWon.a + check.setsWon.b > 0 && (
        <p className="text-xs font-bold text-court-800">
          セット {check.setsWon.a} - {check.setsWon.b}
          <span className="ml-2 font-normal text-ink-500">
            （合計 {check.totalPoints.a} - {check.totalPoints.b}）
          </span>
        </p>
      )}
      {ready && sets.length > 0 && !check.ok && check.error && (
        <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-xs font-bold text-amber-800">
          {check.error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          className="btn-primary btn-sm"
          disabled={busy || !ready || !check.ok}
          onClick={() => onSave(sets)}
        >
          結果を保存
        </button>
        {match.status === "pending" && ready && (
          <button className="btn-ghost btn-sm" disabled={busy} onClick={() => onStatus("in_progress")}>
            試合中にする
          </button>
        )}
        {match.status === "in_progress" && (
          <button className="btn-ghost btn-sm" disabled={busy} onClick={() => onStatus("pending")}>
            待機中に戻す
          </button>
        )}
        {match.status === "done" && (
          <button
            className="btn-danger btn-sm ml-auto"
            disabled={busy}
            onClick={() => {
              if (confirm("この試合の結果を取り消して「待機中」に戻します。よろしいですか？")) onClear();
            }}
          >
            結果を取り消す
          </button>
        )}
      </div>
    </div>
  );
}
