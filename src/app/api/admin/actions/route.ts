import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  autoAssignSchedule,
  ensureLeagues,
  generateBracket,
  getDivision,
  getDivisions,
  getState,
  getTournament,
  regenerateLeagueMatches,
  syncConsolation,
  logMatchEvent,
} from "@/lib/data";
import { divisionIdFromRequest, errorMessage, fail, ok, requireAdmin, tournamentIdFromRequest } from "@/lib/api";
import { divisionCourts, divisionFinalsMinutes, divisionFinalsStartTime, divisionLeagueCount, divisionQualifyingMinutes, divisionStartTime } from "@/lib/divisionFormat";

export const dynamic = "force-dynamic";

/**
 * 大会運営のまとめ操作
 *   generate_league … リーグ戦の対戦カードを作成（作り直し）
 *   generate_bracket… 予選順位から決勝トーナメントを作成
 *   reset_bracket   … 決勝トーナメントを削除
 *   reset_tournament… 次の大会に向けて大会データを初期化
 *   auto_schedule   … 進行表（時間・コート）を自動割り当て
 */
export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return fail("認証が必要です。", 401);
  try {
    const db = supabaseAdmin();
    const tournament = await getTournament(tournamentIdFromRequest(req));
    const division = await getDivision(tournament.id, divisionIdFromRequest(req));
    const body = await req.json();
    const action = String(body?.action ?? "");

    if (action === 'cancel_consolation') {
      const tierKey = String(body.tier_key ?? '');
      if (body.confirm !== true || !tierKey) return fail('取り消すコンソレーションを確認してください。');
      const { data: cancelled, error } = await db.from('matches').update({ consolation_void: true, updated_at: new Date().toISOString() })
        .eq('tournament_id', tournament.id).eq('division_id', division.id).eq('tier_key', tierKey).eq('is_consolation', true).eq('consolation_void', false).select('id');
      if (error) throw new Error(error.message);
      for (const match of cancelled ?? []) await logMatchEvent({ tournamentId: tournament.id, divisionId: division.id, matchId: match.id, action: 'cancel_consolation', actor: 'admin' });
    } else if (action === 'sync_consolation' || action === 'pair_consolation') {
      await syncConsolation(tournament.id, division.id, action === 'pair_consolation' ? {
        tierKey: String(body.tier_key ?? ''), teamAId: String(body.team_a_id ?? ''), teamBId: String(body.team_b_id ?? ''),
      } : undefined);
    } else if (action === "generate_league") {
      const leagueCount = divisionLeagueCount(division, tournament);
      const recreatedLeagues = await ensureLeagues(tournament.id, division.id, leagueCount);
      if (recreatedLeagues.length !== leagueCount) {
        throw new Error("空の予選リーグを作り直せませんでした。もう一度リセットを実行してください。");
      }
      const state = await getState(tournament.id, division.id);
      const unassigned = state.teams.filter((t) => !t.league_id).length;
      if (unassigned > 0) {
        return fail(`リーグが未設定のチームが ${unassigned} 組あります。先にリーグ分けをしてください。`);
      }
      if (state.teams.length < 2) return fail("チームが足りません。");
      await regenerateLeagueMatches(tournament.id, division.id);
      await db.from("tournaments").update({ phase: "league" }).eq("id", tournament.id);
    } else if (action === "generate_bracket") {
      const state = await getState(tournament.id, division.id);
      const leagueMatches = state.matches.filter((m) => m.stage === "league");
      const remaining = leagueMatches.filter((m) => m.status !== "done").length;
      if (leagueMatches.length === 0) return fail("先にリーグ戦の対戦カードを作成してください。");
      if (remaining > 0 && !body.force) {
        return fail(
          `予選が ${remaining} 試合残っています。順位が確定していない状態で作成する場合は「未消化でも作成」を押してください。`
        );
      }
      const result = await generateBracket(tournament.id, division.id, { startTime: body.startTime });
      return ok({ ...(await getState(tournament.id, division.id)), tiers: result.tiers });
    } else if (action === "reset_bracket") {
      // 決勝ラウンドを丸ごと削除（トーナメントの試合と、総当たり級のリーグごと）
      await db
        .from("matches")
        .delete()
        .eq("tournament_id", tournament.id)
        .eq("division_id", division.id)
        .eq("stage", "bracket");
      const { data: tierLeagues } = await db
        .from("leagues")
        .select("id")
        .eq("tournament_id", tournament.id)
        .eq("division_id", division.id)
        .not("tier_key", "is", null);
      const ids = (tierLeagues ?? []).map((l) => l.id as string);
      if (ids.length > 0) await db.from("leagues").delete().in("id", ids);
      await db.from("tournaments").update({ phase: "league" }).eq("id", tournament.id);
    } else if (action === "reset_tournament") {
      // 大会名の入力をサーバー側でも照合し、誤操作や直接のAPI呼び出しを防ぐ。
      if (body.confirm !== tournament.name) {
        return fail("確認欄に現在の大会名を正確に入力してください。");
      }

      // 再実行できる順序で子データから削除する。
      // match_events は matches の削除に連動して消える（ON DELETE CASCADE）。
      const matches = await db.from("matches").delete().eq("tournament_id", tournament.id);
      if (matches.error) throw new Error(matches.error.message);

      const teams = await db.from("teams").delete().eq("tournament_id", tournament.id);
      if (teams.error) throw new Error(teams.error.message);

      const leagues = await db.from("leagues").delete().eq("tournament_id", tournament.id);
      if (leagues.error) throw new Error(leagues.error.message);

      const reset = await db
        .from("tournaments")
        .update({
          name: "ピックルボール大会",
          event_date: null,
          venue: "",
          note: "",
          phase: "setup",
          updated_at: new Date().toISOString(),
        })
        .eq("id", tournament.id);
      if (reset.error) throw new Error(reset.error.message);

      // 大会形式の設定は残し、空の予選リーグだけを作り直す。
      const divisions = await getDivisions(tournament.id, false);
      for (const item of divisions) {
        const leagueCount = divisionLeagueCount(item, tournament);
        const recreatedLeagues = await ensureLeagues(tournament.id, item.id, leagueCount);
        if (recreatedLeagues.length !== leagueCount) {
          throw new Error("空の予選リーグを作り直せませんでした。もう一度リセットを実行してください。");
        }
      }
    } else if (action === "auto_schedule") {
      const phase = body.stage === "bracket" || body.phase === "finals" ? "finals" : "qualifying";
      const state = await getState(tournament.id, division.id);
      const targets = state.matches.filter((match) => phase === "qualifying"
        ? match.stage === "league" && match.tier_key === null
        : !(match.stage === "league" && match.tier_key === null));
      if (targets.length === 0) {
        return fail(phase === "qualifying"
          ? "予選の対戦カードがありません。先にリーグ戦の対戦カードを作成してください。"
          : "決勝ラウンドの対戦カードがありません。先に決勝ラウンドを作成してください。");
      }
      if (targets.some((match) => match.scheduled_at || match.court) && body.confirmOverwrite !== true) {
        return fail("作成済みの進行表があります。上書きを確認してからもう一度実行してください。", 409);
      }
      const courts = Array.isArray(body.courts) && body.courts.length > 0 ? body.courts : divisionCourts(division, tournament);
      if (courts.length === 0) return fail("使用コートが設定されていません。大会情報でコートを設定してください。");
      const startTime = String(body.startTime || (phase === "finals" ? divisionFinalsStartTime(division, tournament) : divisionStartTime(division, tournament)));
      if (!/^\d{1,2}:\d{2}$/.test(startTime)) return fail("開始時刻を 09:00 の形式で設定してください。");
      await autoAssignSchedule(tournament.id, division.id, phase, {
        startTime,
        minutesPerMatch: Number(body.minutesPerMatch || (phase === "finals" ? divisionFinalsMinutes(division, tournament) : divisionQualifyingMinutes(division, tournament))),
        courts,
      });
    } else {
      return fail("不明な操作です。");
    }

    return ok(await getState(tournament.id, division.id));
  } catch (e) {
    return fail(errorMessage(e), 400);
  }
}
