"use client";

import { selectedTournamentId } from "./tournamentSelection";
import { selectedDivisionId } from "./divisionSelection";

function adminHeaders() {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const tournamentId = selectedTournamentId();
  if (tournamentId) headers["X-Tournament-Id"] = tournamentId;
  const divisionId = selectedDivisionId(tournamentId);
  if (divisionId) headers["X-Division-Id"] = divisionId;
  return headers;
}

/** 管理画面から叩くAPIの共通ラッパー */
export async function adminPost(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(path, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? "保存できませんでした。");
  return json;
}

export async function adminPatch(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(path, {
    method: "PATCH",
    headers: adminHeaders(),
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? "保存できませんでした。");
  return json;
}
