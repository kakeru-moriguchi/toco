import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSets, totalPoints, validateSets } from "../src/lib/score";

test("single-set result selects the winner and totals points", () => {
  const result = validateSets([{ a: 11, b: 7 }], 1);
  assert.equal(result.ok, true);
  assert.equal(result.winner, "a");
  assert.deepEqual(result.totalPoints, { a: 11, b: 7 });
});

test("three-game format requires all games and counts the game winner", () => {
  assert.equal(validateSets([{ a: 11, b: 7 }, { a: 11, b: 5 }], 2).ok, false);
  const result = validateSets([{ a: 11, b: 7 }, { a: 8, b: 11 }, { a: 11, b: 9 }], 2);
  assert.equal(result.ok, true);
  assert.equal(result.winner, "a");
  assert.deepEqual(result.setsWon, { a: 2, b: 1 });
  assert.deepEqual(result.totalPoints, { a: 30, b: 27 });
});

test("invalid and negative score input is normalized safely", () => {
  const sets = normalizeSets([{ a: -2, b: 11 }, null, { a: "7", b: "5" }, { a: "x", b: 1 }]);
  assert.deepEqual(sets, [{ a: 0, b: 11 }, { a: 7, b: 5 }]);
  assert.deepEqual(totalPoints(sets), { a: 7, b: 16 });
  assert.equal(validateSets([{ a: 10, b: 10 }], 1).ok, false);
});

