"use client";

import Link from "next/link";
import { useTournamentState } from "@/lib/useTournamentState";
import { formatDate } from "@/lib/view";

type MenuItem = {
  href: string;
  title: string;
  description: string;
  icon: string;
  accent?: boolean;
};

const MENU: MenuItem[] = [
  {
    href: "/schedule",
    title: "進行表を見る",
    description: "コートごとの試合の順番",
    icon: "clock",
  },
  {
    href: "/standings",
    title: "リーグ表・順位を見る",
    description: "各リーグの勝敗と順位",
    icon: "table",
  },
  {
    href: "/bracket",
    title: "決勝ラウンドを見る",
    description: "トーナメント表・順位別リーグ",
    icon: "trophy",
  },
  {
    href: "/report",
    title: "試合結果を入力する",
    description: "自分の試合を選んでスコアを送信",
    icon: "pencil",
    accent: true,
  },
];

function Icon({ name }: { name: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" {...common}>
      {name === "clock" && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      )}
      {name === "table" && (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 10h18M9 10v10" />
        </>
      )}
      {name === "trophy" && (
        <>
          <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" />
          <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
          <path d="M12 14v4M9 21h6" />
        </>
      )}
      {name === "pencil" && (
        <>
          <path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4z" />
          <path d="M13.5 6.5l4 4" />
        </>
      )}
    </svg>
  );
}

export default function HomePage() {
  const { state, loading } = useTournamentState();
  const tournament = state?.tournament;

  return (
    <div className="min-h-screen pb-16">
      {/* 大会名・開催日・会場 */}
      <header className="bg-court-800 pb-7 pt-8 text-white">
        <div className="mx-auto max-w-3xl px-5">
          <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold tracking-wide">
            <span className="inline-block h-2 w-2 rounded-full bg-ball-400" />
            PICKLEBALL
          </p>
          <h1 className="text-2xl font-black leading-snug sm:text-3xl">
            {loading ? "読み込み中…" : tournament?.name || "大会"}
          </h1>
          <dl className="mt-3 space-y-1 text-sm text-court-100">
            {tournament?.event_date && (
              <div className="flex gap-2">
                <dt className="w-12 shrink-0 text-court-200">開催日</dt>
                <dd className="font-bold text-white">{formatDate(tournament.event_date)}</dd>
              </div>
            )}
            {tournament?.venue && (
              <div className="flex gap-2">
                <dt className="w-12 shrink-0 text-court-200">会場</dt>
                <dd className="font-bold text-white">{tournament.venue}</dd>
              </div>
            )}
          </dl>
        </div>
      </header>

      {/* ヘッダーに重ねず、薄緑の面から始める */}
      <main className="mx-auto max-w-3xl space-y-4 px-4 pt-5">
        {/* 大きなメニューボタン */}
        <nav className="grid gap-3">
          {MENU.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`card flex items-center gap-4 p-5 transition active:scale-[.99] ${
                item.accent ? "bg-ball-500 ring-ball-600/20" : ""
              }`}
            >
              <span
                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${
                  item.accent ? "bg-court-900 text-ball-400" : "bg-court-100 text-court-700"
                }`}
              >
                <Icon name={item.icon} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-black leading-tight text-court-950">{item.title}</span>
                <span className="mt-0.5 block text-sm text-ink-700">{item.description}</span>
              </span>
              <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0 text-court-600" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          ))}
        </nav>

        {tournament?.note && (
          <section className="card p-4">
            <h2 className="mb-2 text-sm font-black text-court-800">お知らせ</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-700">{tournament.note}</p>
          </section>
        )}

        <p className="pt-2 text-center text-xs text-ink-500">
          結果が入力されると、この画面は自動で最新になります。
          <br />
          <Link href="/admin" className="underline">
            主催者の方はこちら
          </Link>
        </p>
      </main>
    </div>
  );
}
