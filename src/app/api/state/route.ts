import { getState } from "@/lib/data";
import { errorMessage, fail, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

/** 参加者画面が使う「大会の全状態」。1回で全画面ぶんのデータを返す。 */
export async function GET() {
  try {
    return ok(await getState());
  } catch (e) {
    return fail(errorMessage(e), 500);
  }
}
