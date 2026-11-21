"use client";

import { useEffect } from "react";
import { DivisionFormatEditor } from "@/components/DivisionFormatEditor";
import type { Division, Tournament } from "@/lib/types";

const tiers = [
  { key: "A", name: "上位トーナメント", mode: "top", from_rank: 1, to_rank: 2, bottom_count: 1, format: "bracket", third_place: true },
  { key: "B", name: "下位トーナメント", mode: "rest", from_rank: 3, to_rank: 5, bottom_count: 1, format: "bracket", third_place: false },
] satisfies Tournament["bracket_tiers"];
const tournament = {
  id: "check", name: "表示確認", event_date: null, venue: "", note: "", league_count: 4,
  teams_per_league: 5, point_target: 11, sets_to_win: 2, start_time: "09:00", minutes_per_match: 20,
  courts: ["1", "2", "3", "4"], tiebreakers: ["wins", "diff", "points_for"], bracket_tiers: tiers,
  phase: "setup", archived_at: null, created_at: "", updated_at: "",
} satisfies Tournament;
const division = {
  id: "check", tournament_id: "check", name: "初中級", sort_order: 0, is_active: true,
  league_count: 4, courts: ["1", "2", "3", "4"], bracket_tiers: tiers, finals_enabled: true,
  qualifying_match_order: "toco_5_team", game_labels: ["女子ダブルス", "男子ダブルス", "ミックスダブルス"],
  created_at: "", updated_at: "",
} satisfies Division;

export default function MobileLayoutCheckPage() {
  useEffect(() => {
    [...document.querySelectorAll("button")].find((item) => item.textContent?.includes("大会形式を設定"))?.click();
  }, []);
  return <main className="mx-auto min-h-screen max-w-3xl bg-ball-50 p-3">
    <h1 className="mb-3 text-xl font-black text-court-900">部門管理</h1>
    <section className="card min-w-0 overflow-hidden p-4">
      <h2 className="font-black">初中級</h2>
      <DivisionFormatEditor division={division} tournament={tournament} busy={false} onSave={async () => null} onReset={async () => null} />
    </section>
  </main>;
}
