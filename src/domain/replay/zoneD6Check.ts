import type { ReplayEvent } from "./types";
import { unmodifiedD6Check } from "./numericCheck";
import type { ObservedBoard } from "./boardState";

export type RecordedZoneCheck = {
  threshold: number;
  baseTarget: number;
  markerPlayerIds: string[];
};
// Actual recorded fixed opposing-zone penalties only. This does not determine
// unchosen skill eligibility or extrapolate natural-roll edge rules.
export function recordedZoneD6Check(
  event: ReplayEvent,
  family: 2 | 4,
  status: 1 | 2,
  success: boolean
): RecordedZoneCheck | undefined {
  const ordinary = unmodifiedD6Check(event, family, status, success);
  if (ordinary)
    return { threshold: ordinary, baseTarget: ordinary, markerPlayerIds: [] };
  const p = event.payload,
    container = p?.Modifiers as Record<string, unknown> | undefined;
  if (
    !p ||
    !container ||
    typeof container !== "object" ||
    Array.isArray(container) ||
    Object.keys(container).join() !== "Modifier"
  )
    return;
  const nodes = Array.isArray(container.Modifier)
    ? container.Modifier
    : [container.Modifier];
  if (!nodes.length || nodes.length > 8) return;
  const markers: string[] = [];
  for (const node of nodes) {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    const m = node as Record<string, unknown>;
    if (
      Object.keys(m).length !== 5 ||
      Object.keys(m).some(
        (k) =>
          !["PlayerId", "Skill", "Effect", "Value", "ModifierType"].includes(k)
      )
    )
      return;
    if (
      !Number.isSafeInteger(m.PlayerId) ||
      Number(m.PlayerId) < 0 ||
      m.Skill !== -1 ||
      m.Effect !== -1 ||
      m.Value !== -1 ||
      m.ModifierType !== 3
    )
      return;
    markers.push(String(m.PlayerId));
  }
  if (
    new Set(markers).size !== markers.length ||
    !Number.isInteger(p?.Requirement) ||
    Number(p?.Requirement) < 2 ||
    Number(p?.Requirement) > 6 ||
    p.Difficulty !== Number(p.Requirement) + markers.length
  )
    return;
  // Adapter for the strict die/status/freshness/field validator; raw source
  // data is never changed or relabeled in the replay/report.
  const threshold = unmodifiedD6Check(
    { ...event, payload: { ...p, Modifiers: "", Requirement: p.Difficulty } },
    family,
    status,
    success
  );
  return threshold
    ? {
        threshold,
        baseTarget: Number(p!.Requirement),
        markerPlayerIds: markers
      }
    : undefined;
}

export function observedZoneMarkers(
  board: ObservedBoard,
  actorId: string,
  ownerIndex: number,
  check: RecordedZoneCheck,
  destination: { x: number; y: number }
) {
  const markers: { playerId: string; cell: { x: number; y: number } }[] = [];
  for (const playerId of check.markerPlayerIds) {
    const owners = board.teams.filter((t) =>
      t.players.some((p) => String(p.id) === playerId)
    );
    const owner = owners[0],
      p = owner?.players.find((p) => String(p.id) === playerId);
    if (
      playerId === actorId ||
      owners.length !== 1 ||
      owner?.rosterIndex === ownerIndex ||
      !p ||
      p.pitchLocation !== "on_pitch" ||
      p.cell.x === null ||
      p.cell.y === null ||
      p.tackleZone === false ||
      p.mentalEffect ||
      (p.statusCode !== null && p.statusCode !== 0) ||
      (p.situationCode !== null && p.situationCode !== 0) ||
      Math.max(
        Math.abs(p.cell.x - destination.x),
        Math.abs(p.cell.y - destination.y)
      ) !== 1
    )
      return;
    markers.push({ playerId, cell: { x: p.cell.x, y: p.cell.y } });
  }
  return markers;
}
