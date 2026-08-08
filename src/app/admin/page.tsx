"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AdminShell } from "@/components/AdminShell";
import { useTournamentState } from "@/lib/useTournamentState";
import { formatDate, matchGroupName, sideName, upcomingMatches } from "@/lib/view";
import { LoadingBlock, StatusBadge } from "@/components/ui";

const STEPS = [
  { href: "/admin/tournament", title: "1. 大会情報を設定", body: "大会名・開催日・会場・コート数・順位ルール" },
  { href: "/admin/teams", title: "2. チーム登録とリーグ分け", body: "まとめて登録してA〜Dへ自動振り分け" },
  { href: "/admin/matches", title: "3. 対戦カードを作成", body: "各リーグの総当たり表を自動生成" },
  { href: "/admin/schedule", title: "4. 進行表を整える", body: "試合時間・コート・順番の調整" },
  { href: "/admin/bracket", title: "5. 決勝トーナメント作成", body: "予選順位から自動で組み合わせ" },
];

export default function AdminHomePage() {
  const { state, loading } = useTournamentState();

  const stats = useMemo(() => {
    if (!state) return null;
    const league = state.matches.filter((m) => m.stage === "league");
    const bracket = state.matches.filter((m) => m.stage === "bracket");
    return {
      teams: state.teams.length,
      unassigned: state.teams.filter((t) => !t.league_id).length,
      leagueDone: league.filter((m) => m.status === "done").length,
      leagueTotal: league.length,
      bracketDone: bracket.filter((m) => m.status === "done").length,
      bracketTotal: bracket.length,
    };
  }, [state]);

  return (
    <AdminShell title="大会運営ホーム" description="準備から当日運営までの入口です。">
      {loading && !state && <LoadingBlock />}

      {state && stats && (
        <div className="space-y-4">
          <section className="card p-4">
            <p className="text-xs font-bold text-ink-500">開催中の大会</p>
            <h2 className="text-lg font-black text-court-900">{state.tournament.name}</h2>
            <p className="text-sm text-ink-700">
              {formatDate(state.tournament.event_date)} {state.tournament.venue}
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-court-50 p-3">
                <p className="text-xs font-bold text-ink-500">チーム</p>
                <p className="text-xl font-black tabular-nums text-court-900">{stats.teams}</p>
              </div>
              <div className="rounded-xl bg-court-50 p-3">
                <p className="text-xs font-bold text-ink-500">予選</p>
                <p className="text-xl font-black tabular-nums text-court-900">
                  {stats.leagueDone}
                  <span className="text-sm text-ink-500">/{stats.leagueTotal}</span>
                </p>
              </div>
              <div className="rounded-xl bg-court-50 p-3">
                <p className="text-xs font-bold text-ink-500">決勝T</p>
                <p className="text-xl font-black tabular-nums text-court-900">
                  {stats.bracketDone}
                  <span className="text-sm text-ink-500">/{stats.bracketTotal}</span>
                </p>
              </div>
            </div>
            {stats.unassigned > 0 && (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
                リーグ未設定のチームが {stats.unassigned} 組あります。
              </p>
            )}
          </section>

          <section className="card p-4">
            <h2 className="mb-2 text-sm font-black text-court-800">進行中・次の試合</h2>
            <ul className="space-y-2">
              {upcomingMatches(state.matches, 4).map((m) => (
                <li key={m.id} className="flex items-center gap-2 rounded-xl bg-court-50 p-3 text-sm">
                  <span className="w-12 shrink-0 text-xs font-bold tabular-nums text-court-700">
                    {m.scheduled_at || "--:--"}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-bold">
                    {sideName(m, "a", state.teams)} vs {sideName(m, "b", state.teams)}
                  </span>
                  <span className="hidden shrink-0 text-xs text-ink-500 sm:inline">
                    {matchGroupName(m, state)}
                  </span>
                  <StatusBadge status={m.status} />
                </li>
              ))}
              {upcomingMatches(state.matches, 1).length === 0 && (
                <li className="py-3 text-center text-sm text-ink-500">未消化の試合はありません。</li>
              )}
            </ul>
          </section>

          <section className="grid gap-2 sm:grid-cols-2">
            {STEPS.map((s) => (
              <Link key={s.href} href={s.href} className="card flex items-center gap-3 p-4 active:scale-[.99]">
                <div className="min-w-0 flex-1">
                  <p className="font-black text-court-900">{s.title}</p>
                  <p className="text-sm text-ink-700">{s.body}</p>
                </div>
                <span className="text-court-500">›</span>
              </Link>
            ))}
            <Link href="/standings" className="card flex items-center gap-3 p-4 active:scale-[.99]">
              <div className="min-w-0 flex-1">
                <p className="font-black text-court-900">リーグ順位を確認</p>
                <p className="text-sm text-ink-700">参加者と同じ順位表を表示</p>
              </div>
              <span className="text-court-500">›</span>
            </Link>
          </section>
        </div>
      )}
    </AdminShell>
  );
}
