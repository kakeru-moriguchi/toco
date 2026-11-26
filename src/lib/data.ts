import { supabaseAdmin } from "./supabase";
import { assignSchedule, formatTime, parseTime, qualifyingPairs, roundRobin, schedulePredecessors } from "./schedule";
import { consolationCandidates, planConsolationPairs } from './consolation';
import { planBracketsFromLeagues, resolveBracketProgress, type PlannedTier } from "./bracket";
import { normalizeTiers } from "./tiers";
import { normalizeSets, validateSets } from "./score";
import type { Division, League, Match, SetScore, Team, Tournament, TournamentState } from "./types";
import { divisionCourts, divisionFinalsMinutes, divisionFinalsStartTime, divisionQualifyingMinutes, divisionSetsToWin, divisionStartTime, divisionTiers, tournamentForDivision } from "./divisionFormat";
import { verifyTeamPin } from "./teamResultAuth";

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
    schedule_blocks: Array.isArray(row.schedule_blocks) ? row.schedule_blocks.filter((block): block is Tournament["schedule_blocks"][number] => {
      if (!block || typeof block !== "object") return false;
      const item = block as Record<string, unknown>;
      return typeof item.start_time === "string" && typeof item.end_time === "string";
    }).map((block) => ({ label: String(block.label ?? "休止枠"), start_time: String(block.start_time), end_time: String(block.end_time) })) : [],
  };
}

/** DBの試合行を、画面がそのまま使える形に整える */
function toMatch(row: Record<string, unknown>): Match {
  return {
    ...(row as unknown as Match),
    sets: normalizeSets(row.sets),
    approval_status:
      row.approval_status === "pending" || row.approval_status === "approved" || row.approval_status === "rejected"
        ? row.approval_status
        : "none",
    pending_sets: normalizeSets(row.pending_sets),
  };
}

function toDivision(row: Record<string, unknown>): Division {
  const rawOrder = String(row.qualifying_match_order ?? "balanced");
  return {
    ...(row as unknown as Division),
    is_public: row.is_public !== false,
    league_count: row.league_count == null ? null : Math.max(1, Math.trunc(Number(row.league_count))),
    teams_per_league: row.teams_per_league == null ? null : Math.max(2, Math.trunc(Number(row.teams_per_league))),
    point_target: row.point_target == null ? null : Math.max(1, Math.trunc(Number(row.point_target))),
    sets_to_win: row.sets_to_win == null ? null : Math.max(1, Math.trunc(Number(row.sets_to_win))),
    start_time: typeof row.start_time === "string" && row.start_time ? row.start_time : null,
    finals_start_time: typeof row.finals_start_time === "string" && row.finals_start_time ? row.finals_start_time : null,
    qualifying_minutes_per_match: row.qualifying_minutes_per_match == null ? null : Math.max(5, Math.trunc(Number(row.qualifying_minutes_per_match))),
    finals_minutes_per_match: row.finals_minutes_per_match == null ? null : Math.max(5, Math.trunc(Number(row.finals_minutes_per_match))),
    tiebreakers: Array.isArray(row.tiebreakers) ? row.tiebreakers as Division["tiebreakers"] : null,
    courts: Array.isArray(row.courts) ? row.courts.map(String).filter(Boolean) : null,
    bracket_tiers: row.bracket_tiers == null ? null : normalizeTiers(row.bracket_tiers),
    finals_enabled: row.finals_enabled !== false,
    consolation_enabled: row.consolation_enabled === true,
    qualifying_match_order: rawOrder === "toco_5_team" ? "toco_5_team" : "balanced",
    game_labels: Array.isArray(row.game_labels) ? row.game_labels.map(String).filter(Boolean) : null,
  };
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
  return (data ?? []).map((row) => toDivision(row as Record<string, unknown>));
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
  return toDivision(data as Record<string, unknown>);
}

export async function getDivision(tournamentId: string, divisionId?: string | null): Promise<Division> {
  const divisions = await getDivisions(tournamentId);
  const division = divisionId
    ? divisions.find((item) => item.id === divisionId && item.is_active) ?? divisions.find((item) => item.is_active)
    : divisions.find((item) => item.is_active);
  if (!division) throw new Error("対象の部門が見つかりませんでした。");
  return division;
}

