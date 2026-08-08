import type { NextRequest } from "next/server";
import { saveResult } from "@/lib/data";
import { errorMessage, fail, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * 各チームの代表者がスマホから結果を送信する窓口。
 * ログイン不要。将来ここに「試合ごとのPINコード照合」「相手チームの承認待ち」を
 * 挟めるように、結果の確定処理は saveResult() 側にまとめてある。
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const scoreA = Number(body?.scoreA);
    const scoreB = Number(body?.scoreB);
    if (Number.isNaN(scoreA) || Number.isNaN(scoreB)) {
      return fail("スコアを入力してください。");
    }
    const match = await saveResult({ matchId: id, scoreA, scoreB, actor: "team" });
    return ok({ match });
  } catch (e) {
    return fail(errorMessage(e));
  }
}
