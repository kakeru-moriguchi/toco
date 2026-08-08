import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_COOKIE,
  adminPasswordConfigured,
  createSessionToken,
  sessionCookieOptions,
  verifyPassword,
} from "@/lib/auth";
import { fail } from "@/lib/api";

export const dynamic = "force-dynamic";

/** 主催者ログイン */
export async function POST(req: NextRequest) {
  if (!adminPasswordConfigured()) {
    return fail("ADMIN_PASSWORD が設定されていません。README の手順で設定してください。", 500);
  }
  const body = await req.json().catch(() => ({}));
  const password = String(body?.password ?? "");
  if (!verifyPassword(password)) {
    // 総当たりを軽く抑止する
    await new Promise((r) => setTimeout(r, 600));
    return fail("パスワードが違います。", 401);
  }
  const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set(ADMIN_COOKIE, await createSessionToken(), sessionCookieOptions);
  return res;
}

/** ログアウト */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  return res;
}