/**
 * 参加者画面の初期表示用に、大会と部門を1回のPostgRESTリクエストで取得する。
 * 従来は getTournament → getDivisions → getDivision（内部で再度 getDivisions）の順に
 * 同じ部門一覧を2回取得していたため、モバイル回線ではここだけで数秒かかっていた。
 */
async function getTournamentWithDivisions(
  tournamentId?: string | null
): Promise<{ tournament: Tournament; divisions: Division[] }> {
  const db = supabaseAdmin();
  let query = db.from("tournaments").select("*, divisions(*)");
  query = tournamentId
    ? query.eq("id", tournamentId)
    : query.is("archived_at", null).order("created_at", { ascending: false }).limit(1);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  if (!data || data.length === 0) {
    const tournament = await getTournament(tournamentId);
    const division = await createDefaultDivision(tournament.id);
    return { tournament, divisions: [division] };
  }

  const row = data[0] as Record<string, unknown>;
  const rawDivisions = Array.isArray(row.divisions) ? row.divisions : [];
  const { divisions: _relatedDivisions, ...tournamentRow } = row;
  void _relatedDivisions;
  const tournament = toTournament(tournamentRow);
  let divisions = rawDivisions
    .map((item) => toDivision(item as Record<string, unknown>))
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
  if (divisions.length === 0) divisions = [await createDefaultDivision(tournament.id)];
  return { tournament, divisions };
}

