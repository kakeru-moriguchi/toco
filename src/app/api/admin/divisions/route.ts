import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { ensureLeagues, getDivisions, getTournament } from "@/lib/data";
import { errorMessage, fail, ok, requireAdmin, tournamentIdFromRequest } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return fail("認証が必要です。", 401);
  try {
    const tournament = await getTournament(tournamentIdFromRequest(req));
    return ok({ divisions: await getDivisions(tournament.id) });
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
      await ensureLeagues(tournament.id, data.id, tournament.league_count);
      return ok({ division: data, divisions: await getDivisions(tournament.id) });
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
      await ensureLeagues(tournament.id, id, tournament.league_count);
    } else {
      return fail("不明な操作です。");
    }

    return ok({ divisions: await getDivisions(tournament.id) });
  } catch (e) {
    return fail(errorMessage(e), 500);
  }
}
