import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, verifySessionToken } from "./auth";

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

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "予期しないエラーが発生しました。";
}
