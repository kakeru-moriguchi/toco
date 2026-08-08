"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/admin";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "ログインできませんでした。");
      router.push(next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ログインできませんでした。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
      <div>
        <h1 className="text-xl font-black text-court-900">主催者ログイン</h1>
        <p className="mt-1 text-sm text-ink-700">
          この画面は主催者専用です。参加者はログイン不要でご利用いただけます。
        </p>
      </div>
      <div>
        <label className="label" htmlFor="password">
          管理パスワード
        </label>
        <input
          id="password"
          type="password"
          className="field"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p>}
      <button className="btn-primary w-full" disabled={loading || password.length === 0}>
        {loading ? "確認中…" : "ログイン"}
      </button>
      <Link href="/" className="block text-center text-sm font-bold text-court-700 underline">
        参加者ページへ戻る
      </Link>
    </form>
  );
}

export default function AdminLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Suspense fallback={<div className="card p-6">読み込み中…</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
