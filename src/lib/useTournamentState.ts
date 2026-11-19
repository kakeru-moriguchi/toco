"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "./supabase";
import type { TournamentState } from "./types";
import {
  selectedTournamentId,
  selectTournament,
  TOURNAMENT_CHANGE_EVENT,
} from "./tournamentSelection";
import { DIVISION_CHANGE_EVENT, selectedDivisionId, selectDivision } from "./divisionSelection";

/**
 * 大会の全状態を取得し、他の端末での更新を自動で反映するフック。
 * ------------------------------------------------------------
 * ・Supabase Realtime で「誰かが結果を入力した」通知を受け取り即再取得
 * ・Realtime が使えない環境でも困らないよう20秒ごとのポーリングを併用
 * ・スマホでアプリに戻ってきた（画面復帰）タイミングでも再取得
 * どの画面もこのフックだけ見ていれば最新になる。
 */
export function useTournamentState() {
  const [state, setState] = useState<TournamentState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const urlTournamentId = new URLSearchParams(window.location.search).get("tournament_id");
      if (urlTournamentId && urlTournamentId !== selectedTournamentId()) selectTournament(urlTournamentId);
      const tournamentId = urlTournamentId || selectedTournamentId();
      const urlDivisionId = new URLSearchParams(window.location.search).get("division_id");
      if (tournamentId && urlDivisionId && urlDivisionId !== selectedDivisionId(tournamentId)) {
        selectDivision(tournamentId, urlDivisionId);
      }
      const divisionId = urlDivisionId || selectedDivisionId(tournamentId);
      const params = new URLSearchParams();
      if (tournamentId) params.set("tournament_id", tournamentId);
      if (divisionId) params.set("division_id", divisionId);
      const query = params.size > 0 ? `?${params.toString()}` : "";
      const res = await fetch(`/api/state${query}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "データを取得できませんでした。");
      setState(json as TournamentState);
      if (!tournamentId && json?.tournament?.id) selectTournament(json.tournament.id);
      if (json?.tournament?.id && !divisionId && json?.division?.id) {
        selectDivision(json.tournament.id, json.division.id);
      }
      setUpdatedAt(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "データを取得できませんでした。");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();

    const client = supabaseBrowser();
    let channel: ReturnType<NonNullable<typeof client>["channel"]> | null = null;
    if (client) {
      channel = client
        .channel("tournament-live")
        .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => refresh())
        .on("postgres_changes", { event: "*", schema: "public", table: "teams" }, () => refresh())
        .on("postgres_changes", { event: "*", schema: "public", table: "leagues" }, () => refresh())
        .on("postgres_changes", { event: "*", schema: "public", table: "tournaments" }, () => refresh())
        .on("postgres_changes", { event: "*", schema: "public", table: "divisions" }, () => refresh())
        .subscribe();
    }

    const timer = setInterval(refresh, 20000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener(TOURNAMENT_CHANGE_EVENT, refresh);
    window.addEventListener(DIVISION_CHANGE_EVENT, refresh);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener(TOURNAMENT_CHANGE_EVENT, refresh);
      window.removeEventListener(DIVISION_CHANGE_EVENT, refresh);
      if (client && channel) client.removeChannel(channel);
    };
  }, [refresh]);

  return { state, error, loading, refresh, updatedAt, setState };
}
