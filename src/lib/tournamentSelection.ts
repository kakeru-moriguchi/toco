"use client";

export const TOURNAMENT_STORAGE_KEY = "toco_active_tournament";
export const TOURNAMENT_CHANGE_EVENT = "toco:tournament-change";

export function selectedTournamentId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOURNAMENT_STORAGE_KEY);
}

export function selectTournament(id: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOURNAMENT_STORAGE_KEY, id);
  window.dispatchEvent(new CustomEvent(TOURNAMENT_CHANGE_EVENT, { detail: id }));
}
