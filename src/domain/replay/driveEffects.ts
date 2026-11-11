import { buildPlayerOwnershipIndex } from "./attribution";
import { lastBoardCheckpointBefore } from "./boardState";
import { recordedMentalEffect } from "./mentalEffects";
import type { ReplayModel } from "./types";

export type DriveEffectExpiry = {
  playerId: string;
  teamId: string;
  providerSkillId: 31 | 51;
  phaseSourceId: string;
  beforeCheckpointAfter: number;
  afterCheckpointAfter: number;
  afterReplayStep: number;
  afterChildIndex: number;
  afterPitchLocation: "on_pitch" | "off_pitch" | "unknown";
  afterRecordedCanAct: boolean | null;
  afterRecordedTackleZone: boolean | null;
};

function number(value: unknown): number | undefined {
  if (typeof value === "string" && /^\d{1,16}$/.test(value))
    value = Number(value);
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}
function firstAtOrAfter<T extends { afterSourceIndex: number }>(
  items: readonly T[],
  index: number
): T | undefined {
  let low = 0,
    high = items.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (items[middle]!.afterSourceIndex < index) low = middle + 1;
    else high = middle;
  }
  return items[low];
}
function lastBefore(items: readonly number[], index: number): number {
  let low = 0,
    high = items.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (items[middle]! < index) low = middle + 1;
    else high = middle;
  }
  return low ? items[low - 1]! : -1;
}

// Confirm only explicitly ended Confused instances immediately before setup,
// with the first following board. Do not infer expiry from omitted effects,
// a touchdown alone, or a convenient later snapshot. Setup flags are raw
// observations, not legal playable-state availability or restored coverage.
export function findDriveEffectExpiries(
  replay: ReplayModel
): Map<string, DriveEffectExpiry> {
  const result = new Map<string, DriveEffectExpiry>();
  if (replay.replayVersion !== "1-4-0-0") return result;
  const owners = buildPlayerOwnershipIndex(replay).playerToTeam;
  const checkpoints = replay.boardCheckpoints ?? [];
  const events = replay.turns.flatMap((t) => t.events);
  const mutations = new Map<string, number[]>();
  for (const event of events)
    if (
      event.playerId &&
      event.sourceIndex !== undefined &&
      [
        "EventBuyMercenary",
        "EventRemoveMercenary",
        "EventAddPlayerEffect",
        "EventEndPlayerEffect",
        "ResultAddPlayerEffect",
        "ResultEndPlayerEffect"
      ].includes(event.sourceTag)
    ) {
      const indices = mutations.get(event.playerId) ?? [];
      indices.push(event.sourceIndex);
      mutations.set(event.playerId, indices);
    }
  const allowedAfterPhase = new Set([
    "EventActiveTimerChanged",
    "EventStartActiveTimer",
    "EventPauseActiveTimer",
    "EventActiveGamerChanged",
    "EventRulesEngineStandBy"
  ]);
  for (let i = 0; i < events.length; i++) {
    const phase = events[i]!;
    if (
      phase.sourceTag !== "EventNewGamePhase" ||
      number(phase.payload?.Phase) !== 3 ||
      !phase.id ||
      phase.sourceIndex === undefined ||
      phase.locator?.replayStep === undefined
    )
      continue;
    const after = firstAtOrAfter(checkpoints, phase.sourceIndex);
    if (
      !after?.board ||
      after.kind !== "board" ||
      after.replayStep !== phase.locator.replayStep ||
      after.childIndex === null ||
      after.board.issues.length ||
      after.board.phaseCode !== 3 ||
      after.board.stable !== true
    )
      continue;
    let boundaryClear = true;
    for (
      let j = i + 1;
      j < events.length && events[j]!.sourceIndex! <= after.afterSourceIndex;
      j++
    )
      if (!allowedAfterPhase.has(events[j]!.sourceTag)) {
        boundaryClear = false;
        break;
      }
    if (!boundaryClear) continue;
    let start = i;
    while (
      start > 0 &&
      events[start - 1]!.sourceTag === "EventEndPlayerEffect" &&
      i - start < 128
    )
      start--;
    if (
      start === i ||
      (start > 0 && events[start - 1]!.sourceTag === "EventEndPlayerEffect")
    )
      continue;
    const seen = new Set<string>();
    const pending: [string, DriveEffectExpiry][] = [];
    for (const end of events.slice(start, i)) {
      const effect = recordedMentalEffect(end.payload?.Effect),
        playerId = end.playerId,
        teamId = playerId ? owners.get(playerId) : undefined;
      const before =
        end.sourceIndex === undefined
          ? undefined
          : lastBoardCheckpointBefore(checkpoints, end.sourceIndex);
      if (
        !effect ||
        !playerId ||
        !teamId ||
        !end.id ||
        end.sourceIndex === undefined ||
        end.locator?.replayStep !== phase.locator.replayStep ||
        seen.has(playerId) ||
        !before?.board ||
        before.board.issues.length ||
        before.board.phaseCode !== 5 ||
        (end.actorTeamId &&
          end.actorTeamSource !== "turn_inferred" &&
          end.actorTeamId !== teamId) ||
        end.attributionConflict
      ) {
        pending.length = 0;
        break;
      }
      seen.add(playerId);
      const oldTeam = before.board.teams.find((t) =>
        t.players.some((p) => String(p.id) === playerId)
      );
      const newTeam = after.board.teams.find((t) =>
        t.players.some((p) => String(p.id) === playerId)
      );
      const old = oldTeam?.players.find((p) => String(p.id) === playerId),
        current = newTeam?.players.find((p) => String(p.id) === playerId);
      const priorMutation = lastBefore(
        mutations.get(playerId) ?? [],
        end.sourceIndex
      );
      const finalMutation = lastBefore(
        mutations.get(playerId) ?? [],
        after.afterSourceIndex + 1
      );
      if (
        !oldTeam ||
        !newTeam ||
        !current ||
        old?.mentalEffect?.providerSkillId !== effect.providerSkillId ||
        current.mentalEffect ||
        oldTeam.rosterIndex !== newTeam.rosterIndex ||
        (oldTeam.explicitTeamId !== null &&
          String(oldTeam.explicitTeamId) !== teamId) ||
        (newTeam.explicitTeamId !== null &&
          String(newTeam.explicitTeamId) !== teamId) ||
        priorMutation > before.afterSourceIndex ||
        finalMutation !== end.sourceIndex
      ) {
        pending.length = 0;
        break;
      }
      pending.push([
        end.id,
        {
          playerId,
          teamId,
          providerSkillId: effect.providerSkillId,
          phaseSourceId: phase.id,
          beforeCheckpointAfter: before.afterSourceIndex,
          afterCheckpointAfter: after.afterSourceIndex,
          afterReplayStep: after.replayStep!,
          afterChildIndex: after.childIndex,
          afterPitchLocation: current.pitchLocation,
          afterRecordedCanAct: current.canAct,
          afterRecordedTackleZone: current.tackleZone
        }
      ]);
    }
    for (const [id, proof] of pending) result.set(id, proof);
  }
  return result;
}
