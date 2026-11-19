"use client";

export const DIVISION_CHANGE_EVENT = "toco:division-change";

function key(tournamentId: string) {
  return `toco_active_division:${tournamentId}`;
}

export function selectedDivisionId(tournamentId: string | null): string | null {
  if (typeof window === "undefined" || !tournamentId) return null;
  return window.localStorage.getItem(key(tournamentId));
}

export function selectDivision(tournamentId: string, divisionId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key(tournamentId), divisionId);
  window.dispatchEvent(new CustomEvent(DIVISION_CHANGE_EVENT, { detail: divisionId }));
}
