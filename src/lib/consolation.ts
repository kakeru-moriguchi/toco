import type { Match } from './types';

/** BYEの試合行は存在しないため、各チームの最初の実試合だけを判定する。 */
export function consolationCandidates(matches: Match[], tierKey: string) {
  const main = matches.filter((m) => m.stage === 'bracket' && m.tier_key === tierKey && !m.is_third_place && !m.is_consolation);
  const entrants = [...new Set(main.flatMap((m) => [m.team_a_id, m.team_b_id]).filter((id): id is string => Boolean(id)))];
  const firstMatches = entrants.map((teamId) => ({
    teamId,
    match: main.filter((m) => m.team_a_id === teamId || m.team_b_id === teamId)
      .sort((a, b) => (a.round ?? 0) - (b.round ?? 0) || (a.bracket_index ?? 0) - (b.bracket_index ?? 0))[0],
  }));
  const ready = entrants.length >= 2 && firstMatches.every(({ match }) => match.status === 'done' && match.approval_status === 'approved');
  const eligible = firstMatches.filter(({ teamId, match }) => match.status === 'done' && match.approval_status === 'approved' && match.winner_team_id && match.winner_team_id !== teamId).map(({ teamId }) => teamId);
  const used = new Set(matches.filter((m) => m.is_consolation && !m.consolation_void && m.tier_key === tierKey).flatMap((m) => [m.team_a_id, m.team_b_id]));
  return { ready, eligible, available: eligible.filter((id) => !used.has(id)), needsManualPairing: ready && eligible.length % 2 === 1 };
}

export function planConsolationPairs(matches: Match[], tierKey: string): [string, string][] {
  const candidates = consolationCandidates(matches, tierKey);
  if (!candidates.ready || candidates.needsManualPairing) return [];
  const pairs: [string, string][] = [];
  for (let i = 0; i + 1 < candidates.available.length; i += 2) pairs.push([candidates.available[i], candidates.available[i + 1]]);
  return pairs;
}
