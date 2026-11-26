"use client";

import { selectDivision } from "@/lib/divisionSelection";
import type { Division } from "@/lib/types";

export function ParticipantDivisionSelector({
  tournamentId,
  divisions,
  divisionId,
}: {
  tournamentId: string;
  divisions: Division[];
  divisionId: string;
}) {
  const active = divisions.filter((division) => division.is_active && division.is_public);
  if (active.length < 2) return null;

  return (
    <label className="card mb-4 block p-3 text-xs font-black text-court-800">
      閲覧する部門
      <select
        className="field mt-1"
        value={divisionId}
        onChange={(event) => selectDivision(tournamentId, event.target.value, "participant")}
      >
        {active.map((division) => (
          <option key={division.id} value={division.id}>
            {division.name}
          </option>
        ))}
      </select>
    </label>
  );
}
