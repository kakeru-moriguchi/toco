/**
 * 主催者（管理画面）向けの簡易認証。
 * ------------------------------------------------------------
 * 参加者にはログインを一切求めない。管理画面だけを守るために、
 * 環境変数のパスワードと照合して署名付きCookieを発行する方式にしている。
 * ユーザーテーブルもメール送信も不要なので、MVPとして最小構成。
 * Web Crypto を使っているので Edge(middleware) でもそのまま動く。
 */

export const ADMIN_COOKIE = "rb_admin";
const DEFAULT_TTL_HOURS = 12;

function toBase64Url(bytes: ArrayBuffer): string {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function secret(): string {
  return (
    process.env.ADMIN_SESSION_SECRET ||
    process.env.ADMIN_PASSWORD ||
    "rally-board-insecure-dev-secret"
  );
}

async function sign(payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return toBase64Url(sig);
}

/** 文字列の一致判定（比較時間を一定に保つ） */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function adminPasswordConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length > 0);
}

export function verifyPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD ?? "";
  if (!expected) return false;
  return safeEqual(input, expected);
}

export async function createSessionToken(ttlHours = DEFAULT_TTL_HOURS): Promise<string> {
  const expires = Date.now() + ttlHours * 60 * 60 * 1000;
  const payload = String(expires);
  return `${payload}.${await sign(payload)}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const idx = token.lastIndexOf(".");
  if (idx <= 0) return false;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = await sign(payload);
  if (!safeEqual(sig, expected)) return false;
  const expires = Number(payload);
  return Number.isFinite(expires) && expires > Date.now();
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: DEFAULT_TTL_HOURS * 60 * 60,
};
