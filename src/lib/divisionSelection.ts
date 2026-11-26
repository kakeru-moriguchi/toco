"use client";

import type { SelectionScope } from "./tournamentSelection";

export const DIVISION_CHANGE_EVENT = "toco:participant-division-change";
export const ADMIN_DIVISION_CHANGE_EVENT = "toco:admin-division-change";

function key(tournamentId: string, scope: SelectionScope) {
  return `toco_${scope}_division:${tournamentId}`;
}

export function divisionChangeEvent(scope: SelectionScope) {
  return scope === "admin" ? ADMIN_DIVISION_CHANGE_EVENT : DIVISION_CHANGE_EVENT;
}

export function selectedDivisionId(tournamentId: string | null, scope: SelectionScope = "participant"): string | null {
  if (typeof window === "undefined" || !tournamentId) return null;
  return window.localStorage.getItem(key(tournamentId, scope));
}

export function selectDivision(tournamentId: string, divisionId: string, scope: SelectionScope = "participant") {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key(tournamentId, scope), divisionId);
  window.dispatchEvent(new CustomEvent(divisionChangeEvent(scope), { detail: divisionId }));
}
