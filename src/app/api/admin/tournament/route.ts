import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { ensureLeagues, getDivision, getTournament } from "@/lib/data";
import { divisionIdFromRequest, errorMessage, fail, ok, requireAdmin, tournamentIdFromRequest } from "@/lib/api";
import { normalizeTiers, validateTiers } from "@/lib/tiers";
import type { Tiebreaker } from "@/lib/types";

export const dynamic = "force-dynamic";

const ALLOWED_TIEBREAKERS: Tiebreaker[] = [
  "wins",
  "win_rate",
  "diff",
  "points_for",
  "points_against",
  "head_to_head",
];

/** 大会情報・大会設定の更新 */
export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin(req))) return fail("認証が必要です。", 401);
  try {
    const body = await req.json();
    const tournament = await getTournament(tournamentIdFromRequest(req));
    const division = await getDivision(tournament.id, divisionIdFromRequest(req));
    const now = new Date().toISOString();
    const tournamentPatch: Record<string, unknown> = { updated_at: now };
    const divisionPatch: Record<string, unknown> = { updated_at: now };

    if (typeof body.name === "string") tournamentPatch.name = body.name.slice(0, 120);
    if (typeof body.venue === "string") tournamentPatch.venue = body.venue.slice(0, 120);
    if (typeof body.note === "string") tournamentPatch.note = body.note.slice(0, 1000);
    if (typeof body.event_date === "string") tournamentPatch.event_date = body.event_date || null;
    if (body.event_date === null) tournamentPatch.event_date = null;

    const intFields: [string, number, number][] = [
      ["league_count", 1, 26],
      ["teams_per_league", 2, 20],
      ["point_target", 1, 99],
      ["sets_to_win", 1, 5],
      ["qualifying_minutes_per_match", 5, 180],
      ["finals_minutes_per_match", 5, 180],
    ];
    for (const [field, min, max] of intFields) {
      if (body[field] !== undefined) {
        const n = Math.trunc(Number(body[field]));
        if (!Number.isFinite(n) || n < min || n > max) {
          return fail(`${field} の値が範囲外です（${min}〜${max}）。`);
        }
        divisionPatch[field] = n;
      }
    }

    if (typeof body.start_time === "string" && /^\d{1,2}:\d{2}$/.test(body.start_time)) {
      divisionPatch.start_time = body.start_time;
    }
    if (typeof body.finals_start_time === "string" && /^\d{1,2}:\d{2}$/.test(body.finals_start_time)) {
      divisionPatch.finals_start_time = body.finals_start_time;
    }
    if (Array.isArray(body.schedule_blocks)) {
      const blocks = body.schedule_blocks.slice(0, 20).map((block: unknown) => {
        const item = (block ?? {}) as Record<string, unknown>;
        return { label: String(item.label ?? "休止枠").slice(0, 60), start_time: String(item.start_time ?? ""), end_time: String(item.end_time ?? "") };
      });
      if (blocks.some((block: { start_time: string; end_time: string }) => !/^\d{1,2}:\d{2}$/.test(block.start_time) || !/^\d{1,2}:\d{2}$/.test(block.end_time) || block.start_time >= block.end_time)) {
        return fail("休憩・予約枠は「開始-終了 ラベル」の形式で、終了を開始より後にしてください。");
      }
      tournamentPatch.schedule_blocks = blocks;
    }
    if (Array.isArray(body.courts)) {
      const courts = body.courts.map((c: unknown) => String(c).trim()).filter(Boolean).slice(0, 20);
      if (courts.length === 0) return fail("コートは1つ以上必要です。");
      divisionPatch.courts = courts;
    }
    if (Array.isArray(body.tiebreakers)) {
      const list = body.tiebreakers.filter((t: unknown): t is Tiebreaker =>
        ALLOWED_TIEBREAKERS.includes(t as Tiebreaker)
      );
      if (list.length === 0) return fail("順位の決定条件を1つ以上選んでください。");
      divisionPatch.tiebreakers = list;
    }
    if (body.bracket_tiers !== undefined) {
      const tiers = normalizeTiers(body.bracket_tiers);
      const problem = validateTiers(tiers);
      if (problem) return fail(problem);
      divisionPatch.bracket_tiers = tiers;
    }
    if (typeof body.phase === "string" && ["setup", "league", "bracket", "finished"].includes(body.phase)) {
      tournamentPatch.phase = body.phase;
    }

    const db = supabaseAdmin();
    const { error: tournamentError } = await db.from("tournaments").update(tournamentPatch).eq("id", tournament.id);
    if (tournamentError) throw new Error(tournamentError.message);
    const { error: divisionError } = await db
      .from("divisions")
      .update(divisionPatch)
      .eq("id", division.id)
      .eq("tournament_id", tournament.id);
    if (divisionError) throw new Error(divisionError.message);

    if (divisionPatch.league_count !== undefined) {
      await ensureLeagues(tournament.id, division.id, divisionPatch.league_count as number);
    }

    return ok({ tournament: await getTournament(tournament.id), division_id: division.id });
  } catch (e) {
    return fail(errorMessage(e), 500);
  }
}
