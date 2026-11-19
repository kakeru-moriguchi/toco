import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { defaultLeagueName, ensureLeagues, getState, getTournament } from "@/lib/data";
import { errorMessage, fail, ok, requireAdmin, tournamentIdFromRequest } from "@/lib/api";
import type { Team } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * チームの登録・編集・削除・リーグ分け
 * action:
 *   add        … 1チーム追加
 *   bulk_add   … 改行区切りでまとめて追加
 *   update     … 名前 / メンバー / 所属リーグ の更新
 *   remove     … 削除
 *   auto_assign… 登録順にA,B,C,D…へ均等に振り分け
 *   shuffle    … ランダムに振り分け
 */
export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return fail("認証が必要です。", 401);
  try {
    const db = supabaseAdmin();
    const tournament = await getTournament(tournamentIdFromRequest(req));
    const body = await req.json();
    const action = String(body?.action ?? "");

    if (action === "add") {
      const name = String(body.name ?? "").trim();
      if (!name) return fail("チーム名を入力してください。");
      const { data: last } = await db
        .from("teams")
        .select("sort_order")
        .eq("tournament_id", tournament.id)
        .order("sort_order", { ascending: false })
        .limit(1);
      const nextOrder = (last?.[0]?.sort_order ?? -1) + 1;
      const { error } = await db.from("teams").insert({
        tournament_id: tournament.id,
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
        .order("sort_order", { ascending: false })
        .limit(1);
      let order = (last?.[0]?.sort_order ?? -1) + 1;
      // 「チーム名,メンバー」形式にも対応
      const rows = lines.map((line) => {
        const [name, members = ""] = line.split(/[,、\t]/);
        return {
          tournament_id: tournament.id,
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
      const patch: Record<string, unknown> = {};
      if (typeof body.name === "string") patch.name = body.name.trim().slice(0, 60);
      if (typeof body.members === "string") patch.members = body.members.slice(0, 120);
      if (body.league_id !== undefined) patch.league_id = body.league_id || null;
      if (body.sort_order !== undefined) patch.sort_order = Math.trunc(Number(body.sort_order)) || 0;
      const { error } = await db.from("teams").update(patch).eq("id", id).eq("tournament_id", tournament.id);
      if (error) throw new Error(error.message);
    } else if (action === "remove") {
      const id = String(body.id ?? "");
      if (!id) return fail("対象のチームが指定されていません。");
      // そのチームが関わる試合も一緒に削除する（残しておくと空欄の試合になるため）
      await db
        .from("matches")
        .delete()
        .eq("tournament_id", tournament.id)
        .or(`team_a_id.eq.${id},team_b_id.eq.${id}`);
      const { error } = await db.from("teams").delete().eq("id", id).eq("tournament_id", tournament.id);
      if (error) throw new Error(error.message);
    } else if (action === "auto_assign" || action === "shuffle") {
      const leagues = await ensureLeagues(tournament.id, tournament.league_count);
      const state = await getState(tournament.id);
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
        .eq("tournament_id", tournament.id);
      if (error) throw new Error(error.message);
    } else if (action === "renumber_leagues") {
      // ①②③… の形式に一括で付け直す（キーボードから入力しにくいため）
      const leagues = await ensureLeagues(tournament.id, tournament.league_count);
      for (let i = 0; i < leagues.length; i++) {
        await db.from("leagues").update({ name: defaultLeagueName(i) }).eq("id", leagues[i].id);
      }
    } else {
      return fail("不明な操作です。");
    }

    const state = await getState(tournament.id);
    return ok({ teams: state.teams, leagues: state.leagues });
  } catch (e) {
    return fail(errorMessage(e), 500);
  }
}
