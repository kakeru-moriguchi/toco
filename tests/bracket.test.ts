import assert from "node:assert/strict";
import test from "node:test";
import { planBracket, resolveBracketProgress, type Qualifier } from "../src/lib/bracket";
import type { Match } from "../src/lib/types";

const qualifiers: Qualifier[] = [
  { teamId: "A1", teamName: "A1", leagueName: "A", rankInLeague: 1, label: "A1" },
  { teamId: "B1", teamName: "B1", leagueName: "B", rankInLeague: 1, label: "B1" },
  { teamId: "A2", teamName: "A2", leagueName: "A", rankInLeague: 2, label: "A2" },
  { teamId: "B2", teamName: "B2", leagueName: "B", rankInLeague: 2, label: "B2" },
];

test("bracket planning avoids same-league opening matches and adds third place", () => {
  const planned = planBracket(qualifiers, { thirdPlaceMatch: true });
  const opening = planned.filter((match) => match.round === 1);
  assert.equal(opening.length, 2);
  for (const match of opening) {
    assert.notEqual(match.teamAId?.slice(0, 1), match.teamBId?.slice(0, 1));
  }
  assert.equal(planned.filter((match) => match.isThirdPlace).length, 1);
});

test("six-team two-league bracket gives first-place byes and cross-league opening matches", () => {
  const six: Qualifier[] = [
    { teamId: "A1", teamName: "A1", leagueName: "A", rankInLeague: 1, label: "A1" },
    { teamId: "B1", teamName: "B1", leagueName: "B", rankInLeague: 1, label: "B1" },
    { teamId: "B2", teamName: "B2", leagueName: "B", rankInLeague: 2, label: "B2" },
    { teamId: "A2", teamName: "A2", leagueName: "A", rankInLeague: 2, label: "A2" },
    { teamId: "A3", teamName: "A3", leagueName: "A", rankInLeague: 3, label: "A3" },
    { teamId: "B3", teamName: "B3", leagueName: "B", rankInLeague: 3, label: "B3" },
  ];
  const planned = planBracket(six, { thirdPlaceMatch: true });
  const opening = planned.filter((match) => match.round === 1);
  assert.equal(opening.length, 2);
  assert.deepEqual(new Set(opening.flatMap((match) => [match.teamAId, match.teamBId])), new Set(["A2", "A3", "B2", "B3"]));
  for (const match of opening) assert.notEqual(match.teamAId?.slice(0, 1), match.teamBId?.slice(0, 1));
  const semis = planned.filter((match) => match.round === 2 && !match.isThirdPlace);
  assert.ok(semis.some((match) => match.teamAId === "A1" || match.teamBId === "A1"));
  assert.ok(semis.some((match) => match.teamAId === "B1" || match.teamBId === "B1"));
});

function bracketMatch(patch: Partial<Match> & Pick<Match, "id">): Match {
  return {
    tournament_id: "t",
    division_id: "d",
    stage: "bracket",
    league_id: null,
    tier_key: "A",
    round: 1,
    bracket_index: 0,
    is_third_place: false,
    match_no: 1,
    court: "1",
    scheduled_at: "09:00",
    status: "pending",
    team_a_id: null,
    team_b_id: null,
    team_a_label: "",
    team_b_label: "",
    sets: [],
    score_a: null,
    score_b: null,
    winner_team_id: null,
    next_match_id: null,
    next_slot: null,
    loser_next_match_id: null,
    loser_next_slot: null,
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
    ...patch,
  };
}

test("bracket recomputation advances winners and clears stale final results", () => {
  const semifinal = bracketMatch({
    id: "semi",
    status: "done",
    team_a_id: "A",
    team_b_id: "B",
    winner_team_id: "A",
    score_a: 11,
    score_b: 5,
    next_match_id: "final",
    next_slot: "a",
  });
  const final = bracketMatch({
    id: "final",
    round: 2,
    status: "done",
    team_a_id: "OLD",
    team_b_id: "C",
    winner_team_id: "OLD",
    score_a: 11,
    score_b: 8,
  });
  const patches = resolveBracketProgress([semifinal, final]);
  assert.deepEqual(patches, [{
    id: "final",
    patch: {
      team_a_id: "A",
      sets: [],
      score_a: null,
      score_b: null,
      winner_team_id: null,
      status: "pending",
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
    },
  }]);
});