export async function getState(
  tournamentId?: string | null,
  divisionId?: string | null,
  includeNonPublic = true
): Promise<TournamentState> {
  const db = supabaseAdmin();
  const { tournament, divisions: allDivisions } = await getTournamentWithDivisions(tournamentId);
  const divisions = includeNonPublic ? allDivisions : allDivisions.filter((item) => item.is_active && item.is_public);
  const division = divisionId
    ? divisions.find((item) => item.id === divisionId && item.is_active) ?? divisions.find((item) => item.is_active)
    : divisions.find((item) => item.is_active);
  if (!division) throw new Error("対象の部門が見つかりませんでした。");
  const [leagues, teams, matches] = await Promise.all([
    db.from("leagues").select("*").eq("tournament_id", tournament.id).eq("division_id", division.id).order("sort_order"),
    db.from("teams").select("*").eq("tournament_id", tournament.id).eq("division_id", division.id).order("sort_order"),
    db.from("matches").select("*").eq("tournament_id", tournament.id).eq("division_id", division.id).order("match_no"),
  ]);
  if (leagues.error) throw new Error(leagues.error.message);
  if (teams.error) throw new Error(teams.error.message);
  if (matches.error) throw new Error(matches.error.message);
  return {
    tournament: tournamentForDivision(tournament, division),
    division,
    divisions,
    leagues: (leagues.data ?? []) as League[],
    teams: (teams.data ?? []) as Team[],
    matches: (matches.data ?? []).filter((m) => !m.consolation_void).map((m) => toMatch(m as Record<string, unknown>)),
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
  const { error } = await db.from("match_events").insert({
    tournament_id: params.tournamentId,
    division_id: params.divisionId,
    match_id: params.matchId,
    action: params.action,
    score_a: params.scoreA ?? null,
    score_b: params.scoreB ?? null,
    actor: params.actor ?? "team",
    payload: params.payload ?? {},
  });
  if (error) throw new Error(error.message);
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
  const { data, error } = await db
    .from("leagues")
    .select("*")
    .eq("tournament_id", tournamentId)
    .eq("division_id", divisionId)
    .is("tier_key", null)
    .order("sort_order");
  if (error) throw new Error(error.message);
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
    if (rows.length > 0) {
      const { error } = await db.from("leagues").insert(rows);
      if (error) throw new Error(error.message);
    }
  } else if (current.length > count) {
    const remove = current.slice(count).map((l) => l.id);
    if (remove.length > 0) {
      const { error } = await db.from("leagues").delete().in("id", remove);
      if (error) throw new Error(error.message);
    }
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
  const division = await getDivision(tournamentId, divisionId);
  const [leagues, teamResult] = await Promise.all([
    getQualifyingLeagues(tournamentId, divisionId),
    db.from("teams").select("*").eq("tournament_id", tournamentId).eq("division_id", divisionId).order("sort_order"),
  ]);
  if (teamResult.error) throw new Error(teamResult.error.message);
  const teamData = teamResult.data;
  const teams = (teamData ?? []) as Team[];

  // 予選リーグの試合だけを消す（総当たり形式の級の試合は残す）
  if (leagues.length > 0) {
    const { error } = await db
      .from("matches")
      .delete()
      .eq("tournament_id", tournamentId)
      .eq("stage", "league")
      .in("league_id", leagues.map((l) => l.id));
    if (error) throw new Error(error.message);
  }

  // ラウンドごとに全リーグを横並びで進める（同じ時間帯に各コートで1試合ずつ）
  type Draft = { leagueId: string; round: number; aId: string; bId: string };
  const drafts: Draft[] = [];
  for (const league of leagues) {
    const members = teams
      .filter((t) => t.league_id === league.id)
      .sort((a, b) => a.sort_order - b.sort_order);
    for (const pair of qualifyingPairs(members.length, division.qualifying_match_order)) {
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
    startTime: divisionStartTime(division, tournament),
    minutesPerMatch: divisionQualifyingMinutes(division, tournament),
    courts: divisionCourts(division, tournament),
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

  const { data: tournamentMatchData, error: tournamentMatchError } = await db
    .from("matches")
    .select("*")
    .eq("tournament_id", tournamentId);
  if (tournamentMatchError) throw new Error(tournamentMatchError.message);
  const tournamentMatches = (tournamentMatchData ?? []).filter((m) => !m.consolation_void) as Match[];
  const all = tournamentMatches.filter((match) => match.division_id === divisionId);

  const isQualifying = (m: Match) =>
    m.stage === "league" && m.league_id !== null && qualifyingLeagueIds.has(m.league_id);

  const matches = all.filter((m) => (phase === "qualifying" ? isQualifying(m) : !isQualifying(m)));
  if (matches.length === 0) return;

  // 各級の同じラウンドがまとまるように並べる。
  // 例: Aトーナメントの準々決勝と、Cリーグの1巡目が同じ時間帯に並ぶ。
  // 3位決定戦は同じラウンドの中で決勝より前に置く。
  const tournament = await getTournament(tournamentId);
  const division = await getDivision(tournamentId, divisionId);
  const tierOrder = new Map(divisionTiers(division, tournament).map((t, i) => [t.key, i]));
  const ordered = [...matches].sort((a, b) => {
    // 単発敗者戦は初戦対象が確定してから配置する（DB上のroundは1）。
    if (Boolean(a.is_consolation) !== Boolean(b.is_consolation)) return a.is_consolation ? 1 : -1;
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
    ordered.map((m) => ({
      id: m.id, teamAId: m.team_a_id, teamBId: m.team_b_id,
      dependsOnIds: schedulePredecessors(ordered,m),
    })),
    {
      ...options,
      reserved: tournamentMatches
        .filter((match) => !matches.some((target) => target.id === match.id))
        .filter((match) => match.court && match.scheduled_at)
        .map((match) => ({ court: match.court, scheduledAt: match.scheduled_at, durationMinutes: match.duration_minutes, teamAId: match.team_a_id, teamBId: match.team_b_id }))
        .concat(tournament.schedule_blocks.flatMap((block) => {
          const durationMinutes = Math.max(1, (Number(block.end_time.split(":")[0]) * 60 + Number(block.end_time.split(":")[1])) - (Number(block.start_time.split(":")[0]) * 60 + Number(block.start_time.split(":")[1])));
          return options.courts.map((court) => ({ court, scheduledAt: block.start_time, durationMinutes, teamAId: null, teamBId: null }));
        })),
    }
  );

  for (const a of assignments) {
    const { error } = await db
      .from("matches")
      .update({
        match_no: a.matchNo + offset,
        court: a.court,
        scheduled_at: a.scheduledAt,
        duration_minutes: a.durationMinutes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", a.id)
      .eq("tournament_id", tournamentId)
      .eq("division_id", divisionId);
    if (error) throw new Error(error.message);
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
  const { tournament, division, teams, matches } = state;
  const qualifyingLeagues = state.leagues.filter((l) => l.tier_key === null);

  if (!division.finals_enabled) {
    throw new Error("この部門は予選リーグの順位を最終順位として使う設定です。決勝ラウンドは作成しません。");
  }
  const tiers = divisionTiers(division, tournament);
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
  const { error: deleteMatchError } = await db
    .from("matches")
    .delete()
    .eq("tournament_id", tournamentId)
    .eq("division_id", divisionId)
    .eq("stage", "bracket");
  if (deleteMatchError) throw new Error(deleteMatchError.message);
  const oldTierLeagues = state.leagues.filter((l) => l.tier_key !== null);
  if (oldTierLeagues.length > 0) {
    const { error } = await db.from("leagues").delete().in("id", oldTierLeagues.map((l) => l.id));
    if (error) throw new Error(error.message);
  }

  let total = 0;
  for (const plan of buildable) {
    total +=
      plan.tier.format === "league"
        ? await createTierLeague(tournamentId, divisionId, plan)
        : await createTierBracket(tournamentId, divisionId, plan);
  }

  await autoAssignSchedule(tournamentId, divisionId, "finals", {
    startTime: options?.startTime || divisionFinalsStartTime(division, tournament),
    minutesPerMatch: divisionFinalsMinutes(division, tournament),
    courts: divisionCourts(division, tournament),
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
    if (Object.keys(patch).length > 0) {
      const { error } = await db
        .from("matches")
        .update(patch)
        .eq("id", id)
        .eq("tournament_id", tournamentId)
        .eq("division_id", divisionId);
      if (error) throw new Error(error.message);
    }
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
  const { data, error: readError } = await db
    .from("matches")
    .select("*")
    .eq("tournament_id", tournamentId)
    .eq("division_id", divisionId)
    .eq("stage", "bracket")
    .order("round");
  if (readError) throw new Error(readError.message);
  const matches = (data ?? []) as Match[];
  if (matches.length === 0) return;

  for (const { id, patch } of resolveBracketProgress(matches)) {
    const { error } = await db
      .from("matches")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("tournament_id", tournamentId)
      .eq("division_id", divisionId);
    if (error) throw new Error(error.message);
  }
  await syncConsolation(tournamentId, divisionId);
}

/** 自動生成は対象確定後の偶数組だけ。奇数組は管理者の明示操作に任せる。 */
export async function syncConsolation(tournamentId: string, divisionId: string, manual?: { tierKey: string; teamAId: string; teamBId: string }) {
  const state = await getState(tournamentId, divisionId);
  if (!state.division.consolation_enabled || !state.division.finals_enabled) {
    if (manual) throw new Error('部門のコンソレーションを有効にしてください。');
    return;
  }
  const db = supabaseAdmin();
  const { data: allMatches, error } = await db.from('matches').select('*').eq('tournament_id', tournamentId);
  if (error) throw new Error(error.message);
  const existing = (allMatches ?? []).filter((m) => !m.consolation_void) as Match[];
  const minutes = divisionFinalsMinutes(state.division, state.tournament);
  for (const tier of divisionTiers(state.division, state.tournament).filter((t) => t.format === 'bracket' && (!manual || t.key === manual.tierKey))) {
    const candidates = consolationCandidates(state.matches, tier.key);
    const pairs = manual ? [[manual.teamAId, manual.teamBId]] as [string,string][] : planConsolationPairs(state.matches, tier.key);
    if (!pairs.length) continue;
    if (manual && (!candidates.ready || manual.teamAId === manual.teamBId || !pairs[0].every((id) => candidates.available.includes(id)))) {
      throw new Error('対象確定後、未割り当ての初戦敗退チームから異なる2組を選んでください。');
    }
    const courts = divisionCourts(state.division, state.tournament);
    // 対象確定には全員の初戦終了が必要だが、他の級の決勝終了を待つ必要はない。
    const main = state.matches.filter((m) => m.stage === 'bracket' && m.tier_key === tier.key && !m.is_consolation && !m.is_third_place);
    const entrants = [...new Set(main.flatMap((m) => [m.team_a_id,m.team_b_id]).filter(Boolean))];
    const firstMatches = entrants.map((teamId) => main.filter((m) => m.team_a_id === teamId || m.team_b_id === teamId).sort((a,b) => (a.round ?? 0)-(b.round ?? 0))[0]);
    if (firstMatches.some((m) => !m?.scheduled_at)) throw new Error('本戦の初戦に時刻がありません。先に進行表を設定してください。');
    const earliest = firstMatches.reduce((time,m) => Math.max(time,parseTime(m.scheduled_at)+(m.duration_minutes ?? minutes)),parseTime(divisionFinalsStartTime(state.division,state.tournament)));
    const rows = [];
    for (const [team_a_id,team_b_id] of pairs) {
      const [assignment] = assignSchedule([{ id: 'consolation',teamAId:team_a_id,teamBId:team_b_id }], {
        startTime: formatTime(earliest),minutesPerMatch:minutes,courts,
        reserved: [...existing,...rows].filter((m) => m.scheduled_at).map((m) => ({ court:m.court,scheduledAt:m.scheduled_at,durationMinutes:m.duration_minutes,teamAId:m.team_a_id,teamBId:m.team_b_id }))
          .concat(state.tournament.schedule_blocks.flatMap((block) => courts.map((court) => ({ court,scheduledAt:block.start_time,durationMinutes:parseTime(block.end_time)-parseTime(block.start_time),teamAId:null,teamBId:null })))),
      });
      rows.push({ team_a_id,team_b_id,court:assignment.court,scheduled_at:assignment.scheduledAt,duration_minutes:minutes });
    }
    const { error: insertError } = await db.rpc('create_consolation_matches', { p_tournament_id: tournamentId, p_division_id: divisionId, p_tier_key: tier.key, p_rows: rows });
    if (insertError) throw new Error(insertError.message);
    rows.forEach((row) => existing.push({ ...row } as Match));
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

async function checkConsolationBeforeCorrection(match: Match) {
  if (match.stage !== 'bracket' || match.is_consolation || match.status !== 'done') return;
  const { data, error } = await supabaseAdmin().from('matches').select('id')
    .eq('tournament_id', match.tournament_id).eq('division_id', match.division_id)
    .eq('tier_key', match.tier_key).eq('is_consolation', true).eq('consolation_void', false).limit(1);
  if (error) throw new Error(error.message);
  if (data?.length) throw new Error('初戦敗退者が変わる可能性があります。決勝ラウンド画面でこの級のコンソレーションを取り消してから本戦結果を訂正してください。');
}

/**
 * 参加者が入力した結果を承認待ちとして保存する。
 * 勝者は入力されたスコアから自動判定し、正式結果・順位・決勝進行にはまだ反映しない。
 */
export async function submitResultForApproval(input: Pick<ResultInput, "matchId" | "sets"> & { teamId: string; pin: string }): Promise<Match> {
  const db = supabaseAdmin();
  const { data: found, error: findError } = await db
    .from("matches")
    .select("*")
    .eq("id", input.matchId)
    .single();
  if (findError || !found) throw new Error("試合が見つかりませんでした。");
  const match = toMatch(found as Record<string, unknown>);
  if (match.status === "done") {
    throw new Error("この試合は承認済みです。修正は主催者に依頼してください。");
  }
  if (!match.team_a_id || !match.team_b_id) {
    throw new Error("対戦チームがまだ決まっていません。");
  }

  const tournament = await getTournament(match.tournament_id);
  const division = await getDivision(match.tournament_id, match.division_id);
  const sets = normalizeSets(input.sets);
  const check = validateSets(sets, divisionSetsToWin(division, tournament));
  if (!check.ok || !check.winner) throw new Error(check.error ?? "スコアを確認してください。");

  const winner = check.winner === "a" ? match.team_a_id : match.team_b_id;
  if (input.teamId !== winner) throw new Error("勝利チームだけが結果を送信できます。");
  await verifyTeamPin(winner, input.pin);
  const now = new Date().toISOString();
  const { data: updated, error } = await db
    .from("matches")
    .update({
      approval_status: "pending",
      pending_sets: sets,
      pending_score_a: check.totalPoints.a,
      pending_score_b: check.totalPoints.b,
      pending_winner_team_id: winner,
      submitted_by_team_id: winner,
      submitted_at: now,
      approved_by_team_id: null,
      approved_at: null,
      rejection_reason: null,
      rejected_by_team_id: null,
      rejected_at: null,
      status: "pending",
      updated_at: now,
    })
    .eq("id", match.id)
    .eq("tournament_id", match.tournament_id)
    .eq("division_id", match.division_id)
    .neq("approval_status", "approved")
    .eq("updated_at", found.updated_at)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!updated) throw new Error("すでに別の操作で結果が確定されています。画面を再読み込みしてください。");

  await logMatchEvent({
    tournamentId: match.tournament_id,
    divisionId: match.division_id,
    matchId: match.id,
    action: "report_pending",
    scoreA: check.totalPoints.a,
    scoreB: check.totalPoints.b,
    actor: `team:${winner}`,
    payload: { sets, sets_won: check.setsWon, winner_team_id: winner },
  });

  return toMatch(updated as Record<string, unknown>);
}

/** 敗者側の承認を受けて、仮結果を正式結果へ反映する。 */
export async function approvePendingResult(matchId: string, teamId: string, pin: string): Promise<Match> {
  const db = supabaseAdmin();
  const { data: found, error: findError } = await db.from("matches").select("*").eq("id", matchId).single();
  if (findError || !found) throw new Error("試合が見つかりませんでした。");
  const match = toMatch(found as Record<string, unknown>);
  if (match.approval_status !== "pending") throw new Error("承認待ちの結果がありません。");
  if (!match.team_a_id || !match.team_b_id || !match.pending_winner_team_id) {
    throw new Error("承認する結果のチーム情報が不足しています。");
  }
  if (![match.team_a_id, match.team_b_id].includes(match.pending_winner_team_id)) {
    throw new Error("承認する勝者情報が正しくありません。");
  }

  const tournament = await getTournament(match.tournament_id);
  const division = await getDivision(match.tournament_id, match.division_id);
  const sets = normalizeSets(match.pending_sets);
  const check = validateSets(sets, divisionSetsToWin(division, tournament));
  if (!check.ok || !check.winner) throw new Error(check.error ?? "承認するスコアが正しくありません。");
  const winner = check.winner === "a" ? match.team_a_id : match.team_b_id;
  if (winner !== match.pending_winner_team_id) throw new Error("承認する勝者とスコアが一致しません。");
  const loser = winner === match.team_a_id ? match.team_b_id : match.team_a_id;
  if (teamId !== loser) throw new Error("敗戦チームだけが承認できます。");
  await verifyTeamPin(loser, pin);
  const now = new Date().toISOString();

  const { data: updated, error } = await db
    .from("matches")
    .update({
      sets,
      score_a: check.totalPoints.a,
      score_b: check.totalPoints.b,
      winner_team_id: winner,
      status: "done",
      reported_at: now,
      reported_by: "team-approved",
      approval_status: "approved",
      approved_by_team_id: loser,
      approved_at: now,
      pending_sets: [],
      pending_score_a: null,
      pending_score_b: null,
      pending_winner_team_id: null,
      submitted_by_team_id: null,
      submitted_at: null,
      rejection_reason: null,
      rejected_by_team_id: null,
      rejected_at: null,
      updated_at: now,
    })
    .eq("id", match.id)
    .eq("approval_status", "pending")
    .eq("updated_at", found.updated_at)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!updated) throw new Error("すでに別の操作で承認または差し戻しされています。画面を再読み込みしてください。");

  await logMatchEvent({
    tournamentId: match.tournament_id,
    divisionId: match.division_id,
    matchId: match.id,
    action: "approve",
    scoreA: check.totalPoints.a,
    scoreB: check.totalPoints.b,
    actor: `team:${loser}`,
    payload: { sets, winner_team_id: winner, approved_by_team_id: loser },
  });

  if (match.stage === "bracket") await recomputeBracket(match.tournament_id, match.division_id);
  return toMatch(updated as Record<string, unknown>);
}

/** 敗者側が内容を差し戻し、勝者側の再送信を待つ。 */
export async function rejectPendingResult(matchId: string, teamId: string, pin: string, reason: string): Promise<Match> {
  const db = supabaseAdmin();
  const { data: found, error: findError } = await db.from("matches").select("*").eq("id", matchId).single();
  if (findError || !found) throw new Error("試合が見つかりませんでした。");
  const match = toMatch(found as Record<string, unknown>);
  if (match.approval_status !== "pending" || !match.team_a_id || !match.team_b_id || !match.pending_winner_team_id) {
    throw new Error("差し戻せる承認待ち結果がありません。");
  }
  const loser = match.pending_winner_team_id === match.team_a_id ? match.team_b_id : match.team_a_id;
  if (teamId !== loser) throw new Error("敗戦チームだけが差し戻しできます。");
  await verifyTeamPin(loser, pin);
  const normalizedReason = reason.trim().slice(0, 300);
  if (!normalizedReason) throw new Error("修正してほしい内容を入力してください。");
  const now = new Date().toISOString();
  const { data: updated, error } = await db.from("matches").update({
    approval_status: "rejected",
    rejection_reason: normalizedReason,
    rejected_by_team_id: loser,
    rejected_at: now,
    updated_at: now,
  }).eq("id", match.id).eq("approval_status", "pending").eq("updated_at", found.updated_at).select("*").maybeSingle();
  if (error) throw new Error(error.message);
  if (!updated) throw new Error("すでに別の操作で更新されています。画面を再読み込みしてください。");
  await logMatchEvent({
    tournamentId: match.tournament_id,
    divisionId: match.division_id,
    matchId: match.id,
    action: "reject",
    actor: `team:${loser}`,
    payload: { reason: normalizedReason },
  });
  return toMatch(updated as Record<string, unknown>);
}

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
  await checkConsolationBeforeCorrection(match);
  if (input.tournamentId && match.tournament_id !== input.tournamentId) {
    throw new Error("選択中の大会に属さない試合です。");
  }
  if (input.divisionId && match.division_id !== input.divisionId) {
    throw new Error("選択中の部門に属さない試合です。");
  }
  const tournament = await getTournament(match.tournament_id);
  const division = await getDivision(match.tournament_id, match.division_id);

  if (!match.team_a_id || !match.team_b_id) {
    throw new Error("対戦チームがまだ決まっていません。");
  }

  const sets = normalizeSets(input.sets);
  const check = validateSets(sets, divisionSetsToWin(division, tournament));
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
      approval_status: "approved",
      pending_sets: [],
      pending_score_a: null,
      pending_score_b: null,
      pending_winner_team_id: null,
      submitted_by_team_id: null,
      submitted_at: null,
      approved_by_team_id: null,
      approved_at: new Date().toISOString(),
      rejection_reason: null,
      rejected_by_team_id: null,
      rejected_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", match.id)
    .eq("tournament_id", match.tournament_id)
    .eq("division_id", match.division_id)
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

  return toMatch(updated as Record<string, unknown>);
}

/** 結果を取り消して「待機中」に戻す（主催者のみ） */
export async function clearResult(matchId: string, tournamentId?: string, divisionId?: string) {
  const db = supabaseAdmin();
  const { data: found } = await db.from("matches").select("*").eq("id", matchId).single();
  if (!found) throw new Error("試合が見つかりませんでした。");
  const match = found as Match;
  await checkConsolationBeforeCorrection(match);
  if (tournamentId && match.tournament_id !== tournamentId) {
    throw new Error("選択中の大会に属さない試合です。");
  }
  if (divisionId && match.division_id !== divisionId) {
    throw new Error("選択中の部門に属さない試合です。");
  }

  const { error } = await db
    .from("matches")
    .update({
      sets: [],
      score_a: null,
      score_b: null,
      winner_team_id: null,
      status: "pending",
      reported_at: null,
      reported_by: null,
      approval_status: "none",
      pending_sets: [],
      pending_score_a: null,
      pending_score_b: null,
      pending_winner_team_id: null,
      submitted_by_team_id: null,
      submitted_at: null,
      approved_by_team_id: null,
      approved_at: null,
      rejection_reason: null,
      rejected_by_team_id: null,
      rejected_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", matchId)
    .eq("tournament_id", match.tournament_id)
    .eq("division_id", match.division_id);
  if (error) throw new Error(error.message);

  await logMatchEvent({
    tournamentId: match.tournament_id,
    divisionId: match.division_id,
    matchId,
    action: "reset",
    actor: "admin",
  });

  if (match.stage === "bracket") await recomputeBracket(match.tournament_id, match.division_id);
}
