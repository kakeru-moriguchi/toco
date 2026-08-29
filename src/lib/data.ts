import { supabaseAdmin } from "./supabase";
import { assignSchedule, roundRobin } from "./schedule";
import { planBracketsFromLeagues, resolveBracketProgress } from "./bracket";
import { normalizeTiers } from "./tiers";
import type { League, Match, Team, Tournament, TournamentState } from "./types";

/**
 * サーバー側のデータ操作。
 * 参加者からの書き込みは必ずここを通るので、
 * 「勝者判定」「次のラウンドへの繰り上げ」「進行状況の更新」を一箇所で担保できる。
 */

/** DBの行を、画面がそのまま使える形に整える */
function toTournament(row: Record<string, unknown>): Tournament {
  return {
    ...(row as unknown as Tournament),
    bracket_tiers: normalizeTiers(row.bracket_tiers),
  };
}

export async function getTournament(): Promise<Tournament> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("tournaments")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    const { data: created, error: insertError } = await db
      .from("tournaments")
      .insert({ name: "ピックルボール大会" })
      .select("*")
      .single();
    if (insertError) throw new Error(insertError.message);
    return toTournament(created);
  }
  return toTournament(data[0]);
}

export async function getState(): Promise<TournamentState> {
  const db = supabaseAdmin();
  const tournament = await getTournament();
  const [leagues, teams, matches] = await Promise.all([
    db.from("leagues").select("*").eq("tournament_id", tournament.id).order("sort_order"),
    db.from("teams").select("*").eq("tournament_id", tournament.id).order("sort_order"),
    db.from("matches").select("*").eq("tournament_id", tournament.id).order("match_no"),
  ]);
  if (leagues.error) throw new Error(leagues.error.message);
  if (teams.error) throw new Error(teams.error.message);
  if (matches.error) throw new Error(matches.error.message);
  return {
    tournament,
    leagues: (leagues.data ?? []) as League[],
    teams: (teams.data ?? []) as Team[],
    matches: (matches.data ?? []) as Match[],
  };
}

export async function logMatchEvent(params: {
  tournamentId: string;
  matchId: string;
  action: string;
  scoreA?: number | null;
  scoreB?: number | null;
  actor?: string;
  payload?: Record<string, unknown>;
}) {
  const db = supabaseAdmin();
  await db.from("match_events").insert({
    tournament_id: params.tournamentId,
    match_id: params.matchId,
    action: params.action,
    score_a: params.scoreA ?? null,
    score_b: params.scoreB ?? null,
    actor: params.actor ?? "team",
    payload: params.payload ?? {},
  });
}

/**
 * リーグの既定の名前（①②③…）。
 * 20を超えたら普通の数字にする。管理画面から自由に変更もできる。
 */
export function defaultLeagueName(index: number): string {
  return index < 20 ? String.fromCharCode(0x2460 + index) : String(index + 1);
}

/** リーグを必要数だけ用意する（①, ②, ③ ...） */
export async function ensureLeagues(tournamentId: string, count: number): Promise<League[]> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("leagues")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("sort_order");
  const current = (data ?? []) as League[];

  if (current.length < count) {
    const rows = [];
    for (let i = current.length; i < count; i++) {
      rows.push({ tournament_id: tournamentId, name: defaultLeagueName(i), sort_order: i });
    }
    if (rows.length > 0) await db.from("leagues").insert(rows);
  } else if (current.length > count) {
    const remove = current.slice(count).map((l) => l.id);
    if (remove.length > 0) await db.from("leagues").delete().in("id", remove);
  }

  const { data: after } = await db
    .from("leagues")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("sort_order");
  return (after ?? []) as League[];
}

/**
 * リーグ戦の対戦カードを作り直す。
 * 既存のリーグ戦結果は消えるので、管理画面では確認ダイアログを出している。
 */
export async function regenerateLeagueMatches(tournamentId: string) {
  const db = supabaseAdmin();
  const tournament = await getTournament();
  const [{ data: leagueData }, { data: teamData }] = await Promise.all([
    db.from("leagues").select("*").eq("tournament_id", tournamentId).order("sort_order"),
    db.from("teams").select("*").eq("tournament_id", tournamentId).order("sort_order"),
  ]);
  const leagues = (leagueData ?? []) as League[];
  const teams = (teamData ?? []) as Team[];

  await db.from("matches").delete().eq("tournament_id", tournamentId).eq("stage", "league");

  // ラウンドごとに全リーグを横並びで進める（同じ時間帯に各コートで1試合ずつ）
  type Draft = { leagueId: string; round: number; aId: string; bId: string };
  const drafts: Draft[] = [];
  for (const league of leagues) {
    const members = teams
      .filter((t) => t.league_id === league.id)
      .sort((a, b) => a.sort_order - b.sort_order);
    for (const pair of roundRobin(members.length)) {
      drafts.push({
        leagueId: league.id,
        round: pair.round,
        aId: members[pair.a].id,
        bId: members[pair.b].id,
      });
    }
  }
  drafts.sort((x, y) => x.round - y.round);

  if (drafts.length === 0) return [];

  const rows = drafts.map((d, i) => ({
    tournament_id: tournamentId,
    stage: "league" as const,
    league_id: d.leagueId,
    match_no: i + 1,
    team_a_id: d.aId,
    team_b_id: d.bId,
    status: "pending" as const,
  }));

  const { data: inserted, error } = await db.from("matches").insert(rows).select("*");
  if (error) throw new Error(error.message);

  await autoAssignSchedule(tournamentId, "league", {
    startTime: tournament.start_time,
    minutesPerMatch: tournament.minutes_per_match,
    courts: tournament.courts,
  });

  return inserted as Match[];
}

