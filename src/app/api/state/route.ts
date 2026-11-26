import { getState } from "@/lib/data";
import { errorMessage, fail, ok, requireAdmin } from "@/lib/api";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/** 参加者画面が使う「大会の全状態」。1回で全画面ぶんのデータを返す。 */
export async function GET(req: NextRequest) {
  try {
    const adminAudience = req.nextUrl.searchParams.get("audience") === "admin";
    if (adminAudience && !(await requireAdmin(req))) return fail("認証が必要です。", 401);
    return ok(
      await getState(
        req.nextUrl.searchParams.get("tournament_id"),
        req.nextUrl.searchParams.get("division_id"),
        adminAudience
      )
    );
  } catch (e) {
    return fail(errorMessage(e), 500);
  }
}
