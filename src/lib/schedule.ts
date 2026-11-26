/**
 * 対戦カード生成と進行表（時間・コート）の自動割り当て
 */

export type RoundRobinPair = { round: number; a: number; b: number };

/**
 * 総当たり戦の組み合わせをサークル法で生成する。
 * 同じラウンドには同じチームが2回出てこないので、
 * そのまま並べれば「連戦」になりにくい進行順になる。
 * 返り値のインデックスは渡したチーム配列の位置。
 */
export function roundRobin(teamCount: number): RoundRobinPair[] {
  if (teamCount < 2) return [];
  const ids = Array.from({ length: teamCount }, (_, i) => i);
  const hasBye = ids.length % 2 === 1;
  if (hasBye) ids.push(-1); // 休みダミー

  const n = ids.length;
  const rounds = n - 1;
  const half = n / 2;
  const rotating = ids.slice(1);
  const out: RoundRobinPair[] = [];

  for (let r = 0; r < rounds; r++) {
    const arrangement = [ids[0], ...rotating];
    for (let i = 0; i < half; i++) {
      const a = arrangement[i];
      const b = arrangement[n - 1 - i];
      if (a === -1 || b === -1) continue;
      // 先攻後攻が偏らないように交互に入れ替える
      out.push(r % 2 === 0 ? { round: r + 1, a, b } : { round: r + 1, a: b, b: a });
    }
    rotating.unshift(rotating.pop()!);
  }
  return out;
}

/** PDFの5チームリーグで指定された10試合の進行順。5チーム以外は通常のサークル法。 */
export function qualifyingPairs(teamCount: number, order: "balanced" | "toco_5_team"): RoundRobinPair[] {
  if (order !== "toco_5_team" || teamCount !== 5) return roundRobin(teamCount);
  const pairs = [
    [0, 1], [2, 3], [0, 4], [1, 2], [3, 4],
    [0, 2], [1, 3], [2, 4], [0, 3], [1, 4],
  ];
  return pairs.map(([a, b], index) => ({ round: index + 1, a, b }));
}

export type SchedulableMatch = {
  id: string;
  teamAId: string | null;
  teamBId: string | null;
  dependsOnIds?: string[];
};

export type ScheduleOptions = {
  /** 'HH:MM' */
  startTime: string;
  /** 1試合あたりの持ち時間（分） */
  minutesPerMatch: number;
  /** コート名の配列。例: ['1','2','3','4'] */
  courts: string[];
  /** 他部門など、すでに使用が確定しているコート枠。 */
  reserved?: { court: string; scheduledAt: string; durationMinutes?: number | null; teamAId?: string | null; teamBId?: string | null }[];
};

export type ScheduleAssignment = {
  id: string;
  matchNo: number;
  court: string;
  scheduledAt: string;
  durationMinutes: number;
};

export type CourtSlot = {
  id: string;
  division_id: string;
  court: string;
  scheduled_at: string;
  duration_minutes?: number | null;
  team_a_id?: string | null;
  team_b_id?: string | null;
  next_match_id?: string | null;
  loser_next_match_id?: string | null;
  stage?: string;
  tier_key?: string | null;
  round?: number | null;
  is_consolation?: boolean;
  is_third_place?: boolean;
};

/** 勝者・敗者の進出先と、単発敗者戦の対象確定に必要な初戦。 */
export function schedulePredecessors(rows: CourtSlot[], match: CourtSlot): string[] {
  const ids = rows.filter((row) => row.next_match_id === match.id || row.loser_next_match_id === match.id).map((row) => row.id);
  if (match.is_consolation) {
    const main = rows.filter((row) => row.division_id === match.division_id && row.tier_key === match.tier_key && row.stage === 'bracket' && !row.is_consolation && !row.is_third_place)
      .sort((a,b) => (a.round ?? 0)-(b.round ?? 0));
    const teams = new Set(main.flatMap((row) => [row.team_a_id,row.team_b_id]).filter(Boolean));
    for (const team of teams) {
      const first = main.find((row) => row.team_a_id === team || row.team_b_id === team);
      if (first) ids.push(first.id);
    }
  }
  return [...new Set(ids)];
}

export function findDependencyConflict(rows: CourtSlot[], watchedIds: Set<string>) {
  const byId = new Map(rows.map((row) => [row.id,row]));
  for (const next of rows) {
    if (!next.scheduled_at) continue;
    for (const priorId of schedulePredecessors(rows,next)) {
      const prior = byId.get(priorId);
      if (!prior?.scheduled_at || (!watchedIds.has(prior.id) && !watchedIds.has(next.id))) continue;
      if (parseTime(next.scheduled_at) < parseTime(prior.scheduled_at)+Math.max(1,prior.duration_minutes ?? 1)) return {prior,next};
    }
  }
  return null;
}