/** 進行表（試合番号・時間・コート）を自動で割り当て直す */
export async function autoAssignSchedule(
  tournamentId: string,
  stage: "league" | "bracket",
  options: { startTime: string; minutesPerMatch: number; courts: string[] }
) {
  const db = supabaseAdmin();
  const { data } = await db
    .from("matches")
    .select("*")
    .eq("tournament_id", tournamentId)
    .eq("stage", stage)
    .order("round", { ascending: true, nullsFirst: true })
    .order("bracket_index", { ascending: true, nullsFirst: true })
    .order("match_no");
  const matches = (data ?? []) as Match[];
  if (matches.length === 0) return;

  // トーナメントは「各級の同じラウンドをまとめて」進める。
  // 例: A級の準々決勝とB級・C級の準決勝が同じ時間帯に並ぶ。
  // 3位決定戦は同じラウンドの中で決勝より前に置く。
  const tierOrder = new Map(
    normalizeTiers((await getTournament()).bracket_tiers).map((t, i) => [t.key, i])
  );
  const ordered = [...matches].sort((a, b) => {
    if (a.stage === "bracket" && b.stage === "bracket") {
      const ra = a.round ?? 0;
      const rb = b.round ?? 0;
      if (ra !== rb) return ra - rb;
      const ta = tierOrder.get(a.tier_key ?? "") ?? 99;
      const tb = tierOrder.get(b.tier_key ?? "") ?? 99;
      if (ta !== tb) return ta - tb;
      if (a.is_third_place !== b.is_third_place) return a.is_third_place ? -1 : 1;
      return (a.bracket_index ?? 0) - (b.bracket_index ?? 0);
    }
    return a.match_no - b.match_no;
  });

  const offset =
    stage === "bracket"
      ? ((await db
          .from("matches")
          .select("match_no")
          .eq("tournament_id", tournamentId)
          .eq("stage", "league")
          .order("match_no", { ascending: false })
          .limit(1)).data?.[0]?.match_no ?? 0)
      : 0;

  const assignments = assignSchedule(
    ordered.map((m) => ({ id: m.id, teamAId: m.team_a_id, teamBId: m.team_b_id })),
    options
  );

  for (const a of assignments) {
    await db
      .from("matches")
      .update({
        match_no: a.matchNo + offset,
        court: a.court,
        scheduled_at: a.scheduledAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", a.id);
  }
}

/**
 * 順位別トーナメント（A級 / B級 / C級 …）を予選順位からまとめて生成する。
 * 級ごとに独立したトーナメント表を作り、matches.tier_key で区別する。
 */
export async function generateBracket(tournamentId: string, options?: { startTime?: string }) {
  const db = supabaseAdmin();
  const state = await getState();
  const { tournament, leagues, teams, matches } = state;

  const tiers = normalizeTiers(tournament.bracket_tiers);
  const plans = planBracketsFromLeagues({
    leagues,
    teams,
    matches,
    tiers,
    tiebreakers: tournament.tiebreakers,
  });

  const buildable = plans.filter((p) => p.planned.length > 0);
  if (buildable.length === 0) {
    throw new Error(
      "どの級も出場チームが足りません。リーグ分けと、級の対象順位の設定を確認してください。"
    );
  }

  await db.from("matches").delete().eq("tournament_id", tournamentId).eq("stage", "bracket");

  let total = 0;
  for (const plan of buildable) {
    // 先に空の試合を作ってIDを得てから、次戦へのリンクを張る
    const rows = plan.planned.map((p) => ({
      tournament_id: tournamentId,
      stage: "bracket" as const,
      tier_key: plan.tier.key,
      round: p.round,
      bracket_index: p.bracketIndex,
      is_third_place: p.isThirdPlace,
      team_a_id: p.teamAId,
      team_b_id: p.teamBId,
      team_a_label: p.teamALabel,
      team_b_label: p.teamBLabel,
      status: "pending" as const,
      match_no: 0,
    }));
    const { data: inserted, error } = await db.from("matches").insert(rows).select("*");
    if (error) throw new Error(error.message);

    const created = (inserted ?? []) as Match[];
    total += created.length;

    const idByKey = new Map<string, string>();
    plan.planned.forEach((p) => {
      const found = created.find(
        (m) =>
          m.round === p.round &&
          m.bracket_index === p.bracketIndex &&
          m.is_third_place === p.isThirdPlace
      );
      if (found) idByKey.set(p.key, found.id);
    });

    for (const p of plan.planned) {
      const id = idByKey.get(p.key);
      if (!id) continue;
      const patch: Record<string, unknown> = {};
      if (p.nextKey) {
        patch.next_match_id = idByKey.get(p.nextKey) ?? null;
        patch.next_slot = p.nextSlot;
      }
      if (p.loserNextKey) {
        patch.loser_next_match_id = idByKey.get(p.loserNextKey) ?? null;
        patch.loser_next_slot = p.loserNextSlot;
      }
      if (Object.keys(patch).length > 0) await db.from("matches").update(patch).eq("id", id);
    }
  }

  await autoAssignSchedule(tournamentId, "bracket", {
    startTime: options?.startTime || tournament.start_time,
    minutesPerMatch: tournament.minutes_per_match,
    courts: tournament.courts,
  });

  await db
    .from("tournaments")
    .update({ phase: "bracket", updated_at: new Date().toISOString() })
    .eq("id", tournamentId);

  return {
    tiers: plans.map((p) => ({
      name: p.tier.name,
      teams: p.qualifiers.length,
      matches: p.planned.length,
      skippedReason: p.skippedReason,
    })),
    count: total,
  };
}

/**
 * トーナメント表の進出状況を最初から計算し直してDBへ反映する。
 * 計算そのものは lib/bracket.ts の純粋関数が担当。
 */
export async function recomputeBracket(tournamentId: string) {
  const db = supabaseAdmin();
  const { data } = await db
    .from("matches")
    .select("*")
    .eq("tournament_id", tournamentId)
    .eq("stage", "bracket")
    .order("round");
  const matches = (data ?? []) as Match[];
  if (matches.length === 0) return;

  for (const { id, patch } of resolveBracketProgress(matches)) {
    await db
      .from("matches")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
  }
}

export type ResultInput = {
  matchId: string;
  scoreA: number;
  scoreB: number;
  actor: "team" | "admin";
};

/** 試合結果を登録・修正する（参加者・主催者共通の入口） */
export async function saveResult(input: ResultInput): Promise<Match> {
  const db = supabaseAdmin();
  const { data: found, error: findError } = await db
    .from("matches")
    .select("*")
    .eq("id", input.matchId)
    .single();
  if (findError || !found) throw new Error("試合が見つかりませんでした。");
  const match = found as Match;

  if (!match.team_a_id || !match.team_b_id) {
    throw new Error("対戦チームがまだ決まっていません。");
  }
  const a = Math.trunc(input.scoreA);
  const b = Math.trunc(input.scoreB);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) {
    throw new Error("スコアは0以上の数字で入力してください。");
  }
  if (a > 99 || b > 99) throw new Error("スコアが大きすぎます。");
  if (a === b) throw new Error("同点では登録できません。どちらかが勝った状態で入力してください。");

  const winner = a > b ? match.team_a_id : match.team_b_id;

  const { data: updated, error } = await db
    .from("matches")
    .update({
      score_a: a,
      score_b: b,
      winner_team_id: winner,
      status: "done",
      reported_at: new Date().toISOString(),
      reported_by: input.actor,
      updated_at: new Date().toISOString(),
    })
    .eq("id", match.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await logMatchEvent({
    tournamentId: match.tournament_id,
    matchId: match.id,
    action: input.actor === "admin" ? "admin_edit" : "report",
    scoreA: a,
    scoreB: b,
    actor: input.actor,
    payload: { previous: { score_a: match.score_a, score_b: match.score_b } },
  });

  if (match.stage === "bracket") {
    await recomputeBracket(match.tournament_id);
  }

  return updated as Match;
}

/** 結果を取り消して「待機中」に戻す（主催者のみ） */
export async function clearResult(matchId: string) {
  const db = supabaseAdmin();
  const { data: found } = await db.from("matches").select("*").eq("id", matchId).single();
  if (!found) throw new Error("試合が見つかりませんでした。");
  const match = found as Match;

  await db
    .from("matches")
    .update({
      score_a: null,
      score_b: null,
      winner_team_id: null,
      status: "pending",
      reported_at: null,
      reported_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", matchId);

  await logMatchEvent({
    tournamentId: match.tournament_id,
    matchId,
    action: "reset",
    actor: "admin",
  });

  if (match.stage === "bracket") await recomputeBracket(match.tournament_id);
}
