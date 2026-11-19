import { getState } from "@/lib/data";
import { errorMessage, fail, ok } from "@/lib/api";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/** 参加者画面が使う「大会の全状態」。1回で全画面ぶんのデータを返す。 */
export async function GET(req: NextRequest) {
  try {
    return ok(
      await getState(
        req.nextUrl.searchParams.get("tournament_id"),
        req.nextUrl.searchParams.get("division_id")
      )
    );
  } catch (e) {
    return fail(errorMessage(e), 500);
  }
}
