"use client";

/** 管理画面から叩くAPIの共通ラッパー */
export async function adminPost(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? "保存できませんでした。");
  return json;
}

export async function adminPatch(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? "保存できませんでした。");
  return json;
}
