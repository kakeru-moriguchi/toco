import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * サーバー専用クライアント（service_role キー）。
 * 書き込みはすべてこのクライアント経由＝API Route の中でしか起きない。
 * 参加者のブラウザにこのキーが渡ることは無い。
 */
let adminClient: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase の環境変数が設定されていません。NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を .env.local に設定してください。"
    );
  }
  adminClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

/**
 * ブラウザ用クライアント（anon キー）。
 * RLS により select しかできない。Realtime の購読にだけ使う。
 */
let browserClient: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient | null {
  if (browserClient) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  browserClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 5 } },
  });
  return browserClient;
}
