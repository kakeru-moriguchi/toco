"use client";

import { useState } from "react";
import type { Match } from "@/lib/types";

/** 管理画面用の結果入力・修正フォーム（リーグ戦・トーナメント共通） */
export function ResultEditor({
  match,
  teamA,
  teamB,
  busy,
  onSave,
  onClear,
  onStatus,
}: {
  match: Match;
  teamA: string;
  teamB: string;
  busy: boolean;
  onSave: (a: number, b: number) => void;
  onClear: () => void;
  onStatus: (status: "pending" | "in_progress") => void;
}) {
  const [a, setA] = useState<string>(match.score_a?.toString() ?? "");
  const [b, setB] = useState<string>(match.score_b?.toString() ?? "");
  const ready = Boolean(match.team_a_id && match.team_b_id);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-bold">{teamA}</span>
        <input
          className="field h-11 w-16 text-center text-lg font-black tabular-nums"
          inputMode="numeric"
          aria-label={`${teamA} のスコア`}
          value={a}
          disabled={!ready}
          onChange={(e) => setA(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
        />
        <span className="text-ink-500">-</span>
        <input
          className="field h-11 w-16 text-center text-lg font-black tabular-nums"
          inputMode="numeric"
          aria-label={`${teamB} のスコア`}
          value={b}
          disabled={!ready}
          onChange={(e) => setB(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
        />
        <span className="min-w-0 flex-1 truncate text-right text-sm font-bold">{teamB}</span>
      </div>
      {!ready && (
        <p className="text-xs text-ink-500">対戦チームが未確定のため、まだ結果を入力できません。</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          className="btn-primary btn-sm"
          disabled={busy || !ready || a === "" || b === ""}
          onClick={() => onSave(Number(a), Number(b))}
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
