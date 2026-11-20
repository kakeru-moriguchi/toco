"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTournamentState } from "@/lib/useTournamentState";
import { matchGroupName, sideName } from "@/lib/view";
import { matchSets, maxSets, playsAllGames, setsWon, totalPoints, validateSets } from "@/lib/score";
import { EmptyBlock, ErrorBlock, LoadingBlock, PageShell } from "@/components/ui";
import type { SetScore } from "@/lib/types";
import { divisionGameLabels } from "@/lib/divisionFormat";

/** 入力中は空欄を許したいので、文字列で持っておく */
type SetInput = { a: string; b: string };

/** セット1つぶんの入力欄 */
function SetRow({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  value: SetInput;
  onChange: (v: SetInput) => void;
  autoFocus?: boolean;
}) {
  const clean = (s: string) => s.replace(/[^0-9]/g, "").slice(0, 2);
  return (
    <div className="flex items-center gap-2">
      <span className="w-[108px] shrink-0 text-xs font-black leading-tight text-court-800">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={`${label} 左のチームの得点`}
        className="h-16 min-w-0 flex-1 rounded-xl border-2 border-court-200 bg-white text-center text-3xl font-black tabular-nums text-court-900 outline-none focus:border-court-500"
        value={value.a}
        autoFocus={autoFocus}
        onChange={(e) => onChange({ ...value, a: clean(e.target.value) })}
        onFocus={(e) => e.currentTarget.select()}
      />
      <span className="shrink-0 text-lg font-black text-ink-500">-</span>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={`${label} 右のチームの得点`}
        className="h-16 min-w-0 flex-1 rounded-xl border-2 border-court-200 bg-white text-center text-3xl font-black tabular-nums text-court-900 outline-none focus:border-court-500"
        value={value.b}
        onChange={(e) => onChange({ ...value, b: clean(e.target.value) })}
        onFocus={(e) => e.currentTarget.select()}
      />
    </div>
  );
}

