import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { clearResult, getState, getTournament, logMatchEvent, saveResult } from "@/lib/data";
import { errorMessage, fail, ok, requireAdmin } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * 主催者による試合の編集
 * action:
 *   result        … 結果の入力・修正
 *   clear         … 結果の取り消し（待機中に戻す）
 *   status        … 進行状況の変更（待機中 / 試合中 / 終了）
 *   schedule      … 試合番号 / 時間 / コート の変更
 *   move          … 進行順を1つ上/下へ入れ替え
 */
export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return fail("認証が必要です。", 401);
  try {
    const db = supabaseAdmin();
    const tournament = await getTournament();
    const body = await req.json();
    const action = String(body?.action ?? "");
    const id = String(body?.id ?? "");
    if (!id) return fail("対象の試合が指定されていません。");

    if (action === "result") {
      await saveResult({
        matchId: id,
        scoreA: Number(body.scoreA),
        scoreB: Number(body.scoreB),
        actor: "admin",
      });
    } else if (action === "clear") {
      await clearResult(id);
    } else if (action === "status") {
      const status = String(body.status ?? "");
      if (!["pending", "in_progress", "done"].includes(status)) return fail("状態の指定が不正です。");
      if (status === "done") {
        return fail("「終了」にするには結果を入力してください。");
      }
      await db
        .from("matches")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tournament_id", tournament.id);
      await logMatchEvent({
        tournamentId: tournament.id,
        matchId: id,
        action: "status",
        actor: "admin",
        payload: { status },
      });
    } else if (action === "schedule") {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof body.court === "string") patch.court = body.court.trim().slice(0, 20);
      if (typeof body.scheduled_at === "string") {
        const v = body.scheduled_at.trim();
        if (v && !/^\d{1,2}:\d{2}$/.test(v)) return fail("時刻は 09:00 の形式で入力してください。");
        patch.scheduled_at = v;
      }
      if (body.match_no !== undefined) {
        const n = Math.trunc(Number(body.match_no));
        if (!Number.isFinite(n) || n < 0 || n > 9999) return fail("試合番号が不正です。");
        patch.match_no = n;
      }
      const { error } = await db
        .from("matches")
        .update(patch)
        .eq("id", id)
        .eq("tournament_id", tournament.id);
      if (error) throw new Error(error.message);
    } else if (action === "move") {
      const state = await getState();
      const ordered = [...state.matches].sort((a, b) => a.match_no - b.match_no);
      const index = ordered.findIndex((m) => m.id === id);
      if (index < 0) return fail("対象の試合が見つかりませんでした。");

      // targetId が来たらその試合と入れ替える（コートで絞り込んでいるときに使う）。
      // 無ければ進行順で1つ隣と入れ替える。
      let target: number;
      if (body.targetId) {
        target = ordered.findIndex((m) => m.id === String(body.targetId));
        if (target < 0) return fail("入れ替え先の試合が見つかりませんでした。");
      } else {
        target = index + (body.direction === "up" ? -1 : 1);
      }
      if (target < 0 || target >= ordered.length) return fail("これ以上動かせません。");
      const a = ordered[index];
      const b = ordered[target];
      // 試合番号・時間・コートをまとめて入れ替える
      await db
        .from("matches")
        .update({ match_no: b.match_no, scheduled_at: b.scheduled_at, court: b.court })
        .eq("id", a.id);
      await db
        .from("matches")
        .update({ match_no: a.match_no, scheduled_at: a.scheduled_at, court: a.court })
        .eq("id", b.id);
    } else {
      return fail("不明な操作です。");
    }

    const state = await getState();
    return ok({ matches: state.matches });
  } catch (e) {
    return fail(errorMessage(e), 400);
  }
}
