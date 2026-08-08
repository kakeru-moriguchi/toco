"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { href: "/admin", label: "ホーム" },
  { href: "/admin/tournament", label: "大会情報" },
  { href: "/admin/teams", label: "チーム・リーグ分け" },
  { href: "/admin/matches", label: "対戦・結果" },
  { href: "/admin/schedule", label: "進行表" },
  { href: "/admin/bracket", label: "トーナメント" },
];

export function AdminShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const logout = async () => {
    await fetch("/api/admin/session", { method: "DELETE" });
    router.push("/admin/login");
    router.refresh();
  };

  return (
    <div className="min-h-screen pb-20">
      <header className="bg-court-900 text-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <span className="rounded bg-ball-500 px-2 py-0.5 text-xs font-black text-court-950">管理</span>
          <span className="text-sm font-bold">主催者メニュー</span>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/" className="rounded-lg px-2 py-1.5 text-xs font-bold text-court-100 hover:bg-white/10">
              参加者画面
            </Link>
            <button onClick={logout} className="rounded-lg px-2 py-1.5 text-xs font-bold text-court-100 hover:bg-white/10">
              ログアウト
            </button>
          </div>
        </div>
        <nav className="scroll-x border-t border-white/10">
          <div className="mx-auto flex max-w-5xl gap-1 px-3 py-2">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`shrink-0 rounded-lg px-3 py-2 text-sm font-bold ${
                    active ? "bg-white text-court-900" : "text-court-100 hover:bg-white/10"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5">
        <div className="mb-4">
          <h1 className="text-xl font-black text-court-900">{title}</h1>
          {description && <p className="mt-1 text-sm text-ink-700">{description}</p>}
        </div>
        {children}
      </main>
    </div>
  );
}

/** 保存結果などの一言メッセージ */
export function Toast({ message, tone = "ok" }: { message: string | null; tone?: "ok" | "error" }) {
  if (!message) return null;
  return (
    <div
      className={`fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl px-4 py-3 text-sm font-bold shadow-lg ${
        tone === "ok" ? "bg-court-800 text-white" : "bg-red-600 text-white"
      }`}
      role="status"
    >
      {message}
    </div>
  );
}
