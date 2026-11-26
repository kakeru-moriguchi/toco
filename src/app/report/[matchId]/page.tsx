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
  const [step, setStep] = useState<"input" | "confirm" | "done" | "approved">("input");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingPending, setEditingPending] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [teamPin, setTeamPin] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");

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
    const existing = match.approval_status === "pending" || match.approval_status === "rejected" ? match.pending_sets : matchSets(match);
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
        body: JSON.stringify({
          sets,
          team_id: check.winner === "a" ? match?.team_a_id : match?.team_b_id,
          pin: teamPin,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "登録できませんでした。");
      setStep("done");
      setEditingPending(false);
      refresh();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "登録できませんでした。");
      setStep("input");
    } finally {
      setSubmitting(false);
    }
  };

  const approve = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/matches/${matchId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          team_id: match?.pending_winner_team_id === match?.team_a_id ? match?.team_b_id : match?.team_a_id,
          pin: teamPin,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "承認できませんでした。");
      setStep("approved");
      refresh();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "承認できませんでした。");
    } finally {
      setSubmitting(false);
    }
  };

  const reject = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/matches/${matchId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject",
          team_id: match?.pending_winner_team_id === match?.team_a_id ? match?.team_b_id : match?.team_a_id,
          pin: teamPin,
          reason: rejectionReason,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "差し戻しできませんでした。");
      await refresh();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "差し戻しできませんでした。");
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
  const pendingSets = match.pending_sets ?? [];
  const pendingCheck = validateSets(pendingSets, setsToWin);
  const pendingDetailText = pendingSets.map((s) => `${s.a}-${s.b}`).join(" / ");
  const pendingWinnerName = match.pending_winner_team_id === match.team_a_id ? teamA : teamB;
  const pendingLoserName = match.pending_winner_team_id === match.team_a_id ? teamB : teamA;

  if (step === "approved") {
    return (
      <PageShell title="承認しました" backHref="/report">
        <div className="card space-y-4 p-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-court-100 text-3xl">✅</div>
          <div>
            <p className="text-lg font-black text-court-900">結果を正式に反映しました</p>
            <p className="mt-2 text-sm font-bold text-ink-600">順位表・決勝ラウンドも自動で更新されます。</p>
          </div>
          <Link href="/report" className="btn-primary">試合一覧に戻る</Link>
        </div>
      </PageShell>
    );
  }

  // 送信完了画面
  if (step === "done") {
    return (
      <PageShell title="承認待ちです" backHref="/report">
        <div className="card space-y-4 p-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-court-100 text-3xl">
            ✅
          </div>
          <div>
            <p className="text-lg font-black text-court-900">結果を承認待ちで送信しました</p>
            <p className="mt-2 text-2xl font-black tabular-nums text-court-800">
              {setsToWin === 1 ? detailText : `${check.setsWon.a} - ${check.setsWon.b}`}
            </p>
            {setsToWin > 1 && <p className="text-sm font-bold text-ink-500">{detailText}</p>}
            <p className="mt-1 text-sm font-bold text-ink-700">勝ち：{winnerName}</p>
          </div>
          <p className="text-sm text-ink-500">
            敗者側の「{check.winner === "a" ? teamB : teamA}」に承認してもらってください。
            <br />
            承認されるまでは順位表・決勝ラウンドへ反映されません。
          </p>
          <div className="grid gap-2">
            <Link href="/report" className="btn-primary">
              続けて別の試合を入力する
            </Link>
            <Link href="/" className="btn-ghost">
              トップに戻る
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  if (match.status === "done" && match.approval_status === "approved") {
    return (
      <PageShell title="確定した試合結果" subtitle={`${teamA} vs ${teamB}`} backHref="/report">
        <div className="card space-y-4 p-5 text-center">
          <span className="chip mx-auto bg-court-100 text-court-800">承認済み</span>
          <p className="text-3xl font-black tabular-nums text-court-900">
            {setsToWin === 1 ? `${match.score_a} - ${match.score_b}` : `${setsWon(match.sets).a} - ${setsWon(match.sets).b}`}
          </p>
          {setsToWin > 1 && <p className="font-bold text-ink-600">{match.sets.map((set) => `${set.a}-${set.b}`).join(" / ")}</p>}
          <p className="text-sm font-bold text-ink-700">勝ち：{match.winner_team_id === match.team_a_id ? teamA : teamB}</p>
          <p className="text-xs text-ink-500">参加者は確定後に変更できません。訂正が必要な場合は主催者へ連絡してください。</p>
          <Link href="/report" className="btn-primary">試合一覧に戻る</Link>
        </div>
      </PageShell>
    );
  }

  if (match.approval_status === "pending" && !editingPending) {
    return (
      <PageShell title="結果の承認" subtitle={`${teamA} vs ${teamB}`} backHref="/report">
        <div className="card space-y-5 p-5">
          <div className="rounded-2xl bg-amber-50 p-4 text-center">
            <p className="text-sm font-black text-amber-900">勝者側から結果が届いています</p>
            <p className="mt-2 text-2xl font-black tabular-nums text-court-900">
              {setsToWin === 1
                ? `${pendingCheck.totalPoints.a} - ${pendingCheck.totalPoints.b}`
                : `${pendingCheck.setsWon.a} - ${pendingCheck.setsWon.b}`}
            </p>
            {setsToWin > 1 && <p className="mt-1 text-sm font-bold text-ink-600">{pendingDetailText}</p>}
            <p className="mt-2 text-sm font-black text-court-800">勝ち：{pendingWinnerName}</p>
          </div>

          <div className="rounded-xl border-2 border-court-200 bg-white p-4 text-center">
            <p className="text-sm font-bold text-ink-700">敗者チーム</p>
            <p className="mt-1 text-lg font-black text-court-900">{pendingLoserName}</p>
            <p className="mt-2 text-xs leading-relaxed text-ink-500">
              点数に間違いがなければ、敗者チームの代表者が承認してください。
            </p>
          </div>

          {submitError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{submitError}</p>}

          <label className="text-sm font-black text-court-800">
            {pendingLoserName}のチームPIN
            <input className="field mt-1" type="password" inputMode="numeric" value={teamPin} onChange={(event) => setTeamPin(event.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="6〜12桁" />
          </label>

          <div className="grid gap-2">
            <button
              className="btn-accent"
              onClick={() => {
                if (confirm(`${pendingLoserName}の代表者として、この結果を承認します。よろしいですか？`)) approve();
              }}
              disabled={submitting || teamPin.length < 6}
            >
              {submitting ? "承認中…" : `${pendingLoserName}として承認する`}
            </button>
            <label className="text-sm font-black text-court-800">
              修正してほしい内容
              <textarea className="field mt-1 min-h-20 py-2" value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} placeholder="例：第2ゲームは 11-8 です" />
            </label>
            <button className="btn-danger" onClick={reject} disabled={submitting || teamPin.length < 6 || !rejectionReason.trim()}>
              修正を依頼する
            </button>
            <button className="btn-ghost" onClick={() => setEditingPending(true)} disabled={submitting}>
              勝者側として訂正する
            </button>
          </div>
          <p className="text-center text-xs leading-relaxed text-ink-500">
            承認後に正式結果となり、順位表・決勝ラウンドへ反映されます。
          </p>
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
          <p className="text-center text-sm font-bold text-ink-900">
            勝者側として、この結果を敗者側へ送信しますか？
          </p>

          {submitError && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
              {submitError}
            </p>
          )}

          <label className="block text-sm font-black text-court-800">
            勝利チーム「{winnerName}」のチームPIN
            <input className="field mt-1" type="password" inputMode="numeric" value={teamPin} onChange={(event) => setTeamPin(event.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="6〜12桁" />
          </label>

          <div className="grid gap-2">
            <button className="btn-accent" onClick={submit} disabled={submitting || teamPin.length < 6}>
              {submitting ? "送信中…" : "勝者側として承認待ちへ送信する"}
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
      {match.approval_status === "pending" && editingPending && (
        <div className="card mb-3 border-l-4 border-l-amber-500 p-3 text-sm font-bold text-amber-900">
          承認待ちの結果を修正します。再送信すると承認待ちの内容が上書きされます。
        </div>
      )}
      {match.approval_status === "rejected" && (
        <div className="card mb-3 border-l-4 border-l-red-500 p-3 text-sm text-red-800">
          <p className="font-black">敗者チームから修正依頼があります</p>
          <p className="mt-1 whitespace-pre-wrap">{match.rejection_reason || "点数を確認して再送信してください。"}</p>
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
        勝者側が送信した結果は承認待ちになります。敗者側が承認すると順位表・決勝ラウンドへ反映されます。
        間違えた場合は承認前に入力し直すか、主催者に修正を依頼してください。
      </p>
    </PageShell>
  );
}
