"use client";

export type SelectionScope = "participant" | "admin";
export const TOURNAMENT_STORAGE_KEY = "toco_participant_tournament";
export const TOURNAMENT_CHANGE_EVENT = "toco:participant-tournament-change";
export const ADMIN_TOURNAMENT_CHANGE_EVENT = "toco:admin-tournament-change";

function storageKey(scope: SelectionScope) {
  return scope === "admin" ? "toco_admin_tournament" : TOURNAMENT_STORAGE_KEY;
}

export function tournamentChangeEvent(scope: SelectionScope) {
  return scope === "admin" ? ADMIN_TOURNAMENT_CHANGE_EVENT : TOURNAMENT_CHANGE_EVENT;
}

export function selectedTournamentId(scope: SelectionScope = "participant"): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(storageKey(scope));
}

export function selectTournament(id: string, scope: SelectionScope = "participant") {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(scope), id);
  window.dispatchEvent(new CustomEvent(tournamentChangeEvent(scope), { detail: id }));
}
