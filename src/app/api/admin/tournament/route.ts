import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { ensureLeagues, getTournament } from "@/lib/data";
import { errorMessage, fail, ok, requireAdmin } from "@/lib/api";
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
    const tournament = await getTournament();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (typeof body.name === "string") patch.name = body.name.slice(0, 120);
    if (typeof body.venue === "string") patch.venue = body.venue.slice(0, 120);
    if (typeof body.note === "string") patch.note = body.note.slice(0, 1000);
    if (typeof body.event_date === "string") patch.event_date = body.event_date || null;
    if (body.event_date === null) patch.event_date = null;

    const intFields: [string, number, number][] = [
      ["league_count", 1, 26],
      ["teams_per_league", 2, 20],
      ["point_target", 1, 99],
      ["minutes_per_match", 5, 180],
    ];
    for (const [field, min, max] of intFields) {
      if (body[field] !== undefined) {
        const n = Math.trunc(Number(body[field]));
        if (!Number.isFinite(n) || n < min || n > max) {
          return fail(`${field} の値が範囲外です（${min}〜${max}）。`);
        }
        patch[field] = n;
      }
    }

    if (typeof body.start_time === "string" && /^\d{1,2}:\d{2}$/.test(body.start_time)) {
      patch.start_time = body.start_time;
    }
    if (Array.isArray(body.courts)) {
      const courts = body.courts.map((c: unknown) => String(c).trim()).filter(Boolean).slice(0, 20);
      if (courts.length === 0) return fail("コートは1つ以上必要です。");
      patch.courts = courts;
    }
    if (Array.isArray(body.tiebreakers)) {
      const list = body.tiebreakers.filter((t: unknown): t is Tiebreaker =>
        ALLOWED_TIEBREAKERS.includes(t as Tiebreaker)
      );
      if (list.length === 0) return fail("順位の決定条件を1つ以上選んでください。");
      patch.tiebreakers = list;
    }
    if (body.bracket_tiers !== undefined) {
      const tiers = normalizeTiers(body.bracket_tiers);
      const problem = validateTiers(tiers);
      if (problem) return fail(problem);
      patch.bracket_tiers = tiers;
    }
    if (typeof body.phase === "string" && ["setup", "league", "bracket", "finished"].includes(body.phase)) {
      patch.phase = body.phase;
    }

    const db = supabaseAdmin();
    const { error } = await db.from("tournaments").update(patch).eq("id", tournament.id);
    if (error) throw new Error(error.message);

    if (patch.league_count !== undefined) {
      await ensureLeagues(tournament.id, patch.league_count as number);
    }

    return ok({ tournament: await getTournament() });
  } catch (e) {
    return fail(errorMessage(e), 500);
  }
}
