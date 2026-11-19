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

export type SchedulableMatch = {
  id: string;
  teamAId: string | null;
  teamBId: string | null;
};

export type ScheduleOptions = {
  /** 'HH:MM' */
  startTime: string;
  /** 1試合あたりの持ち時間（分） */
  minutesPerMatch: number;
  /** コート名の配列。例: ['1','2','3','4'] */
  courts: string[];
  /** 他部門など、すでに使用が確定しているコート枠。 */
  reserved?: { court: string; scheduledAt: string }[];
};

export type ScheduleAssignment = {
  id: string;
  matchNo: number;
  court: string;
  scheduledAt: string;
};

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

  for (const reservation of options.reserved ?? []) {
    const delta = parseTime(reservation.scheduledAt) - start;
    if (delta < 0 || delta % step !== 0 || !courts.includes(reservation.court)) continue;
    const slot = delta / step;
    const used = usedCourts.get(slot) ?? new Set<string>();
    used.add(reservation.court);
    usedCourts.set(slot, used);
  }

  matches.forEach((m, i) => {
    let slot = 0;
    for (;;) {
      const teams = busy.get(slot) ?? new Set<string>();
      const occupied = usedCourts.get(slot) ?? new Set<string>();
      const court = courts.find((candidate) => !occupied.has(candidate));
      const conflict =
        (m.teamAId !== null && teams.has(m.teamAId)) ||
        (m.teamBId !== null && teams.has(m.teamBId));
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
        });
        break;
      }
      slot++;
      if (slot > matches.length + courts.length + 5) {
        // 念のための無限ループ防止
        result.push({
          id: m.id,
          matchNo: i + 1,
          court: courts[0],
          scheduledAt: formatTime(start + slot * step),
        });
        break;
      }
    }
  });

  return result;
}

export { formatTime, parseTime };
