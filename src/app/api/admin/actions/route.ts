import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  autoAssignSchedule,
  ensureLeagues,
  generateBracket,
  getState,
  getTournament,
  regenerateLeagueMatches,
} from "@/lib/data";
import { errorMessage, fail, ok, requireAdmin } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * 大会運営のまとめ操作
 *   generate_league … リーグ戦の対戦カードを作成（作り直し）
 *   generate_bracket… 予選順位から決勝トーナメントを作成
 *   reset_bracket   … 決勝トーナメントを削除
 *   auto_schedule   … 進行表（時間・コート）を自動割り当て
 */
export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return fail("認証が必要です。", 401);
  try {
    const db = supabaseAdmin();
    const tournament = await getTournament();
    const body = await req.json();
    const action = String(body?.action ?? "");

    if (action === "generate_league") {
      await ensureLeagues(tournament.id, tournament.league_count);
      const state = await getState();
      const unassigned = state.teams.filter((t) => !t.league_id).length;
      if (unassigned > 0) {
        return fail(`リーグが未設定のチームが ${unassigned} 組あります。先にリーグ分けをしてください。`);
      }
      if (state.teams.length < 2) return fail("チームが足りません。");
      await regenerateLeagueMatches(tournament.id);
      await db.from("tournaments").update({ phase: "league" }).eq("id", tournament.id);
    } else if (action === "generate_bracket") {
      const state = await getState();
      const leagueMatches = state.matches.filter((m) => m.stage === "league");
      const remaining = leagueMatches.filter((m) => m.status !== "done").length;
      if (leagueMatches.length === 0) return fail("先にリーグ戦の対戦カードを作成してください。");
      if (remaining > 0 && !body.force) {
        return fail(
          `予選が ${remaining} 試合残っています。順位が確定していない状態で作成する場合は「未消化でも作成」を押してください。`
        );
      }
      const result = await generateBracket(tournament.id, { startTime: body.startTime });
      return ok({ ...(await getState()), qualifiers: result.qualifiers });
    } else if (action === "reset_bracket") {
      await db.from("matches").delete().eq("tournament_id", tournament.id).eq("stage", "bracket");
      await db.from("tournaments").update({ phase: "league" }).eq("id", tournament.id);
    } else if (action === "auto_schedule") {
      const stage = body.stage === "bracket" ? "bracket" : "league";
      await autoAssignSchedule(tournament.id, stage, {
        startTime: String(body.startTime || tournament.start_time),
        minutesPerMatch: Number(body.minutesPerMatch || tournament.minutes_per_match),
        courts: Array.isArray(body.courts) && body.courts.length > 0 ? body.courts : tournament.courts,
      });
    } else {
      return fail("不明な操作です。");
    }

    return ok(await getState());
  } catch (e) {
    return fail(errorMessage(e), 400);
  }
}
