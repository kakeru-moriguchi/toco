import { supabaseAdmin } from "./supabase";
import { assignSchedule, roundRobin } from "./schedule";
import { planBracketsFromLeagues, resolveBracketProgress, type PlannedTier } from "./bracket";
import { normalizeTiers } from "./tiers";
import { normalizeSets, validateSets } from "./score";
import type { Division, League, Match, SetScore, Team, Tournament, TournamentState } from "./types";

/**
 * サーバー側のデータ操作。
 * 参加者からの書き込みは必ずここを通るので、
 * 「勝者判定」「次のラウンドへの繰り上げ」「進行状況の更新」を一箇所で担保できる。
 */

/** DBの行を、画面がそのまま使える形に整える */
function toTournament(row: Record<string, unknown>): Tournament {
  return {
    ...(row as unknown as Tournament),
    sets_to_win: Math.max(1, Math.trunc(Number(row.sets_to_win)) || 1),
    bracket_tiers: normalizeTiers(row.bracket_tiers),
  };
}

/** DBの試合行を、画面がそのまま使える形に整える */
function toMatch(row: Record<string, unknown>): Match {
  return { ...(row as unknown as Match), sets: normalizeSets(row.sets) };
}

export async function getTournament(tournamentId?: string | null): Promise<Tournament> {
  const db = supabaseAdmin();
  let query = db.from("tournaments").select("*");
  query = tournamentId
    ? query.eq("id", tournamentId)
    : query.is("archived_at", null).order("created_at", { ascending: false }).limit(1);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    if (tournamentId) throw new Error("指定された大会が見つかりませんでした。");
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

export async function getDivisions(tournamentId: string, includeInactive = true): Promise<Division[]> {
  const db = supabaseAdmin();
  let query = db.from("divisions").select("*").eq("tournament_id", tournamentId);
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query.order("sort_order").order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as Division[];
}

export async function createDefaultDivision(tournamentId: string): Promise<Division> {
  const db = supabaseAdmin();
  const current = await getDivisions(tournamentId);
  if (current[0]) return current[0];
  const { data, error } = await db
    .from("divisions")
    .insert({ tournament_id: tournamentId, name: "メイン部門", sort_order: 0 })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Division;
}

export async function getDivision(tournamentId: string, divisionId?: string | null): Promise<Division> {
  const divisions = await getDivisions(tournamentId);
  const division = divisionId
    ? divisions.find((item) => item.id === divisionId)
    : divisions.find((item) => item.is_active);
  if (!division) throw new Error("対象の部門が見つかりませんでした。");
  return division;
}

export async function getState(
  tournamentId?: string | null,
  divisionId?: string | null
): Promise<TournamentState> {
  const db = supabaseAdmin();
  const tournament = await getTournament(tournamentId);
  const divisions = await getDivisions(tournament.id);
  const division = await getDivision(tournament.id, divisionId);
  const [leagues, teams, matches] = await Promise.all([
    db.from("leagues").select("*").eq("tournament_id", tournament.id).eq("division_id", division.id).order("sort_order"),
    db.from("teams").select("*").eq("tournament_id", tournament.id).eq("division_id", division.id).order("sort_order"),
    db.from("matches").select("*").eq("tournament_id", tournament.id).eq("division_id", division.id).order("match_no"),
  ]);
  if (leagues.error) throw new Error(leagues.error.message);
  if (teams.error) throw new Error(teams.error.message);
  if (matches.error) throw new Error(matches.error.message);
  return {
    tournament,
    division,
    divisions,
    leagues: (leagues.data ?? []) as League[],
    teams: (teams.data ?? []) as Team[],
    matches: (matches.data ?? []).map((m) => toMatch(m as Record<string, unknown>)),
  };
}

export async function logMatchEvent(params: {
  tournamentId: string;
  divisionId: string;
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
    division_id: params.divisionId,
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

/** 予選のリーグだけを返す（総当たり形式の級のリーグは除く） */
export async function getQualifyingLeagues(tournamentId: string, divisionId: string): Promise<League[]> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("leagues")
    .select("*")
    .eq("tournament_id", tournamentId)
    .eq("division_id", divisionId)
    .is("tier_key", null)
    .order("sort_order");
  return (data ?? []) as League[];
}

/**
 * 予選のリーグを必要数だけ用意する（①, ②, ③ ...）。
 * 総当たり形式の級のリーグ（tier_key あり）はここでは触らない。
 */
export async function ensureLeagues(tournamentId: string, divisionId: string, count: number): Promise<League[]> {
  const db = supabaseAdmin();
  const current = await getQualifyingLeagues(tournamentId, divisionId);

  if (current.length < count) {
    const rows = [];
    for (let i = current.length; i < count; i++) {
      rows.push({ tournament_id: tournamentId, division_id: divisionId, name: defaultLeagueName(i), sort_order: i });
    }
    if (rows.length > 0) await db.from("leagues").insert(rows);
  } else if (current.length > count) {
    const remove = current.slice(count).map((l) => l.id);
    if (remove.length > 0) await db.from("leagues").delete().in("id", remove);
  }

  return getQualifyingLeagues(tournamentId, divisionId);
}

/**
 * リーグ戦の対戦カードを作り直す。
 * 既存のリーグ戦結果は消えるので、管理画面では確認ダイアログを出している。
 */
export async function regenerateLeagueMatches(tournamentId: string, divisionId: string) {
  const db = supabaseAdmin();
  const tournament = await getTournament(tournamentId);
  const [leagues, { data: teamData }] = await Promise.all([
    getQualifyingLeagues(tournamentId, divisionId),
    db.from("teams").select("*").eq("tournament_id", tournamentId).eq("division_id", divisionId).order("sort_order"),
  ]);
  const teams = (teamData ?? []) as Team[];

  // 予選リーグの試合だけを消す（総当たり形式の級の試合は残す）
  if (leagues.length > 0) {
    await db
      .from("matches")
      .delete()
      .eq("tournament_id", tournamentId)
      .eq("stage", "league")
      .in("league_id", leagues.map((l) => l.id));
  }

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
    division_id: divisionId,
    stage: "league" as const,
    league_id: d.leagueId,
    round: d.round, // 進行順の並べ替えに使う
    match_no: i + 1,
    team_a_id: d.aId,
    team_b_id: d.bId,
    status: "pending" as const,
  }));

  const { data: inserted, error } = await db.from("matches").insert(rows).select("*");
  if (error) throw new Error(error.message);

  await autoAssignSchedule(tournamentId, divisionId, "qualifying", {
    startTime: tournament.start_time,
    minutesPerMatch: tournament.minutes_per_match,
    courts: tournament.courts,
  });

  return inserted as Match[];
}

