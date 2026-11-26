import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { clearResult, getDivision, getState, getTournament, logMatchEvent, saveResult } from "@/lib/data";
import { divisionIdFromRequest, errorMessage, fail, ok, readSets, requireAdmin, tournamentIdFromRequest } from "@/lib/api";
import { findCourtConflict, findDependencyConflict, normalizeScheduledAt, type CourtSlot } from "@/lib/schedule";
import { divisionQualifyingMinutes } from "@/lib/divisionFormat";

export const dynamic = "force-dynamic";

async function validateCourtSchedule(params: {
  tournamentId: string;
  divisionId: string;
  updates: Map<string, Record<string, unknown>>;
  newMatch?: CourtSlot;
}) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("matches")
    .select("id, division_id, court, scheduled_at, duration_minutes, team_a_id, team_b_id, next_match_id, loser_next_match_id, consolation_void, stage, tier_key, round, is_consolation, is_third_place")
    .eq("tournament_id", params.tournamentId);
  if (error) throw new Error(error.message);
  const rows = (data ?? []).filter((row) => !row.consolation_void) as CourtSlot[];
  const tournament = await getTournament(params.tournamentId);
  const courts = [...new Set([...rows.map((row) => row.court), params.newMatch?.court ?? ""].filter(Boolean))];
  for (const [blockIndex, block] of tournament.schedule_blocks.entries()) {
    const [startHour, startMinute] = block.start_time.split(":").map(Number);
    const [endHour, endMinute] = block.end_time.split(":").map(Number);
    const duration = endHour * 60 + endMinute - (startHour * 60 + startMinute);
    for (const court of courts) {
      rows.push({ id: `__block_${blockIndex}_${court}`, division_id: "", court, scheduled_at: block.start_time, duration_minutes: duration });
    }
  }
  const byId = new Map(rows.map((row) => [row.id, row]));

  for (const [id, patch] of params.updates) {
    const current = byId.get(id);
    if (!current || current.division_id !== params.divisionId) {
      throw new Error("選択中の部門に属さない試合が含まれています。");
    }
    if (typeof patch.court === "string") current.court = patch.court;
    if (typeof patch.scheduled_at === "string") current.scheduled_at = patch.scheduled_at;
    if (typeof patch.duration_minutes === "number") current.duration_minutes = patch.duration_minutes;
  }
  if (params.newMatch) rows.push(params.newMatch);

  const watched = new Set(
    [...params.updates]
      .filter(([, patch]) => typeof patch.court === "string" || typeof patch.scheduled_at === "string" || typeof patch.duration_minutes === "number")
      .map(([id]) => id)
  );
  if (params.newMatch) watched.add(params.newMatch.id);
  if (findDependencyConflict(rows,watched)) {
    throw new Error('前の試合が終了する前に次の試合が始まります。決勝・準決勝・敗者戦の開始時刻を確認してください。');
  }
  const conflict = findCourtConflict(rows, watched);
  if (conflict) {
    throw new Error("指定した時間帯は、同じコート・同じチームの試合、または休憩・予約枠と重複しています。");
  }
}

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
 *   swap_bracket_slots … 決勝ラウンド作成後、未開始の出場枠を入れ替える
 */
