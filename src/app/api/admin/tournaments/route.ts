import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { ensureLeagues } from "@/lib/data";
import { errorMessage, fail, ok, requireAdmin } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return fail("認証が必要です。", 401);
  try {
    const { data, error } = await supabaseAdmin()
      .from("tournaments")
      .select("id,name,event_date,venue,phase,archived_at,created_at,updated_at")
      .order("archived_at", { ascending: true, nullsFirst: true })
      .order("event_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ok({ tournaments: data ?? [] });
  } catch (e) {
    return fail(errorMessage(e), 500);
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return fail("認証が必要です。", 401);
  try {
    const body = await req.json();
    const action = String(body?.action ?? "");
    const db = supabaseAdmin();

    if (action === "create") {
      const name = String(body.name ?? "").trim();
      if (!name) return fail("大会名を入力してください。");
      const eventDate = typeof body.event_date === "string" ? body.event_date || null : null;
      const venue = String(body.venue ?? "").trim().slice(0, 120);
      const { data, error } = await db
        .from("tournaments")
        .insert({ name: name.slice(0, 120), event_date: eventDate, venue, phase: "setup" })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      await ensureLeagues(data.id, data.league_count);
      return ok({ tournament: data });
    }

    const id = String(body.id ?? "");
    if (!id) return fail("対象の大会が指定されていません。");
    const { data: tournament, error: findError } = await db
      .from("tournaments")
      .select("id,name,archived_at")
      .eq("id", id)
      .maybeSingle();
    if (findError) throw new Error(findError.message);
    if (!tournament) return fail("大会が見つかりません。");

    if (action === "archive") {
      if (body.confirm !== tournament.name) return fail("確認欄に大会名を正確に入力してください。");
      const { count, error: countError } = await db
        .from("tournaments")
        .select("id", { count: "exact", head: true })
        .is("archived_at", null)
        .neq("id", id);
      if (countError) throw new Error(countError.message);
      if ((count ?? 0) === 0) return fail("最後の大会はアーカイブできません。先に新しい大会を作成してください。");
      const { error } = await db
        .from("tournaments")
        .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
    } else if (action === "restore") {
      const { error } = await db
        .from("tournaments")
        .update({ archived_at: null, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      return fail("不明な操作です。");
    }

    return ok();
  } catch (e) {
    return fail(errorMessage(e), 500);
  }
}
