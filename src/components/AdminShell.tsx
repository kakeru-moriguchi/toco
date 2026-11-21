"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { selectTournament, selectedTournamentId } from "@/lib/tournamentSelection";
import { DIVISION_CHANGE_EVENT, selectDivision, selectedDivisionId } from "@/lib/divisionSelection";
import type { Division, TournamentSummary } from "@/lib/types";

const NAV = [
  { href: "/admin", label: "ホーム" },
  { href: "/admin/tournaments", label: "大会一覧" },
  { href: "/admin/divisions", label: "部門" },
  { href: "/admin/tournament", label: "大会情報" },
  { href: "/admin/teams", label: "チーム・リーグ分け" },
  { href: "/admin/matches", label: "対戦・結果" },
  { href: "/admin/schedule", label: "進行表" },
  { href: "/admin/bracket", label: "決勝ラウンド" },
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
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([]);
  const [activeTournamentId, setActiveTournamentId] = useState("");
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [activeDivisionId, setActiveDivisionId] = useState("");

  const loadDivisions = useCallback(async (tournamentId: string) => {
    const res = await fetch("/api/admin/divisions", {
      cache: "no-store",
      headers: { "X-Tournament-Id": tournamentId },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error ?? "部門一覧を取得できませんでした。");
    const active = ((json.divisions ?? []) as Division[]).filter((item) => item.is_active);
    setDivisions(active);
    const selected = selectedDivisionId(tournamentId);
    const next = active.find((item) => item.id === selected) ?? active[0];
    if (next) {
      if (selected !== next.id) selectDivision(tournamentId, next.id);
      setActiveDivisionId(next.id);
    } else {
      setActiveDivisionId("");
    }
  }, []);

  useEffect(() => {
    setActiveTournamentId(selectedTournamentId() ?? "");
    fetch("/api/admin/tournaments", { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "大会一覧を取得できませんでした。");
        return (json.tournaments ?? []) as TournamentSummary[];
      })
      .then((items) => {
        const active = items.filter((item) => !item.archived_at);
        setTournaments(active);
        const selected = selectedTournamentId();
        if ((!selected || !active.some((item) => item.id === selected)) && active[0]) {
          selectTournament(active[0].id);
          setActiveTournamentId(active[0].id);
        }
      })
      .catch(() => setTournaments([]));
  }, []);

  useEffect(() => {
    if (!activeTournamentId) return;
    loadDivisions(activeTournamentId)
      .catch(() => setDivisions([]));
  }, [activeTournamentId, loadDivisions]);

  useEffect(() => {
    const onDivisionChange = () => {
      if (!activeTournamentId) return;
      setActiveDivisionId(selectedDivisionId(activeTournamentId) ?? "");
      loadDivisions(activeTournamentId).catch(() => setDivisions([]));
    };
    window.addEventListener(DIVISION_CHANGE_EVENT, onDivisionChange);
    return () => window.removeEventListener(DIVISION_CHANGE_EVENT, onDivisionChange);
  }, [activeTournamentId, loadDivisions]);

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
            <Link href={activeTournamentId ? `/?tournament_id=${activeTournamentId}${activeDivisionId ? `&division_id=${activeDivisionId}` : ""}` : "/"} className="flex min-h-10 items-center rounded-lg px-3 text-xs font-bold text-court-100 hover:bg-white/10">
              参加者画面
            </Link>
            <button onClick={logout} className="min-h-10 rounded-lg px-3 text-xs font-bold text-court-100 hover:bg-white/10">
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
                  className={`flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm font-bold ${
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
        {tournaments.length > 0 && (
          <div className="mb-4">
            <label className="label" htmlFor="admin-tournament-selector">管理する大会</label>
            <select
              id="admin-tournament-selector"
              className="field"
              value={activeTournamentId}
              onChange={(e) => {
                selectTournament(e.target.value);
                setActiveTournamentId(e.target.value);
                setActiveDivisionId("");
                router.refresh();
              }}
            >
              {tournaments.map((tournament) => (
                <option key={tournament.id} value={tournament.id}>{tournament.name}</option>
              ))}
            </select>
          </div>
        )}
        {divisions.length > 0 && (
          <div className="mb-4">
            <label className="label" htmlFor="admin-division-selector">管理する部門</label>
            <select
              id="admin-division-selector"
              className="field"
              value={activeDivisionId}
              onChange={(e) => {
                selectDivision(activeTournamentId, e.target.value);
                setActiveDivisionId(e.target.value);
                router.refresh();
              }}
            >
              {divisions.map((division) => (
                <option key={division.id} value={division.id}>{division.name}</option>
              ))}
            </select>
          </div>
        )}
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