export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return fail("認証が必要です。", 401);
  try {
    const db = supabaseAdmin();
    const tournament = await getTournament(tournamentIdFromRequest(req));
    const division = await getDivision(tournament.id, divisionIdFromRequest(req));
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
      let scheduledAt = String(body.scheduled_at ?? "").trim();
      if (scheduledAt && !/^\d{1,2}:\d{2}$/.test(scheduledAt)) {
        return fail("時刻は 09:00 の形式で入力してください。");
      }
      if (scheduledAt) scheduledAt = normalizeScheduledAt(scheduledAt);

      const [{ data: league }, { data: teams }] = await Promise.all([
        db.from("leagues").select("id").eq("id", leagueId).eq("tournament_id", tournament.id).eq("division_id", division.id).is("tier_key", null).maybeSingle(),
        db.from("teams").select("id, league_id").eq("tournament_id", tournament.id).eq("division_id", division.id).in("id", [teamAId, teamBId]),
      ]);
      if (!league) return fail("選んだ予選リーグが見つかりません。画面を再読み込みしてください。");
      if ((teams ?? []).length !== 2 || (teams ?? []).some((team) => team.league_id !== leagueId)) {
        return fail("同じリーグに所属する2チームを選んでください。");
      }

      const court = String(body.court ?? "").trim().slice(0, 20);
      await validateCourtSchedule({
        tournamentId: tournament.id,
        divisionId: division.id,
        updates: new Map<string, Record<string, unknown>>(),
        newMatch: {
          id: "__new_match__",
          division_id: division.id,
          court,
          scheduled_at: scheduledAt,
          duration_minutes: divisionQualifyingMinutes(division, tournament),
          team_a_id: teamAId,
          team_b_id: teamBId,
        },
      });
      const { data: created, error } = await db
        .from("matches")
        .insert({
          tournament_id: tournament.id,
          division_id: division.id,
          stage: "league",
          league_id: leagueId,
          match_no: matchNo,
          scheduled_at: scheduledAt,
          court,
          duration_minutes: divisionQualifyingMinutes(division, tournament),
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
        divisionId: division.id,
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
        .eq("division_id", division.id)
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
        .eq("tournament_id", tournament.id)
        .eq("division_id", division.id);
      if (deleteError) throw new Error(deleteError.message);
    } else if (action === "result") {
      const sets = readSets(body);
      if (sets.length === 0) return fail("スコアを入力してください。");
      await saveResult({
        matchId: id,
        sets,
        actor: "admin",
        tournamentId: tournament.id,
        divisionId: division.id,
      });
    } else if (action === "clear") {
      await clearResult(id, tournament.id, division.id);
    } else if (action === "status") {
      const status = String(body.status ?? "");
      if (!["pending", "in_progress", "done"].includes(status)) return fail("状態の指定が不正です。");
      if (status === "done") {
        return fail("「終了」にするには結果を入力してください。");
      }
      const { data: updated, error } = await db
        .from("matches")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tournament_id", tournament.id)
        .eq("division_id", division.id)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!updated) return fail("対象の試合が見つかりません。画面を再読み込みしてください。");
      await logMatchEvent({
        tournamentId: tournament.id,
        divisionId: division.id,
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
          patch.scheduled_at = v ? normalizeScheduledAt(v) : "";
        }
        if (item.duration_minutes !== undefined) {
          const duration = Math.trunc(Number(item.duration_minutes));
          if (!Number.isFinite(duration) || duration < 5 || duration > 180) return fail("試合時間は5〜180分で入力してください。");
          patch.duration_minutes = duration;
        }
        if (item.match_no !== undefined) {
          const n = Math.trunc(Number(item.match_no));
          if (!Number.isFinite(n) || n < 0 || n > 9999) return fail("試合番号が不正です。");
          patch.match_no = n;
        }

        prepared.push({ matchId, patch });
      }

      await validateCourtSchedule({
        tournamentId: tournament.id,
        divisionId: division.id,
        updates: new Map(prepared.map(({ matchId, patch }) => [matchId, patch])),
      });

      // 全行を検証してから保存し、入力ミスで途中まで更新されるのを防ぐ。
      for (const { matchId, patch } of prepared) {
        const { error } = await db
          .from("matches")
          .update(patch)
          .eq("id", matchId)
          .eq("tournament_id", tournament.id)
          .eq("division_id", division.id);
        if (error) throw new Error(error.message);
      }
    } else if (action === "schedule") {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof body.court === "string") patch.court = body.court.trim().slice(0, 20);
      if (typeof body.scheduled_at === "string") {
        const v = body.scheduled_at.trim();
        if (v && !/^\d{1,2}:\d{2}$/.test(v)) return fail("時刻は 09:00 の形式で入力してください。");
        patch.scheduled_at = v ? normalizeScheduledAt(v) : "";
      }
      if (body.duration_minutes !== undefined) {
        const duration = Math.trunc(Number(body.duration_minutes));
        if (!Number.isFinite(duration) || duration < 5 || duration > 180) return fail("試合時間は5〜180分で入力してください。");
        patch.duration_minutes = duration;
      }
      if (body.match_no !== undefined) {
        const n = Math.trunc(Number(body.match_no));
        if (!Number.isFinite(n) || n < 0 || n > 9999) return fail("試合番号が不正です。");
        patch.match_no = n;
      }
      await validateCourtSchedule({
        tournamentId: tournament.id,
        divisionId: division.id,
        updates: new Map([[id, patch]]),
      });
      const { error } = await db
        .from("matches")
        .update(patch)
        .eq("id", id)
        .eq("tournament_id", tournament.id)
        .eq("division_id", division.id);
      if (error) throw new Error(error.message);
    } else if (action === "swap_bracket_slots") {
      const targetId = String(body.target_id ?? "");
      const slot = body.slot === "b" ? "b" : "a";
      const targetSlot = body.target_slot === "b" ? "b" : "a";
      const { data: rows, error } = await db.from("matches").select("*")
        .in("id", [id, targetId]).eq("tournament_id", tournament.id).eq("division_id", division.id);
      if (error) throw new Error(error.message);
      if (!rows || rows.length !== 2) return fail("入れ替える試合が見つかりません。");
      const first = rows.find((row) => row.id === id);
      const second = rows.find((row) => row.id === targetId);
      if (!first || !second || first.stage !== "bracket" || second.stage !== "bracket" || first.tier_key !== second.tier_key) {
        return fail("同じ決勝ラウンド内の枠だけ入れ替えできます。");
      }
      const { count } = await db.from("matches").select("id", { count: "exact", head: true })
        .eq("tournament_id", tournament.id).eq("division_id", division.id).eq("tier_key", first.tier_key).neq("status", "pending");
      if ((count ?? 0) > 0) return fail("試合開始後は組み合わせを入れ替えできません。結果を取り消してから操作してください。");
      const firstId = slot === "a" ? first.team_a_id : first.team_b_id;
      const secondId = targetSlot === "a" ? second.team_a_id : second.team_b_id;
      if (!firstId || !secondId) return fail("チームが確定している2つの枠を選んでください。");
      const firstLabel = slot === "a" ? first.team_a_label : first.team_b_label;
      const secondLabel = targetSlot === "a" ? second.team_a_label : second.team_b_label;
      const firstPatch = slot === "a" ? { team_a_id: secondId, team_a_label: secondLabel } : { team_b_id: secondId, team_b_label: secondLabel };
      const secondPatch = targetSlot === "a" ? { team_a_id: firstId, team_a_label: firstLabel } : { team_b_id: firstId, team_b_label: firstLabel };
      const firstUpdate = await db.from("matches").update(firstPatch).eq("id", first.id).eq("status", "pending");
      if (firstUpdate.error) throw new Error(firstUpdate.error.message);
      const secondUpdate = await db.from("matches").update(secondPatch).eq("id", second.id).eq("status", "pending");
      if (secondUpdate.error) throw new Error(secondUpdate.error.message);
    } else if (action === "move") {
      const state = await getState(tournament.id, division.id);
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
      await validateCourtSchedule({ tournamentId: tournament.id, divisionId: division.id, updates: new Map([
        [a.id,{ match_no: b.match_no, scheduled_at: b.scheduled_at, court: b.court, duration_minutes: b.duration_minutes }],
        [b.id,{ match_no: a.match_no, scheduled_at: a.scheduled_at, court: a.court, duration_minutes: a.duration_minutes }],
      ]) });
      // 試合番号・時間・コートをまとめて入れ替える
      await db
        .from("matches")
        .update({ match_no: b.match_no, scheduled_at: b.scheduled_at, court: b.court, duration_minutes: b.duration_minutes })
        .eq("id", a.id)
        .eq("tournament_id", tournament.id)
        .eq("division_id", division.id);
      await db
        .from("matches")
        .update({ match_no: a.match_no, scheduled_at: a.scheduled_at, court: a.court, duration_minutes: a.duration_minutes })
        .eq("id", b.id)
        .eq("tournament_id", tournament.id)
        .eq("division_id", division.id);
    } else {
      return fail("不明な操作です。");
    }

    const state = await getState(tournament.id, division.id);
    return ok({ matches: state.matches });
  } catch (e) {
    return fail(errorMessage(e), 400);
  }
}
