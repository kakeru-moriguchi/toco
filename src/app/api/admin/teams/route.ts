import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { defaultLeagueName, ensureLeagues, getDivision, getState, getTournament } from "@/lib/data";
import { divisionLeagueCount } from "@/lib/divisionFormat";
import { divisionIdFromRequest, errorMessage, fail, ok, requireAdmin, tournamentIdFromRequest } from "@/lib/api";
import type { Team } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * チームの登録・編集・削除・リーグ分け
 * action:
 *   add        … 1チーム追加
 *   bulk_add   … 改行区切りでまとめて追加
 *   update     … 名前 / メンバー / 所属リーグ の更新
 *   move_division … 別部門へ移動（試合がない場合のみ）
 *   remove     … 削除（試合がない場合のみ）
 *   auto_assign… 登録順にA,B,C,D…へ均等に振り分け
 *   shuffle    … ランダムに振り分け
 */
export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return fail("認証が必要です。", 401);
  try {
    const db = supabaseAdmin();
    const tournament = await getTournament(tournamentIdFromRequest(req));
    const division = await getDivision(tournament.id, divisionIdFromRequest(req));
    const body = await req.json();
    const action = String(body?.action ?? "");

    if (action === "add") {
      const name = String(body.name ?? "").trim();
      if (!name) return fail("チーム名を入力してください。");
      if (body.league_id) {
        const { data: league } = await db
          .from("leagues")
          .select("id")
          .eq("id", String(body.league_id))
          .eq("tournament_id", tournament.id)
          .eq("division_id", division.id)
          .maybeSingle();
        if (!league) return fail("選択中の部門に属さないリーグです。");
      }
      const { data: last } = await db
        .from("teams")
        .select("sort_order")
        .eq("tournament_id", tournament.id)
        .eq("division_id", division.id)
        .order("sort_order", { ascending: false })
        .limit(1);
      const nextOrder = (last?.[0]?.sort_order ?? -1) + 1;
      const { error } = await db.from("teams").insert({
        tournament_id: tournament.id,
        division_id: division.id,
        name: name.slice(0, 60),
        members: String(body.members ?? "").slice(0, 120),
        league_id: body.league_id || null,
        sort_order: nextOrder,
      });
      if (error) throw new Error(error.message);
    } else if (action === "bulk_add") {
      const lines = String(body.text ?? "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 200);
      if (lines.length === 0) return fail("追加するチームがありません。");
      const { data: last } = await db
        .from("teams")
        .select("sort_order")
        .eq("tournament_id", tournament.id)
        .eq("division_id", division.id)
        .order("sort_order", { ascending: false })
        .limit(1);
      let order = (last?.[0]?.sort_order ?? -1) + 1;
      // 「チーム名,メンバー」形式にも対応
      const rows = lines.map((line) => {
        const [name, members = ""] = line.split(/[,、\t]/);
        return {
          tournament_id: tournament.id,
          division_id: division.id,
          name: name.trim().slice(0, 60),
          members: members.trim().slice(0, 120),
          league_id: null,
          sort_order: order++,
        };
      });
      const { error } = await db.from("teams").insert(rows);
      if (error) throw new Error(error.message);
    } else if (action === "update") {
      const id = String(body.id ?? "");
      if (!id) return fail("対象のチームが指定されていません。");
      const { data: currentTeam, error: teamError } = await db
        .from("teams")
        .select("id, league_id")
        .eq("id", id)
        .eq("tournament_id", tournament.id)
        .eq("division_id", division.id)
        .maybeSingle();
      if (teamError) throw new Error(teamError.message);
      if (!currentTeam) return fail("チームが見つかりません。画面を再読み込みしてください。");
      const patch: Record<string, unknown> = {};
      if (typeof body.name === "string") {
        const name = body.name.trim();
        if (!name) return fail("チーム名を入力してください。");
        patch.name = name.slice(0, 60);
      }
      if (typeof body.members === "string") patch.members = body.members.slice(0, 120);
      if (body.league_id !== undefined) {
        const nextLeagueId = body.league_id ? String(body.league_id) : null;
        if (body.league_id) {
          const { data: league } = await db
            .from("leagues")
            .select("id")
            .eq("id", String(body.league_id))
            .eq("tournament_id", tournament.id)
            .eq("division_id", division.id)
            .maybeSingle();
          if (!league) return fail("選択中の部門に属さないリーグです。");
        }
        if (nextLeagueId !== currentTeam.league_id) {
          const { count, error } = await db
            .from("matches")
            .select("id", { count: "exact", head: true })
            .eq("tournament_id", tournament.id)
            .eq("division_id", division.id)
            .or(`team_a_id.eq.${id},team_b_id.eq.${id}`);
          if (error) throw new Error(error.message);
          if ((count ?? 0) > 0) {
            return fail("このチームには試合があるため、リーグを変更できません。先に対戦カードをリセットしてください。", 409);
          }
        }
        patch.league_id = nextLeagueId;
      }
      if (body.sort_order !== undefined) patch.sort_order = Math.trunc(Number(body.sort_order)) || 0;
      const { error } = await db
        .from("teams")
        .update(patch)
        .eq("id", id)
        .eq("tournament_id", tournament.id)
        .eq("division_id", division.id);
      if (error) throw new Error(error.message);
    } else if (action === "move_division") {
      const id = String(body.id ?? "");
      const targetDivisionId = String(body.target_division_id ?? "");
      if (!id || !targetDivisionId) return fail("移動先の部門を選択してください。");
      if (targetDivisionId === division.id) return fail("現在と同じ部門が選択されています。");

      const [{ data: team, error: teamError }, { data: target, error: targetError }] = await Promise.all([
        db
          .from("teams")
          .select("id")
          .eq("id", id)
          .eq("tournament_id", tournament.id)
          .eq("division_id", division.id)
          .maybeSingle(),
        db
          .from("divisions")
          .select("id")
          .eq("id", targetDivisionId)
          .eq("tournament_id", tournament.id)
          .eq("is_active", true)
          .maybeSingle(),
      ]);
      if (teamError) throw new Error(teamError.message);
      if (targetError) throw new Error(targetError.message);
      if (!team) return fail("移動するチームが見つかりません。画面を再読み込みしてください。");
      if (!target) return fail("移動先の部門が見つからないか、無効になっています。");

      const { count, error: matchError } = await db
        .from("matches")
        .select("id", { count: "exact", head: true })
        .eq("tournament_id", tournament.id)
        .eq("division_id", division.id)
        .or(`team_a_id.eq.${id},team_b_id.eq.${id}`);
      if (matchError) throw new Error(matchError.message);
      if ((count ?? 0) > 0) {
        return fail("このチームには試合があるため、部門を移動できません。先に対戦カードをリセットしてください。", 409);
      }

      const { data: last, error: orderError } = await db
        .from("teams")
        .select("sort_order")
        .eq("tournament_id", tournament.id)
        .eq("division_id", targetDivisionId)
        .order("sort_order", { ascending: false })
        .limit(1);
      if (orderError) throw new Error(orderError.message);
      const nextOrder = (last?.[0]?.sort_order ?? -1) + 1;
      const { error } = await db
        .from("teams")
        .update({ division_id: targetDivisionId, league_id: null, sort_order: nextOrder })
        .eq("id", id)
        .eq("tournament_id", tournament.id)
        .eq("division_id", division.id);
      if (error) throw new Error(error.message);
    } else if (action === "remove") {
      const id = String(body.id ?? "");
      if (!id) return fail("対象のチームが指定されていません。");
      const { data: team, error: teamError } = await db
        .from("teams")
        .select("id")
        .eq("id", id)
        .eq("tournament_id", tournament.id)
        .eq("division_id", division.id)
        .maybeSingle();
      if (teamError) throw new Error(teamError.message);
      if (!team) return fail("削除するチームが見つかりません。画面を再読み込みしてください。");
      const { count, error: matchError } = await db
        .from("matches")
        .select("id", { count: "exact", head: true })
        .eq("tournament_id", tournament.id)
        .eq("division_id", division.id)
        .or(`team_a_id.eq.${id},team_b_id.eq.${id}`);
      if (matchError) throw new Error(matchError.message);
      if ((count ?? 0) > 0) {
        return fail("このチームには試合があるため削除できません。先に対戦カードをリセットしてください。", 409);
      }
      const { error } = await db
        .from("teams")
        .delete()
        .eq("id", id)
        .eq("tournament_id", tournament.id)
        .eq("division_id", division.id);
      if (error) throw new Error(error.message);
    } else if (action === "auto_assign" || action === "shuffle") {
      const { count, error: matchError } = await db
        .from("matches")
        .select("id", { count: "exact", head: true })
        .eq("tournament_id", tournament.id)
        .eq("division_id", division.id);
      if (matchError) throw new Error(matchError.message);
      if ((count ?? 0) > 0) {
        return fail("対戦カード作成後はリーグを振り分け直せません。先に対戦カードをリセットしてください。", 409);
      }
      const leagues = await ensureLeagues(tournament.id, division.id, divisionLeagueCount(division, tournament));
      const state = await getState(tournament.id, division.id);
      let teams: Team[] = [...state.teams].sort((a, b) => a.sort_order - b.sort_order);
      if (action === "shuffle") {
        for (let i = teams.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [teams[i], teams[j]] = [teams[j], teams[i]];
        }
      }
      // 蛇行（1,2,3,4 / 4,3,2,1）で振り分けると実力が偏りにくい
      const buckets: Team[][] = leagues.map(() => []);
      teams.forEach((team, i) => {
        const row = Math.floor(i / leagues.length);
        const col = i % leagues.length;
        const index = row % 2 === 0 ? col : leagues.length - 1 - col;
        buckets[index].push(team);
      });
      for (let li = 0; li < leagues.length; li++) {
        for (let ti = 0; ti < buckets[li].length; ti++) {
          await db
            .from("teams")
            .update({ league_id: leagues[li].id, sort_order: li * 1000 + ti })
            .eq("id", buckets[li][ti].id);
        }
      }
    } else if (action === "rename_league") {
      const id = String(body.id ?? "");
      const name = String(body.name ?? "").trim();
      if (!id) return fail("対象のリーグが指定されていません。");
      if (!name) return fail("リーグ名を入力してください。");
      const { error } = await db
        .from("leagues")
        .update({ name: name.slice(0, 20) })
        .eq("id", id)
        .eq("tournament_id", tournament.id)
        .eq("division_id", division.id);
      if (error) throw new Error(error.message);
    } else if (action === "renumber_leagues") {
      // ①②③… の形式に一括で付け直す（キーボードから入力しにくいため）
      const leagues = await ensureLeagues(tournament.id, division.id, divisionLeagueCount(division, tournament));
      for (let i = 0; i < leagues.length; i++) {
        await db.from("leagues").update({ name: defaultLeagueName(i) }).eq("id", leagues[i].id);
      }
    } else {
      return fail("不明な操作です。");
    }

    const state = await getState(tournament.id, division.id);
    return ok({ teams: state.teams, leagues: state.leagues });
  } catch (e) {
    return fail(errorMessage(e), 500);
  }
}
