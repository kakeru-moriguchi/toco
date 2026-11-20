import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { ensureLeagues, getDivisions, getTournament } from "@/lib/data";
import { errorMessage, fail, ok, requireAdmin, tournamentIdFromRequest } from "@/lib/api";
import { divisionLeagueCount } from "@/lib/divisionFormat";

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
    if (action === "apply_toco_pdf_format") {
      const divisions = await getDivisions(tournament.id);
      const upper = [
        { key: "A", name: "上位トーナメント", mode: "top", from_rank: 1, to_rank: 2, bottom_count: 1, format: "bracket", third_place: true },
        { key: "B", name: "下位トーナメント", mode: "rest", from_rank: 3, to_rank: 5, bottom_count: 1, format: "bracket", third_place: false },
      ];
      const middle = [
        { key: "A", name: "上位トーナメント", mode: "top", from_rank: 1, to_rank: 3, bottom_count: 1, format: "bracket", third_place: true },
        { key: "B", name: "下位トーナメント", mode: "rest", from_rank: 4, to_rank: 5, bottom_count: 1, format: "bracket", third_place: false },
      ];
      let updated = 0;
      for (const item of divisions) {
        const compact = item.name.replace(/\s/g, "");
        const patch = compact.includes("初中")
          ? { league_count: 4, courts: ["1", "2", "3", "4"], bracket_tiers: upper, finals_enabled: true }
          : compact.includes("中上")
            ? { league_count: 2, courts: ["5", "6"], bracket_tiers: middle, finals_enabled: true }
            : compact.includes("50")
              ? { league_count: 1, courts: ["7", "8"], bracket_tiers: null, finals_enabled: false }
              : null;
        if (!patch) continue;
        const { error } = await db.from("divisions").update({
          ...patch,
          qualifying_match_order: "toco_5_team",
          game_labels: ["女子ダブルス", "男子ダブルス", "ミックスダブルス"],
          updated_at: new Date().toISOString(),
        }).eq("id", item.id).eq("tournament_id", tournament.id);
        if (error) throw new Error(error.message);
        updated++;
      }
      if (updated === 0) return fail("「初中級」「中上級」「50歳以上」のいずれかを含む部門名が見つかりませんでした。");
      return ok({ updated, divisions: await divisionsWithTeamCounts(tournament.id) });
    }
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