/**
 * 進行表（試合番号・コート）を自動で割り当て直す。
 * phase:
 *   qualifying … 予選リーグの試合
 *   finals     … 決勝ラウンド（トーナメント形式・総当たり形式の両方）
 */
export async function autoAssignSchedule(
  tournamentId: string,
  divisionId: string,
  phase: "qualifying" | "finals",
  options: { startTime: string; minutesPerMatch: number; courts: string[] }
) {
  const db = supabaseAdmin();
  const qualifyingLeagueIds = new Set((await getQualifyingLeagues(tournamentId, divisionId)).map((l) => l.id));

  const { data: tournamentMatchData } = await db
    .from("matches")
    .select("*")
    .eq("tournament_id", tournamentId);
  const tournamentMatches = (tournamentMatchData ?? []) as Match[];
  const all = tournamentMatches.filter((match) => match.division_id === divisionId);

  const isQualifying = (m: Match) =>
    m.stage === "league" && m.league_id !== null && qualifyingLeagueIds.has(m.league_id);

  const matches = all.filter((m) => (phase === "qualifying" ? isQualifying(m) : !isQualifying(m)));
  if (matches.length === 0) return;

  // 各級の同じラウンドがまとまるように並べる。
  // 例: Aトーナメントの準々決勝と、Cリーグの1巡目が同じ時間帯に並ぶ。
  // 3位決定戦は同じラウンドの中で決勝より前に置く。
  const tierOrder = new Map(
    normalizeTiers((await getTournament(tournamentId)).bracket_tiers).map((t, i) => [t.key, i])
  );
  const ordered = [...matches].sort((a, b) => {
    const ra = a.round ?? 0;
    const rb = b.round ?? 0;
    if (ra !== rb) return ra - rb;
    const ta = tierOrder.get(a.tier_key ?? "") ?? 99;
    const tb = tierOrder.get(b.tier_key ?? "") ?? 99;
    if (ta !== tb) return ta - tb;
    if (a.is_third_place !== b.is_third_place) return a.is_third_place ? -1 : 1;
    return (a.bracket_index ?? 0) - (b.bracket_index ?? 0) || a.match_no - b.match_no;
  });

  // 決勝ラウンドの試合番号は、予選の続きから振る
  const offset =
    phase === "finals"
      ? all.filter(isQualifying).reduce((n, m) => Math.max(n, m.match_no), 0)
      : 0;

  const assignments = assignSchedule(
    ordered.map((m) => ({ id: m.id, teamAId: m.team_a_id, teamBId: m.team_b_id })),
    {
      ...options,
      reserved: tournamentMatches
        .filter((match) => !matches.some((target) => target.id === match.id))
        .filter((match) => match.court && match.scheduled_at)
        .map((match) => ({ court: match.court, scheduledAt: match.scheduled_at })),
    }
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
 * 決勝ラウンドを予選順位からまとめて生成する。
 *
 * 級ごとに形式を選べる:
 *   トーナメント形式 … stage='bracket' の試合を作り、tier_key で級を区別
 *   総当たり形式     … その級専用のリーグを1つ作り、予選と同じ仕組みで総当たり表を作る
 *
 * 何度実行しても同じ結果になるよう、先に前回ぶんを全部消してから作り直す。
 */
export async function generateBracket(
  tournamentId: string,
  divisionId: string,
  options?: { startTime?: string }
) {
  const db = supabaseAdmin();
  const state = await getState(tournamentId, divisionId);
  const { tournament, teams, matches } = state;
  const qualifyingLeagues = state.leagues.filter((l) => l.tier_key === null);

  const tiers = normalizeTiers(tournament.bracket_tiers);
  const plans = planBracketsFromLeagues({
    leagues: qualifyingLeagues,
    teams,
    matches,
    tiers,
    tiebreakers: tournament.tiebreakers,
  });

  const buildable = plans.filter((p) => p.qualifiers.length >= 2);
  if (buildable.length === 0) {
    throw new Error(
      "どの級も出場チームが足りません。リーグ分けと、級の対象順位の設定を確認してください。"
    );
  }

  // 前回作った決勝ラウンドを消す（トーナメントの試合と、総当たり級のリーグごと）
  await db
    .from("matches")
    .delete()
    .eq("tournament_id", tournamentId)
    .eq("division_id", divisionId)
    .eq("stage", "bracket");
  const oldTierLeagues = state.leagues.filter((l) => l.tier_key !== null);
  if (oldTierLeagues.length > 0) {
    await db.from("leagues").delete().in("id", oldTierLeagues.map((l) => l.id));
  }

  let total = 0;
  for (const plan of buildable) {
    total +=
      plan.tier.format === "league"
        ? await createTierLeague(tournamentId, divisionId, plan)
        : await createTierBracket(tournamentId, divisionId, plan);
  }

  await autoAssignSchedule(tournamentId, divisionId, "finals", {
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
      format: p.tier.format,
      teams: p.qualifiers.length,
      matches: p.tier.format === "league"
        ? (p.qualifiers.length * (p.qualifiers.length - 1)) / 2
        : p.planned.length,
      skippedReason: p.skippedReason,
    })),
    count: total,
  };
}

