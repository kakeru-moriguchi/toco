import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { ensureLeagues, getDivisions, getTournament } from "@/lib/data";
import { errorMessage, fail, ok, requireAdmin, tournamentIdFromRequest } from "@/lib/api";
import { divisionLeagueCount } from "@/lib/divisionFormat";
import { normalizeTiers, validateTiers } from "@/lib/tiers";

export const dynamic = "force-dynamic";

async function divisionsWithTeamCounts(tournamentId: string) {
  const db = supabaseAdmin();
  const [divisions, teams] = await Promise.all([
    getDivisions(tournamentId),
    db.from("teams").select("division_id").eq("tournament_id", tournamentId),
  ]);
  if (teams.error) throw new Error(teams.error.message);
  const counts = new Map<string, number>();
  for (const team of teams.data ?? []) {
    counts.set(team.division_id, (counts.get(team.division_id) ?? 0) + 1);
  }
  return divisions.map((division) => ({
    ...division,
    team_count: counts.get(division.id) ?? 0,
  }));
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return fail("認証が必要です。", 401);
  try {
    const tournament = await getTournament(tournamentIdFromRequest(req));
    return ok({ divisions: await divisionsWithTeamCounts(tournament.id) });
  } catch (e) {
    return fail(errorMessage(e), 500);
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return fail("認証が必要です。", 401);
  try {
    const tournament = await getTournament(tournamentIdFromRequest(req));
    const body = await req.json();
    const action = String(body?.action ?? "");
    const db = supabaseAdmin();

    if (action === "add") {
      const name = String(body.name ?? "").trim();
      if (!name) return fail("部門名を入力してください。");
      const divisions = await getDivisions(tournament.id);
      const nextOrder = divisions.reduce((max, item) => Math.max(max, item.sort_order), -1) + 1;
      const { data, error } = await db
        .from("divisions")
        .insert({ tournament_id: tournament.id, name: name.slice(0, 60), sort_order: nextOrder })
        .select("*")
        .single();
      if (error) throw new Error(error.code === "23505" ? "同じ名前の部門があります。" : error.message);
      await ensureLeagues(tournament.id, data.id, divisionLeagueCount(data, tournament));
      return ok({ division: data, divisions: await divisionsWithTeamCounts(tournament.id) });
    }

    const id = String(body.id ?? "");
    if (!id) return fail("対象の部門が指定されていません。");
    const { data: division, error: findError } = await db
      .from("divisions")
      .select("*")
      .eq("id", id)
      .eq("tournament_id", tournament.id)
      .maybeSingle();
    if (findError) throw new Error(findError.message);
    if (!division) return fail("部門が見つかりません。");

    if (action === "rename") {
      const name = String(body.name ?? "").trim();
      if (!name) return fail("部門名を入力してください。");
      const { error } = await db
        .from("divisions")
        .update({ name: name.slice(0, 60), updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tournament_id", tournament.id);
      if (error) throw new Error(error.code === "23505" ? "同じ名前の部門があります。" : error.message);
    } else if (action === "update_format") {
      const leagueCount = Math.trunc(Number(body.league_count));
      if (!Number.isFinite(leagueCount) || leagueCount < 1 || leagueCount > 26) {
        return fail("リーグ数は1〜26で入力してください。");
      }
      const courts = Array.isArray(body.courts)
        ? body.courts.map((court: unknown) => String(court).trim()).filter(Boolean).slice(0, 20)
        : [];
      if (courts.length === 0) return fail("使用コートを1つ以上入力してください。");
      const matchOrder = body.qualifying_match_order === "toco_5_team" ? "toco_5_team" : "balanced";
      const finalsEnabled = body.finals_enabled !== false;
      const tiers = normalizeTiers(body.bracket_tiers);
      if (finalsEnabled) {
        const problem = validateTiers(tiers);
        if (problem) return fail(problem);
      }
      const labels = Array.isArray(body.game_labels)
        ? body.game_labels.map((label: unknown) => String(label).trim()).filter(Boolean).slice(0, 5)
        : [];
      const { error } = await db.from("divisions").update({
        league_count: leagueCount,
        courts,
        bracket_tiers: tiers,
        finals_enabled: finalsEnabled,
        qualifying_match_order: matchOrder,
        game_labels: labels.length > 0 ? labels : null,
        updated_at: new Date().toISOString(),
      }).eq("id", id).eq("tournament_id", tournament.id);
      if (error) throw new Error(error.message);
    } else if (action === "reset_format") {
      const { error } = await db.from("divisions").update({
        league_count: null,
        courts: null,
        bracket_tiers: null,
        finals_enabled: true,
        qualifying_match_order: "balanced",
        game_labels: null,
        updated_at: new Date().toISOString(),
      }).eq("id", id).eq("tournament_id", tournament.id);
      if (error) throw new Error(error.message);
    } else if (action === "set_public") {
      const { error } = await db.from("divisions").update({
        is_public: body.is_public === true,
        updated_at: new Date().toISOString(),
      }).eq("id", id).eq("tournament_id", tournament.id);
      if (error) throw new Error(error.message);
    } else if (action === "deactivate") {
      const active = (await getDivisions(tournament.id, false)).filter((item) => item.id !== id);
      if (active.length === 0) return fail("最後の有効な部門は無効化できません。");
      const { error } = await db
        .from("divisions")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tournament_id", tournament.id);
      if (error) throw new Error(error.message);
    } else if (action === "restore") {
      const { error } = await db
        .from("divisions")
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tournament_id", tournament.id);
      if (error) throw new Error(error.message);
      await ensureLeagues(tournament.id, id, divisionLeagueCount(division, tournament));
    } else {
      return fail("不明な操作です。");
    }

    return ok({ divisions: await divisionsWithTeamCounts(tournament.id) });
  } catch (e) {
    return fail(errorMessage(e), 500);
  }
}
