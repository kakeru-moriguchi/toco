import assert from "node:assert/strict";
import test from "node:test";
import { createSessionToken, safeEqual, verifyPassword, verifySessionToken } from "../src/lib/auth";

test("admin password comparison accepts only the configured exact password", () => {
  const previous = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = "test-password";
  try {
    assert.equal(verifyPassword("test-password"), true);
    assert.equal(verifyPassword("test-password!"), false);
    assert.equal(safeEqual("same", "same"), true);
    assert.equal(safeEqual("same", "diff"), false);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previous;
  }
});

test("signed admin sessions reject tampering and expiration", async () => {
  const previous = process.env.ADMIN_SESSION_SECRET;
  process.env.ADMIN_SESSION_SECRET = "test-session-secret";
  try {
    const token = await createSessionToken(1);
    assert.equal(await verifySessionToken(token), true);
    assert.equal(await verifySessionToken(`${token.slice(0, -1)}x`), false);
    assert.equal(await verifySessionToken(await createSessionToken(-1)), false);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_SESSION_SECRET;
    else process.env.ADMIN_SESSION_SECRET = previous;
  }
});

