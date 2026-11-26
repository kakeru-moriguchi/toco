import assert from "node:assert/strict";
import test from "node:test";
import { assignSchedule, findCourtConflict, normalizeScheduledAt, qualifyingPairs, roundRobin } from "../src/lib/schedule";

test("round robin creates every pairing once without a same-round duplicate", () => {
  const pairs = roundRobin(5);
  assert.equal(pairs.length, 10);
  const unique = new Set(pairs.map((pair) => [pair.a, pair.b].sort((a, b) => a - b).join("-")));
  assert.equal(unique.size, 10);

  for (const round of new Set(pairs.map((pair) => pair.round))) {
    const teams = pairs.filter((pair) => pair.round === round).flatMap((pair) => [pair.a, pair.b]);
    assert.equal(new Set(teams).size, teams.length);
  }
});

test("TOCO five-team order follows the published progression", () => {
  assert.deepEqual(
    qualifyingPairs(5, "toco_5_team").map(({ a, b }) => [a + 1, b + 1]),
    [[1, 2], [3, 4], [1, 5], [2, 3], [4, 5], [1, 3], [2, 4], [3, 5], [1, 4], [2, 5]]
  );
});

test("automatic scheduling respects reserved courts and avoids consecutive team collisions", () => {
  const result = assignSchedule(
    [
      { id: "m1", teamAId: "a", teamBId: "b" },
      { id: "m2", teamAId: "a", teamBId: "c" },
      { id: "m3", teamAId: "d", teamBId: "e" },
    ],
    {
      startTime: "09:00",
      minutesPerMatch: 20,
      courts: ["1", "2"],
      reserved: [{ court: "1", scheduledAt: "09:00" }],
    }
  );

  assert.deepEqual(result[0], { id: "m1", matchNo: 1, court: "2", scheduledAt: "09:00", durationMinutes: 20 });
  assert.equal(result[1].scheduledAt, "09:20");
  assert.notEqual(`${result[0].scheduledAt}:${result[0].court}`, `${result[2].scheduledAt}:${result[2].court}`);
});

test("court conflict detection catches overlapping 30 and 45 minute matches", () => {
  const rows = [
    { id: "a", division_id: "division-a", court: "1", scheduled_at: "09:00", duration_minutes: 45 },
    { id: "b", division_id: "division-b", court: "1", scheduled_at: "09:30", duration_minutes: 30 },
  ];
  const conflict = findCourtConflict(rows, new Set(["b"]));
  assert.equal(conflict?.first.id, "a");
  assert.equal(conflict?.second.id, "b");
});

test("schedule conflict detection catches the same team on different courts", () => {
  const rows = [
    { id: "a", division_id: "division", court: "1", scheduled_at: "09:00", duration_minutes: 30, team_a_id: "team", team_b_id: "x" },
    { id: "b", division_id: "division", court: "2", scheduled_at: "09:15", duration_minutes: 30, team_a_id: "y", team_b_id: "team" },
  ];
  assert.ok(findCourtConflict(rows, new Set(["b"])));
});

test("automatic scheduling skips a tournament-wide break that starts between generated slots", () => {
  const result = assignSchedule(
    [
      { id: "m1", teamAId: "a", teamBId: "b" },
      { id: "m2", teamAId: "c", teamBId: "d" },
    ],
    {
      startTime: "12:45",
      minutesPerMatch: 30,
      courts: ["1"],
      reserved: [{ court: "1", scheduledAt: "13:00", durationMinutes: 30 }],
    }
  );
  assert.equal(result[0].scheduledAt, "13:45");
  assert.equal(result[1].scheduledAt, "14:15");
});

test("automatic scheduling does not overlap a team already playing in another phase", () => {
  const [assignment] = assignSchedule(
    [{ id: "final", teamAId: "a", teamBId: "z" }],
    {
      startTime: "09:00",
      minutesPerMatch: 30,
      courts: ["2"],
      reserved: [{ court: "1", scheduledAt: "09:00", durationMinutes: 45, teamAId: "a", teamBId: "b" }],
    }
  );
  assert.equal(assignment.scheduledAt, "10:00");
});

test("court conflict detection treats 9:00 and 09:00 as the same tournament slot", () => {
  assert.equal(normalizeScheduledAt("9:00"), "09:00");
  const rows = [
    { id: "a", division_id: "division-a", court: "1", scheduled_at: "9:00" },
    { id: "b", division_id: "division-b", court: "1", scheduled_at: "09:00" },
  ];
  const conflict = findCourtConflict(rows, new Set(["b"]));
  assert.equal(conflict?.first.id, "a");
  assert.equal(conflict?.second.id, "b");
});