export default function ReportMatchPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = use(params);
  const router = useRouter();
  const { state, loading, error, refresh } = useTournamentState();

  const [inputs, setInputs] = useState<SetInput[]>([]);
  const [setCount, setSetCount] = useState<SetInput>({ a: "", b: "" });
  const [step, setStep] = useState<"input" | "confirm" | "done">("input");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const match = useMemo(
    () => state?.matches.find((m) => m.id === matchId) ?? null,
    [state, matchId]
  );
  const setsToWin = Math.max(1, state?.tournament.sets_to_win ?? 1);
  const limit = maxSets(setsToWin);
  const fixedGames = playsAllGames(setsToWin);

  // すでに結果がある場合は、その値を初期表示にする（修正しやすくするため）
  useEffect(() => {
    if (!match || !state || initialized) return;
    const existing = matchSets(match);
    setInputs(
      Array.from({ length: limit }, (_, i) =>
        existing[i] ? { a: String(existing[i].a), b: String(existing[i].b) } : { a: "", b: "" }
      )
    );
    const won = setsWon(existing);
    setSetCount(
      existing.length > 0 ? { a: String(won.a), b: String(won.b) } : { a: "", b: "" }
    );
    setInitialized(true);
  }, [match, state, initialized, limit]);

  const teamA = match && state ? sideName(match, "a", state.teams) : "";
  const teamB = match && state ? sideName(match, "b", state.teams) : "";

  /** 空欄のセットを落として、数値の配列にする */
  const sets: SetScore[] = useMemo(
    () =>
      inputs
        .filter((s) => s.a !== "" || s.b !== "")
        .map((s) => ({ a: Number(s.a || 0), b: Number(s.b || 0) })),
    [inputs]
  );
  const check = useMemo(() => validateSets(sets, setsToWin), [sets, setsToWin]);
  const enteredSetsWon = useMemo(() => setsWon(sets), [sets]);
  const setCountComplete = setCount.a !== "" && setCount.b !== "";
  const setCountMatches =
    setsToWin === 1 ||
    (setCountComplete &&
      Number(setCount.a) === enteredSetsWon.a &&
      Number(setCount.b) === enteredSetsWon.b);
  const enteredPoints = useMemo(() => totalPoints(sets), [sets]);

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/matches/${matchId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sets }),
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

  const gameLabels = divisionGameLabels(state.division);
  const setLabel = (i: number) => (setsToWin === 1 ? "スコア" : gameLabels[i] || `第${i + 1}${fixedGames ? "ゲーム" : "セット"}`);
  const detailText = sets.map((s) => `${s.a}-${s.b}`).join(" / ");
  const winnerName = check.winner === "a" ? teamA : teamB;

  // 送信完了画面
  if (step === "done") {
    return (
      <PageShell title="送信しました" backHref="/report">
        <div className="card space-y-4 p-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-court-100 text-3xl">
            ✅
          </div>
          <div>
            <p className="text-lg font-black text-court-900">結果を登録しました</p>
            <p className="mt-2 text-2xl font-black tabular-nums text-court-800">
              {setsToWin === 1 ? detailText : `${check.setsWon.a} - ${check.setsWon.b}`}
            </p>
            {setsToWin > 1 && <p className="text-sm font-bold text-ink-500">{detailText}</p>}
            <p className="mt-1 text-sm font-bold text-ink-700">勝ち：{winnerName}</p>
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
    return (
      <PageShell title="この内容で登録します" backHref="/report">
        <div className="card space-y-5 p-5">
          <p className="text-center text-sm font-bold text-ink-700">内容を確認してください</p>

          <div className="rounded-2xl bg-court-50 p-4">
            <p className="mb-2 text-center text-xs font-black text-ink-500">
              {setsToWin === 1 ? "点数" : fixedGames ? "ゲーム勝数" : "セット数"}
            </p>
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 flex-1 break-words text-base font-black text-court-900">
                {teamA}
              </span>
              <span className="shrink-0 text-3xl font-black tabular-nums text-court-900">
                {setsToWin === 1 ? check.totalPoints.a : check.setsWon.a}
              </span>
            </div>
            <div className="my-2 h-px bg-court-200" />
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 flex-1 break-words text-base font-black text-court-900">
                {teamB}
              </span>
              <span className="shrink-0 text-3xl font-black tabular-nums text-court-900">
                {setsToWin === 1 ? check.totalPoints.b : check.setsWon.b}
              </span>
            </div>
            {setsToWin > 1 && (
              <>
                <div className="my-2 h-px bg-court-200" />
                <p className="mb-2 text-center text-sm font-black text-court-800">
                  合計点 {check.totalPoints.a} - {check.totalPoints.b}
                </p>
                <ul className="space-y-1">
                  {sets.map((s, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <span className="w-[74px] shrink-0 whitespace-nowrap font-bold text-ink-500">{setLabel(i)}</span>
                      <span className="font-black tabular-nums text-court-900">
                        {s.a} - {s.b}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <p className="text-center text-base font-black text-court-800">
            {teamA}{" "}
            {setsToWin === 1 ? check.totalPoints.a : check.setsWon.a} -{" "}
            {setsToWin === 1 ? check.totalPoints.b : check.setsWon.b} {teamB}
            <br />
            <span className="text-sm font-bold text-ink-700">勝ち：{winnerName}</span>
          </p>
          <p className="text-center text-sm font-bold text-ink-900">この結果で登録しますか？</p>

          {submitError && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
              {submitError}
            </p>
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
  return (
    <PageShell
      title="結果入力"
      subtitle={`${match.court ? `コート${match.court} / ` : ""}${matchGroupName(match, state)}`}
      backHref="/report"
    >
      {match.status === "done" && (
        <div className="card mb-3 border-l-4 border-l-ball-500 p-3 text-sm font-bold text-court-800">
          この試合はすでに登録済みです。
          <br />
          入力し直すと結果が上書きされます。
        </div>
      )}

      <div className="card space-y-4 p-4">
        {/* どちらの欄がどのチームか */}
        <div className="flex items-center gap-2">
          <span className="w-[74px] shrink-0" />
          <span className="min-w-0 flex-1 break-words text-center text-sm font-black leading-tight text-court-900">
            {teamA}
          </span>
          <span className="shrink-0 text-sm font-black text-ink-500">vs</span>
          <span className="min-w-0 flex-1 break-words text-center text-sm font-black leading-tight text-court-900">
            {teamB}
          </span>
        </div>

        {setsToWin > 1 && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-ink-600">セット数を入力してください</p>
            <div className="flex items-center gap-2">
              <span className="w-[74px] shrink-0 whitespace-nowrap text-sm font-black text-court-800">
                セット数
              </span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                aria-label={`セット数 ${teamA}`}
                className="h-14 min-w-0 flex-1 rounded-xl border-2 border-court-200 bg-white text-center text-2xl font-black tabular-nums text-court-900 outline-none focus:border-court-500"
                value={setCount.a}
                autoFocus
                onChange={(e) =>
                  setSetCount((v) => ({ ...v, a: e.target.value.replace(/[^0-9]/g, "").slice(0, 1) }))
                }
                onFocus={(e) => e.currentTarget.select()}
              />
              <span className="shrink-0 text-lg font-black text-ink-500">-</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                aria-label={`セット数 ${teamB}`}
                className="h-14 min-w-0 flex-1 rounded-xl border-2 border-court-200 bg-white text-center text-2xl font-black tabular-nums text-court-900 outline-none focus:border-court-500"
                value={setCount.b}
                onChange={(e) =>
                  setSetCount((v) => ({ ...v, b: e.target.value.replace(/[^0-9]/g, "").slice(0, 1) }))
                }
                onFocus={(e) => e.currentTarget.select()}
              />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs font-bold text-ink-600">
            {fixedGames ? "3ゲームすべての点数を入力してください" : "各セットの点数を入力してください"}
          </p>
          {inputs.map((v, i) => (
            <SetRow
              key={i}
              label={setLabel(i)}
              value={v}
              autoFocus={i === 0 && setsToWin === 1}
              onChange={(next) => setInputs((list) => list.map((x, j) => (j === i ? next : x)))}
            />
          ))}
        </div>

        {sets.length > 0 && (
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-court-50 p-3 text-center">
            <div>
              <p className="text-[11px] font-bold text-ink-500">{fixedGames ? "ゲーム勝数" : "セット数"}</p>
              <p className="text-lg font-black tabular-nums text-court-800">
                {enteredSetsWon.a} - {enteredSetsWon.b}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-ink-500">合計点</p>
              <p className="text-lg font-black tabular-nums text-court-800">
                {enteredPoints.a} - {enteredPoints.b}
              </p>
            </div>
          </div>
        )}

        {fixedGames ? (
          <p className="rounded-xl bg-court-50 px-3 py-2 text-xs leading-relaxed text-ink-700">
            得失点集計のため、先に2勝しても<strong>第3ゲームまで必ず入力</strong>してください。
            3ゲームの合計点が順位表の得点・失点に反映されます。
            {check.setsWon.a + check.setsWon.b > 0 && (
              <span className="mt-1 block font-bold text-court-800">
                現在 {check.setsWon.a} - {check.setsWon.b}
              </span>
            )}
          </p>
        ) : setsToWin > 1 ? (
          <p className="rounded-xl bg-court-50 px-3 py-2 text-xs leading-relaxed text-ink-700">
            {setsToWin}セット先取です。決着したら残りのセットは<strong>空欄のまま</strong>で送信してください。
            {check.setsWon.a + check.setsWon.b > 0 && (
              <span className="mt-1 block font-bold text-court-800">
                現在 {check.setsWon.a} - {check.setsWon.b}
              </span>
            )}
          </p>
        ) : null}

        {setsToWin > 1 &&
          (setCount.a !== "" || setCount.b !== "" || sets.length === limit) &&
          !setCountMatches && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
              {setCountComplete
                ? `点数から計算したセット数は ${enteredSetsWon.a} - ${enteredSetsWon.b} です。セット数を確認してください。`
                : "両チームのセット数を入力してください。"}
            </p>
          )}

        {sets.length > 0 && !check.ok && check.error && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
            {check.error}
          </p>
        )}
        {submitError && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
            {submitError}
          </p>
        )}

        <button className="btn-accent w-full" onClick={() => setStep("confirm")} disabled={!check.ok || !setCountMatches}>
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
