import type { NextRequest } from "next/server";
import { approvePendingResult, rejectPendingResult, submitResultForApproval } from "@/lib/data";
import { errorMessage, fail, ok, readSets } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * 各チームの代表者がスマホから結果を送信する窓口。
 * ログイン不要。勝者側が結果を仮登録し、敗者側の承認後に正式結果へ反映する。
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    if (body?.action === "approve") {
      const match = await approvePendingResult(id, String(body.team_id ?? ""), String(body.pin ?? ""));
      return ok({ match });
    }
    if (body?.action === "reject") {
      const match = await rejectPendingResult(id, String(body.team_id ?? ""), String(body.pin ?? ""), String(body.reason ?? ""));
      return ok({ match });
    }
    const sets = readSets(body);
    if (sets.length === 0) return fail("スコアを入力してください。");
    const match = await submitResultForApproval({ matchId: id, sets, teamId: String(body.team_id ?? ""), pin: String(body.pin ?? "") });
    return ok({ match });
  } catch (e) {
    return fail(errorMessage(e));
  }
}