/** 9:00 と 09:00 を同じ枠として扱う。 */
export function normalizeScheduledAt(value: string): string {
  const [hour, minute] = value.split(":");
  return `${hour.padStart(2, "0")}:${minute}`;
}

/** watchedIds の更新によって発生する、大会全体の同時刻・同コート重複を返す。 */
export function findCourtConflict(rows: CourtSlot[], watchedIds: Set<string>) {
  for (let i = 0; i < rows.length; i++) {
    const first = rows[i];
    if (!first.scheduled_at) continue;
    const firstStart = parseTime(first.scheduled_at);
    const firstEnd = firstStart + Math.max(1, first.duration_minutes ?? 1);
    for (let j = i + 1; j < rows.length; j++) {
      const second = rows[j];
      if (!second.scheduled_at) continue;
      if (!watchedIds.has(first.id) && !watchedIds.has(second.id)) continue;
      const secondStart = parseTime(second.scheduled_at);
      const secondEnd = secondStart + Math.max(1, second.duration_minutes ?? 1);
      const sameCourt = Boolean(first.court && first.court === second.court);
      const sameTeam = [first.team_a_id, first.team_b_id]
        .filter(Boolean)
        .some((teamId) => teamId === second.team_a_id || teamId === second.team_b_id);
      if ((sameCourt || sameTeam) && firstStart < secondEnd && secondStart < firstEnd) return { first, second };
    }
  }
  return null;
}

function parseTime(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return 9 * 60;
  return Number(m[1]) * 60 + Number(m[2]);
}

function formatTime(minutes: number): string {
  const total = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * 渡された順番を尊重しつつ、時間帯とコートを割り当てる。
 * 同じ時間帯に同じチームが2試合入らないように、入らない試合は次の時間帯へ送る。
 */
export function assignSchedule(
  matches: SchedulableMatch[],
  options: ScheduleOptions
): ScheduleAssignment[] {
  const courts = options.courts.length > 0 ? options.courts : ["1"];
  const start = parseTime(options.startTime);
  const step = Math.max(5, options.minutesPerMatch || 20);

  // slotIndex -> そのスロットに入っているチームID / 使用中コート
  const busy: Map<number, Set<string>> = new Map();
  const usedCourts: Map<number, Set<string>> = new Map();
  const result: ScheduleAssignment[] = [];

  matches.forEach((m, i) => {
    const dependencyEnd = (m.dependsOnIds ?? []).reduce((end, id) => {
      const prior = result.find((assignment) => assignment.id === id);
      if (!prior) throw new Error('前の試合が未配置です。ラウンド順を確認してください。');
      return Math.max(end, parseTime(prior.scheduledAt)+prior.durationMinutes);
    }, start);
    let slot = Math.max(0, Math.ceil((dependencyEnd-start)/step));
    for (;;) {
      const teams = busy.get(slot) ?? new Set<string>();
      const occupied = usedCourts.get(slot) ?? new Set<string>();
      const candidateStart = start + slot * step;
      if (candidateStart + step > 1440) throw new Error('当日中に試合を配置できません。使用コート・開始時刻・試合時間を調整してください。');
      const reservations = (options.reserved ?? []).filter((reservation) => {
        const reservedStart = parseTime(reservation.scheduledAt);
        return candidateStart < reservedStart + Math.max(1, reservation.durationMinutes ?? step) && reservedStart < candidateStart + step;
      });
      const court = courts.find((candidate) => !occupied.has(candidate) && !reservations.some((reservation) => reservation.court === candidate));
      const conflict =
        (m.teamAId !== null && teams.has(m.teamAId)) ||
        (m.teamBId !== null && teams.has(m.teamBId)) ||
        reservations.some((reservation) => [m.teamAId,m.teamBId].filter(Boolean).some((id) => id === reservation.teamAId || id === reservation.teamBId));
      if (court && !conflict) {
        if (m.teamAId) teams.add(m.teamAId);
        if (m.teamBId) teams.add(m.teamBId);
        busy.set(slot, teams);
        occupied.add(court);
        usedCourts.set(slot, occupied);
        result.push({
          id: m.id,
          matchNo: i + 1,
          court,
          scheduledAt: formatTime(start + slot * step),
          durationMinutes: step,
        });
        break;
      }
      slot++;
    }
  });

  return result;
}

export { formatTime, parseTime };
