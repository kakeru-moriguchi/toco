"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTournamentState } from "@/lib/useTournamentState";
import { matchGroupName, sideName } from "@/lib/view";
import { EmptyBlock, ErrorBlock, LoadingBlock, PageShell } from "@/components/ui";

/** 大きな数字入力（片手で押せるサイズにしてある） */
function ScoreInput({
  teamName,
  value,
  onChange,
}: {
  teamName: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="rounded-2xl bg-court-50 p-3">
      <p className="mb-2 break-words text-center text-base font-black leading-snug text-court-900">
        {teamName}
      </p>
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          aria-label={`${teamName} のスコアを1減らす`}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-3xl font-black text-court-700 shadow-card ring-1 ring-court-200 active:scale-95"
          onClick={() => onChange(Math.max(0, value - 1))}
        >
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          pattern="[0-9]*"
          className="h-20 w-24 rounded-2xl border-2 border-court-200 bg-white text-center text-4xl font-black tabular-nums text-court-900 outline-none focus:border-court-500"
          value={value}
          min={0}
          max={99}
          onChange={(e) => {
            const n = Number(e.target.value.replace(/[^0-9]/g, ""));
            onChange(Number.isFinite(n) ? Math.min(99, Math.max(0, n)) : 0);
          }}
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          type="button"
          aria-label={`${teamName} のスコアを1増やす`}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-court-700 text-3xl font-black text-white shadow-card active:scale-95"
          onClick={() => onChange(Math.min(99, value + 1))}
        >
          ＋
        </button>
      </div>
    </div>
  );
}

export default function ReportMatchPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = use(params);
  const router = useRouter();
  const { state, loading, error, refresh } = useTournamentState();

  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [step, setStep] = useState<"input" | "confirm" | "done">("input");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const match = useMemo(
    () => state?.matches.find((m) => m.id === matchId) ?? null,
    [state, matchId]
  );

  // すでに結果がある場合は、その値を初期表示にする（修正しやすくするため）
  useEffect(() => {
    if (!match || initialized) return;
    if (match.score_a !== null && match.score_b !== null) {
      setScoreA(match.score_a);
      setScoreB(match.score_b);
    }
    setInitialized(true);
  }, [match, initialized]);

  const teamA = match && state ? sideName(match, "a", state.teams) : "";
  const teamB = match && state ? sideName(match, "b", state.teams) : "";

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/matches/${matchId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scoreA, scoreB }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "登録できませんでした。");
      setStep("done");
      refresh();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "登録できませんでした。");
      setStep("input");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !state) {
    return (
      <PageShell title="結果入力" backHref="/report">
        <LoadingBlock />
      </PageShell>
    );
  }
  if (error) {
    return (
      <PageShell title="結果入力" backHref="/report">
        <ErrorBlock message={error} onRetry={refresh} />
      </PageShell>
    );
  }
  if (!match || !state) {
    return (
      <PageShell title="結果入力" backHref="/report">
        <EmptyBlock title="試合が見つかりませんでした" hint="一覧に戻ってもう一度選んでください。" />
      </PageShell>
    );
  }

  // 送信完了画面
  if (step === "done") {
    const winner = scoreA > scoreB ? teamA : teamB;
    return (
      <PageShell title="送信しました" backHref="/report">
        <div className="card space-y-4 p-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-court-100 text-3xl">
            ✅
          </div>
          <div>
            <p className="text-lg font-black text-court-900">結果を登録しました</p>
            <p className="mt-2 text-2xl font-black tabular-nums text-court-800">
              {scoreA} - {scoreB}
            </p>
            <p className="mt-1 text-sm font-bold text-ink-700">勝ち：{winner}</p>
          </div>
          <p className="text-sm text-ink-500">
            順位表・トーナメント表は自動で更新されます。
            <br />
            間違えた場合は同じ画面から入力し直すか、主催者に伝えてください。
          </p>
          <div className="grid gap-2">
            <Link href="/report" className="btn-primary">
              続けて別の試合を入力する
            </Link>
            <Link href="/standings" className="btn-ghost">
              順位表を見る
            </Link>
            <Link href="/" className="btn-ghost">
              トップに戻る
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  // 確認画面（誤入力対策）
  if (step === "confirm") {
    const winner = scoreA > scoreB ? teamA : teamB;
    return (
      <PageShell title="この内容で登録します" backHref="/report">
        <div className="card space-y-5 p-5">
          <p className="text-center text-sm font-bold text-ink-700">
            内容を確認してください
          </p>
          <div className="rounded-2xl bg-court-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 flex-1 break-words text-base font-black text-court-900">{teamA}</span>
              <span className="shrink-0 text-3xl font-black tabular-nums text-court-900">{scoreA}</span>
            </div>
            <div className="my-2 h-px bg-court-200" />
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 flex-1 break-words text-base font-black text-court-900">{teamB}</span>
              <span className="shrink-0 text-3xl font-black tabular-nums text-court-900">{scoreB}</span>
            </div>
          </div>
          <p className="text-center text-base font-black text-court-800">
            {teamA} {scoreA} - {scoreB} {teamB}
            <br />
            <span className="text-sm font-bold text-ink-700">勝ち：{winner}</span>
          </p>
          <p className="text-center text-sm font-bold text-ink-900">この結果で登録しますか？</p>

          {submitError && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{submitError}</p>
          )}

          <div className="grid gap-2">
            <button className="btn-accent" onClick={submit} disabled={submitting}>
              {submitting ? "送信中…" : "はい、この結果で登録する"}
            </button>
            <button className="btn-ghost" onClick={() => setStep("input")} disabled={submitting}>
              いいえ、入力し直す
            </button>
          </div>
        </div>
      </PageShell>
    );
  }

  // 入力画面
  const invalidSame = scoreA === scoreB;
  return (
    <PageShell
      title="結果入力"
      subtitle={`${match.court ? `コート${match.court} / ` : ""}${matchGroupName(match, state)}`}
      backHref="/report"
    >
      {match.status === "done" && (
        <div className="card mb-3 border-l-4 border-l-ball-500 p-3 text-sm font-bold text-court-800">
          この試合はすでに登録済みです（{match.score_a} - {match.score_b}）。
          <br />
          入力し直すと結果が上書きされます。
        </div>
      )}

      <div className="card space-y-3 p-4">
        <ScoreInput teamName={teamA} value={scoreA} onChange={setScoreA} />
        <p className="text-center text-sm font-black text-ink-500">VS</p>
        <ScoreInput teamName={teamB} value={scoreB} onChange={setScoreB} />

        {invalidSame && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-center text-sm font-bold text-amber-700">
            同点では登録できません。勝敗が決まったスコアを入力してください。
          </p>
        )}
        {submitError && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{submitError}</p>
        )}

        <button className="btn-accent w-full" onClick={() => setStep("confirm")} disabled={invalidSame}>
          結果を送信する
        </button>
        <button className="btn-ghost w-full" onClick={() => router.push("/report")}>
          試合一覧に戻る
        </button>
      </div>

      <p className="mt-4 px-2 text-xs leading-relaxed text-ink-500">
        送信すると順位表・トーナメント表がすぐに更新され、他の方のスマートフォンにも反映されます。
        間違えた場合は入力し直すか、主催者に修正を依頼してください。
      </p>
    </PageShell>
  );
}
