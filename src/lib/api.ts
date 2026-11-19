import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, verifySessionToken } from "./auth";
import { normalizeSets } from "./score";
import type { SetScore } from "./types";

export function ok(data: unknown = { ok: true }) {
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

/** 管理APIの入口チェック。middleware に加えて各APIでも必ず確認する。 */
export async function requireAdmin(req: NextRequest): Promise<boolean> {
  return verifySessionToken(req.cookies.get(ADMIN_COOKIE)?.value);
}

/** 管理画面で選択中の大会。未指定なら公開側と同じ既定大会を使う。 */
export function tournamentIdFromRequest(req: NextRequest): string | null {
  const value = req.headers.get("x-tournament-id")?.trim() ?? "";
  return /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value) ? value : null;
}

export function divisionIdFromRequest(req: NextRequest): string | null {
  const value = req.headers.get("x-division-id")?.trim() ?? "";
  return /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value) ? value : null;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "予期しないエラーが発生しました。";
}

/**
 * リクエストからセットスコアを読み取る。
 * 新しい形式（sets の配列）と、1セットだけの古い形式（scoreA / scoreB）の両方を受ける。
 */
export function readSets(body: unknown): SetScore[] {
  const b = (body ?? {}) as Record<string, unknown>;
  if (Array.isArray(b.sets)) return normalizeSets(b.sets);
  const a = Number(b.scoreA);
  const c = Number(b.scoreB);
  if (Number.isFinite(a) && Number.isFinite(c)) return [{ a: Math.trunc(a), b: Math.trunc(c) }];
  return [];
}