/** トーナメント形式の級を作る。作った試合数を返す。 */
async function createTierBracket(
  tournamentId: string,
  divisionId: string,
  plan: PlannedTier
): Promise<number> {
  const db = supabaseAdmin();

  // 先に空の試合を作ってIDを得てから、次戦へのリンクを張る
  const rows = plan.planned.map((p) => ({
    tournament_id: tournamentId,
    division_id: divisionId,
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

  return created.length;
}

/**
 * 総当たり形式の級を作る。
 * その級専用のリーグを1つ作り、予選リーグとまったく同じ仕組みで総当たり表を作るので、
 * 順位計算・順位表・結果入力はすべて既存のものがそのまま使える。
 */
async function createTierLeague(
  tournamentId: string,
  divisionId: string,
  plan: PlannedTier
): Promise<number> {
  const db = supabaseAdmin();

  const { data: leagueRow, error: leagueError } = await db
    .from("leagues")
    .insert({
      tournament_id: tournamentId,
      division_id: divisionId,
      name: plan.tier.name,
      tier_key: plan.tier.key,
      sort_order: 1000, // 予選リーグより後ろに置く
    })
    .select("*")
    .single();
  if (leagueError) throw new Error(leagueError.message);

  const members = plan.qualifiers;
  const pairs = roundRobin(members.length);
  if (pairs.length === 0) return 0;

  const rows = pairs
    .sort((a, b) => a.round - b.round)
    .map((pair) => ({
      tournament_id: tournamentId,
      division_id: divisionId,
      stage: "league" as const,
      league_id: (leagueRow as League).id,
      tier_key: plan.tier.key,
      round: pair.round,
      match_no: 0,
      team_a_id: members[pair.a].teamId,
      team_b_id: members[pair.b].teamId,
      status: "pending" as const,
    }));

  const { data: inserted, error } = await db.from("matches").insert(rows).select("id");
  if (error) throw new Error(error.message);
  return (inserted ?? []).length;
}

/**
 * トーナメント表の進出状況を最初から計算し直してDBへ反映する。
 * 計算そのものは lib/bracket.ts の純粋関数が担当。
 */
export async function recomputeBracket(tournamentId: string, divisionId: string) {
  const db = supabaseAdmin();
  const { data } = await db
    .from("matches")
    .select("*")
    .eq("tournament_id", tournamentId)
    .eq("division_id", divisionId)
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
  /** 各セットのスコア。1セットのみの大会なら要素1つ */
  sets: SetScore[];
  actor: "team" | "admin";
  /** 管理画面からの操作時に、選択大会以外の試合更新を防ぐ。 */
  tournamentId?: string;
  divisionId?: string;
};

/**
 * 試合結果を登録・修正する（参加者・主催者共通の入口）。
 * 勝敗は取ったセット数で決まり、順位表用の得点・失点には全セットの合計点を入れる。
 */
export async function saveResult(input: ResultInput): Promise<Match> {
  const db = supabaseAdmin();
  const { data: found, error: findError } = await db
    .from("matches")
    .select("*")
    .eq("id", input.matchId)
    .single();
  if (findError || !found) throw new Error("試合が見つかりませんでした。");
  const match = found as Match;
  if (input.tournamentId && match.tournament_id !== input.tournamentId) {
    throw new Error("選択中の大会に属さない試合です。");
  }
  if (input.divisionId && match.division_id !== input.divisionId) {
    throw new Error("選択中の部門に属さない試合です。");
  }
  const tournament = await getTournament(match.tournament_id);

  if (!match.team_a_id || !match.team_b_id) {
    throw new Error("対戦チームがまだ決まっていません。");
  }

  const sets = normalizeSets(input.sets);
  const check = validateSets(sets, tournament.sets_to_win);
  if (!check.ok || !check.winner) throw new Error(check.error ?? "スコアを確認してください。");

  const winner = check.winner === "a" ? match.team_a_id : match.team_b_id;

  const { data: updated, error } = await db
    .from("matches")
    .update({
      sets,
      score_a: check.totalPoints.a,
      score_b: check.totalPoints.b,
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
    divisionId: match.division_id,
    matchId: match.id,
    action: input.actor === "admin" ? "admin_edit" : "report",
    scoreA: check.totalPoints.a,
    scoreB: check.totalPoints.b,
    actor: input.actor,
    payload: {
      sets,
      sets_won: check.setsWon,
      previous: { sets: match.sets, score_a: match.score_a, score_b: match.score_b },
    },
  });

  if (match.stage === "bracket") {
    await recomputeBracket(match.tournament_id, match.division_id);
  }

  return updated as Match;
}

/** 結果を取り消して「待機中」に戻す（主催者のみ） */
export async function clearResult(matchId: string, tournamentId?: string, divisionId?: string) {
  const db = supabaseAdmin();
  const { data: found } = await db.from("matches").select("*").eq("id", matchId).single();
  if (!found) throw new Error("試合が見つかりませんでした。");
  const match = found as Match;
  if (tournamentId && match.tournament_id !== tournamentId) {
    throw new Error("選択中の大会に属さない試合です。");
  }
  if (divisionId && match.division_id !== divisionId) {
    throw new Error("選択中の部門に属さない試合です。");
  }

  await db
    .from("matches")
    .update({
      sets: [],
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
    divisionId: match.division_id,
    matchId,
    action: "reset",
    actor: "admin",
  });

  if (match.stage === "bracket") await recomputeBracket(match.tournament_id, match.division_id);
}
