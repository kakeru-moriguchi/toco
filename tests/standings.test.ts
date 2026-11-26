import assert from "node:assert/strict";
import test from "node:test";
import { computeAllStandings, computeStandings } from "../src/lib/standings";
import type { Match, Team } from "../src/lib/types";

function team(id: string, leagueId: string): Team {
  return { id, tournament_id: "t", division_id: "d", league_id: leagueId, name: id, members: "", sort_order: 0 };
}

function match(id: string, leagueId: string, a: string, b: string, scoreA: number, scoreB: number): Match {
  return {
    id,
    tournament_id: "t",
    division_id: "d",
    stage: "league",
    league_id: leagueId,
    tier_key: null,
    round: 1,
    bracket_index: null,
    is_third_place: false,
    match_no: 1,
    court: "1",
    scheduled_at: "09:00",
    status: "done",
    team_a_id: a,
    team_b_id: b,
    team_a_label: "",
    team_b_label: "",
    sets: [{ a: scoreA, b: scoreB }],
    score_a: scoreA,
    score_b: scoreB,
    winner_team_id: scoreA > scoreB ? a : b,
    next_match_id: null,
    next_slot: null,
    loser_next_match_id: null,
    loser_next_slot: null,
    reported_at: null,
    reported_by: "admin",
    approval_status: "approved",
    pending_sets: [],
    pending_score_a: null,
    pending_score_b: null,
    pending_winner_team_id: null,
    submitted_by_team_id: null,
    submitted_at: null,
    approved_by_team_id: null,
    approved_at: null,
  };
}

test("standings rank by wins then point difference", () => {
  const teams = [team("A", "l1"), team("B", "l1"), team("C", "l1")];
  const matches = [match("m1", "l1", "A", "B", 11, 3), match("m2", "l1", "B", "C", 11, 9)];
  const rows = computeStandings(teams, matches, ["wins", "diff"]);
  assert.deepEqual(rows.map((row) => row.teamId), ["A", "B", "C"]);
  assert.deepEqual(rows.map((row) => row.rank), [1, 2, 3]);
  assert.equal(rows[1].played, 2);
});

test("results waiting for opponent approval do not affect standings", () => {
  const teams = [team("A", "l1"), team("B", "l1")];
  const pending = match("m1", "l1", "A", "B", 11, 3);
  pending.status = "pending";
  pending.sets = [];
  pending.score_a = null;
  pending.score_b = null;
  pending.winner_team_id = null;
  pending.approval_status = "pending";
  pending.pending_sets = [{ a: 11, b: 3 }];
  pending.pending_score_a = 11;
  pending.pending_score_b = 3;
  pending.pending_winner_team_id = "A";

  const rows = computeStandings(teams, [pending], ["wins", "diff"]);
  assert.deepEqual(rows.map((row) => row.played), [0, 0]);
  assert.deepEqual(rows.map((row) => row.wins), [0, 0]);
});

test("league aggregation does not mix matches from another league", () => {
  const teams = [team("A", "l1"), team("B", "l1"), team("X", "l2"), team("Y", "l2")];
  const tables = computeAllStandings(
    ["l1", "l2"],
    teams,
    [match("m1", "l1", "A", "B", 11, 2), match("m2", "l2", "Y", "X", 11, 1)],
    ["wins", "diff"]
  );
  assert.deepEqual(tables.l1.map((row) => row.teamId), ["A", "B"]);
  assert.deepEqual(tables.l2.map((row) => row.teamId), ["Y", "X"]);
  assert.equal(tables.l1[0].played, 1);
  assert.equal(tables.l2[0].played, 1);
});

