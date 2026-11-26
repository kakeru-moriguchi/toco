import assert from 'node:assert/strict';
import test from 'node:test';
import { consolationCandidates, planConsolationPairs } from '../src/lib/consolation';
import { resolveBracketProgress } from '../src/lib/bracket';
import type { Match } from '../src/lib/types';

function match(id: string, a: string, b: string, winner: string, round = 1): Match {
  return { id, tournament_id: 't', division_id: 'd', stage: 'bracket', tier_key: 'A', team_a_id: a, team_b_id: b, winner_team_id: winner, status: 'done', approval_status: 'approved', round, bracket_index: 0, is_third_place: false } as Match;
}

test('only first real-match losers enter once, winners of consolation never advance', () => {
  const matches = [match('s1','a','b','a'),match('s2','c','d','c'),match('final','a','c','a',2)];
  assert.deepEqual(planConsolationPairs(matches,'A'), [['b','d']]);
  matches.push({ ...match('con','b','d','b'), is_consolation: true });
  assert.deepEqual(planConsolationPairs(matches,'A'), []);
  assert.deepEqual(resolveBracketProgress(matches), []);
});

test('a seed losing its first actual match after a BYE qualifies and odd counts require admin decision', () => {
  const matches = [match('q1','c','d','c'), match('q2','e','f','e'),match('s1','a','c','c',2),match('s2','b','e','b',2)];
  const candidates = consolationCandidates(matches,'A');
  assert.equal(candidates.ready,true);
  assert.deepEqual(new Set(candidates.eligible),new Set(['d','f','a']));
  assert.equal(candidates.needsManualPairing,true);
  assert.deepEqual(planConsolationPairs(matches,'A'),[]);
});

test('pending approval and unrelated tiers do not create consolation', () => {
  const matches = [match('s1','a','b','a'), { ...match('s2','c','d','c'), status: 'pending', approval_status: 'pending' } as Match];
  assert.equal(consolationCandidates(matches,'A').ready,false);
  assert.deepEqual(planConsolationPairs(matches,'A'),[]);
  assert.deepEqual(planConsolationPairs(matches,'B'),[]);
});
