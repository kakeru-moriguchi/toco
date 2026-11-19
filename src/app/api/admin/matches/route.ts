import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { clearResult, getState, getTournament, logMatchEvent, saveResult } from "@/lib/data";
import { errorMessage, fail, ok, readSets, requireAdmin, tournamentIdFromRequest } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * 主催者による試合の編集
 * action:
 *   create        … 予選リーグの対戦カードを1試合ずつ作成
 *   delete        … 待機中・結果未入力の予選リーグ試合を削除
 *   result        … 結果の入力・修正
 *   clear         … 結果の取り消し（待機中に戻す）
 *   status        … 進行状況の変更（待機中 / 試合中 / 終了）
 *   schedule      … 試合番号 / 時間 / コート の変更
 *   bulk_schedule … 複数試合の試合番号 / 時間 / コートをまとめて変更
 *   move          … 進行順を1つ上/下へ入れ替え
 */
export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return fail("認証が必要です。", 401);
  try {
    const db = supabaseAdmin();
    const tournament = await getTournament(tournamentIdFromRequest(req));
    const body = await req.json();
    const action = String(body?.action ?? "");
    const id = String(body?.id ?? "");
    // 一括保存と新規作成は、トップレベルの既存試合IDを必要としない。
    if (!id && !["create", "bulk_schedule"].includes(action)) return fail("対象の試合が指定されていません。");

    if (action === "create") {
      const leagueId = String(body.league_id ?? "");
      const teamAId = String(body.team_a_id ?? "");
      const teamBId = String(body.team_b_id ?? "");
      if (!leagueId) return fail("リーグを選んでください。");
      if (!teamAId || !teamBId) return fail("対戦する2チームを選んでください。");
      if (teamAId === teamBId) return fail("異なる2チームを選んでください。");

      const matchNo = Math.trunc(Number(body.match_no));
      if (!Number.isFinite(matchNo) || matchNo < 1 || matchNo > 9999) {
        return fail("試合番号は1〜9999で入力してください。");
      }
      const scheduledAt = String(body.scheduled_at ?? "").trim();
      if (scheduledAt && !/^\d{1,2}:\d{2}$/.test(scheduledAt)) {
        return fail("時刻は 09:00 の形式で入力してください。");
      }

      const [{ data: league }, { data: teams }] = await Promise.all([
        db.from("leagues").select("id").eq("id", leagueId).eq("tournament_id", tournament.id).is("tier_key", null).maybeSingle(),
        db.from("teams").select("id, league_id").eq("tournament_id", tournament.id).in("id", [teamAId, teamBId]),
      ]);
      if (!league) return fail("選んだ予選リーグが見つかりません。画面を再読み込みしてください。");
      if ((teams ?? []).length !== 2 || (teams ?? []).some((team) => team.league_id !== leagueId)) {
        return fail("同じリーグに所属する2チームを選んでください。");
      }

      const court = String(body.court ?? "").trim().slice(0, 20);
      const { data: created, error } = await db
        .from("matches")
        .insert({
          tournament_id: tournament.id,
          stage: "league",
          league_id: leagueId,
          match_no: matchNo,
          scheduled_at: scheduledAt,
          court,
          status: "pending",
          team_a_id: teamAId,
          team_b_id: teamBId,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      await db.from("tournaments").update({ phase: "league" }).eq("id", tournament.id);
      await logMatchEvent({
        tournamentId: tournament.id,
        matchId: created.id,
        action: "manual_create",
        actor: "admin",
        payload: { league_id: leagueId, match_no: matchNo, scheduled_at: scheduledAt, court },
      });
    } else if (action === "delete") {
      const { data: match, error: findError } = await db
        .from("matches")
        .select("id, stage, tier_key, status, sets, score_a, score_b")
        .eq("id", id)
        .eq("tournament_id", tournament.id)
        .maybeSingle();
      if (findError) throw new Error(findError.message);
      if (!match) return fail("削除する試合が見つかりません。画面を再読み込みしてください。");
      if (match.stage !== "league" || match.tier_key !== null) {
        return fail("決勝ラウンドの試合は、決勝ラウンド画面から管理してください。");
      }
      if (
        match.status !== "pending" ||
        match.score_a !== null ||
        match.score_b !== null ||
        (Array.isArray(match.sets) && match.sets.length > 0)
      ) {
        return fail("結果や進行状況が入っている試合です。先に結果を取り消して待機中に戻してください。");
      }
      const { error: deleteError } = await db
        .from("matches")
        .delete()
        .eq("id", id)
        .eq("tournament_id", tournament.id);
      if (deleteError) throw new Error(deleteError.message);
    } else if (action === "result") {
      const sets = readSets(body);
      if (sets.length === 0) return fail("スコアを入力してください。");
      await saveResult({ matchId: id, sets, actor: "admin", tournamentId: tournament.id });
    } else if (action === "clear") {
      await clearResult(id, tournament.id);
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
    } else if (action === "bulk_schedule") {
      const updates = Array.isArray(body.updates) ? body.updates : [];
      if (updates.length === 0) return fail("変更した試合がありません。");
      if (updates.length > 300) return fail("一度に保存できるのは300試合までです。");

      const prepared: { matchId: string; patch: Record<string, unknown> }[] = [];
      for (const item of updates) {
        const matchId = String(item?.id ?? "");
        if (!matchId) return fail("対象の試合が指定されていません。");

        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (typeof item.court === "string") patch.court = item.court.trim().slice(0, 20);
        if (typeof item.scheduled_at === "string") {
          const v = item.scheduled_at.trim();
          if (v && !/^\d{1,2}:\d{2}$/.test(v)) return fail("時刻は 09:00 の形式で入力してください。");
          patch.scheduled_at = v;
        }
        if (item.match_no !== undefined) {
          const n = Math.trunc(Number(item.match_no));
          if (!Number.isFinite(n) || n < 0 || n > 9999) return fail("試合番号が不正です。");
          patch.match_no = n;
        }

        prepared.push({ matchId, patch });
      }

      // 全行を検証してから保存し、入力ミスで途中まで更新されるのを防ぐ。
      for (const { matchId, patch } of prepared) {
        const { error } = await db
          .from("matches")
          .update(patch)
          .eq("id", matchId)
          .eq("tournament_id", tournament.id);
        if (error) throw new Error(error.message);
      }
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
      const state = await getState(tournament.id);
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

    const state = await getState(tournament.id);
    return ok({ matches: state.matches });
  } catch (e) {
    return fail(errorMessage(e), 400);
  }
}
