import { estimateFreshCatchPossession } from "./contextImpact";
import type { ReplayEvent, ReplayModel } from "@/domain/replay/types";
import type { PreRollEvidence } from "@/domain/replay/reconstructContext";
import { numericCheckExclusion } from "./numericCheckContract";
import { bounceDestination } from "@/domain/replay/pickupSuccessors";
import type { LuckEvent } from "./types";

type Cell = { x: number; y: number };
export type BounceCatchReaction = {
  pickupSourceId: string;
  bounceSourceId: string;
  declarationSourceId: string;
  moveOutcomeSourceId: string;
  checkpointAfter: number;
};
const same = (a: Cell | undefined, b: Cell | undefined) =>
  !!a && !!b && a.x === b.x && a.y === b.y;
function cell(value: unknown): Cell | undefined {
  const c = value as { X?: unknown; Y?: unknown } | undefined;
  return typeof c?.X === "number" &&
    Number.isInteger(c.X) &&
    c.X >= 0 &&
    c.X <= 25 &&
    typeof c.Y === "number" &&
    Number.isInteger(c.Y) &&
    c.Y >= 0 &&
    c.Y <= 14
    ? { x: c.X, y: c.Y }
    : undefined;
}
function knownFields(
  p: Record<string, unknown> | undefined,
  keys: readonly string[]
) {
  return !!p && Object.keys(p).every((k) => keys.includes(k));
}
function singleDie(e: ReplayEvent, type: 0 | 1) {
  const dice = e.payload?.Dice as
    { Die?: { DieType?: unknown; Value?: unknown } } | undefined;
  const d = dice?.Die;
  return dice &&
    Object.keys(dice).join() === "Die" &&
    d &&
    !Array.isArray(d) &&
    Object.keys(d).every((k) => k === "DieType" || k === "Value") &&
    d.DieType === type &&
    typeof d.Value === "number" &&
    Number.isInteger(d.Value) &&
    d.Value >= 1 &&
    d.Value <= (type === 0 ? 6 : 8)
    ? d.Value
    : undefined;
}
// Only recorded, unskilled opposing-zone/scatter modifiers are admitted here.
// Unknown optional skills/effects need their own reaction-stage contract.
function ordinaryModifiers(p: Record<string, unknown>) {
  if (p.Modifiers === undefined || p.Modifiers === "") return true;
  const m = p.Modifiers as
    | { Modifier?: Record<string, unknown> | Record<string, unknown>[] }
    | undefined;
  if (!m || Object.keys(m).join() !== "Modifier" || !m.Modifier) return false;
  const nodes = Array.isArray(m.Modifier) ? m.Modifier : [m.Modifier];
  const ids = new Set<string>();
  return (
    nodes.length <= 12 &&
    nodes.every((n) => {
      const key = `${n.ModifierType}:${n.PlayerId}`;
      if (
        !knownFields(n, [
          "PlayerId",
          "Skill",
          "Effect",
          "Value",
          "ModifierType"
        ]) ||
        n.Skill !== -1 ||
        n.Effect !== -1 ||
        n.Value !== -1 ||
        !Number.isInteger(n.PlayerId) ||
        (n.ModifierType === 35
          ? n.PlayerId !== -1
          : n.ModifierType !== 3 || Number(n.PlayerId) < 0) ||
        ids.has(key)
      )
        return false;
      ids.add(key);
      return true;
    })
  );
}
function freshNumeric(e: ReplayEvent, family: 4 | 7, success: boolean) {
  const p = e.payload,
    face = singleDie(e, 0);
  return (
    e.sourceTag === "ResultRoll" &&
    e.rollType === family &&
    e.stepType === (family === 4 ? 1 : 4) &&
    p?.RollType === family &&
    p.Status === 1 &&
    p.NewRoll === 1 &&
    knownFields(p, [
      "Status",
      "Requirement",
      "Dice",
      "Difficulty",
      "RollType",
      "Outcome",
      "NewRoll",
      "Modifiers"
    ]) &&
    typeof p.Requirement === "number" &&
    p.Requirement >= 2 &&
    p.Requirement <= 6 &&
    ordinaryModifiers(p) &&
    !numericCheckExclusion("1-4-0-0", e, false) &&
    face !== undefined &&
    p.Outcome === Number(success) &&
    face >= Number(p.Difficulty) === success &&
    e.stepTag === "PlayerStep" &&
    e.stepActorId === e.playerId &&
    e.stepTargetId === "-1" &&
    e.targetId === "-1" &&
    e.actorTeamSource !== "turn_inferred" &&
    !!e.actorTeamId &&
    !e.attributionConflict &&
    (!e.teamId || e.teamId === e.actorTeamId)
  );
}

// A bounded first-bounce reaction prefix. It never restores a whole board or
// copies the ending turn's availability into the catch's pre-state.
export function findBounceCatchReactions(
  replay: ReplayModel,
  contexts: ReadonlyMap<string, PreRollEvidence>
) {
  const result = new Map<string, BounceCatchReaction>();
  if (replay.replayVersion !== "1-4-0-0") return result;
  for (const turn of replay.turns)
    for (let i = 0; i < turn.events.length - 4; i++) {
      const pickup = turn.events[i]!,
        bounceStep = turn.events[i + 1]!,
        bounce = turn.events[i + 2]!,
        catchStep = turn.events[i + 3]!,
        caught = turn.events[i + 4]!;
      const context = pickup.id ? contexts.get(pickup.id) : undefined,
        geometry = context?.pickupSuccessors;
      if (
        !geometry ||
        !pickup.id ||
        !bounce.id ||
        !caught.id ||
        !freshNumeric(pickup, 4, false) ||
        !freshNumeric(caught, 7, true) ||
        caught.stepType !== 4 ||
        !pickup.sequenceId ||
        [bounceStep, bounce, catchStep, caught].some(
          (e, n) =>
            e.sequenceId !== pickup.sequenceId ||
            e.sourceIndex !== pickup.sourceIndex! + n + 1
        ) ||
        replay.boardCheckpoints?.some(
          (b) =>
            b.afterSourceIndex >= pickup.sourceIndex! &&
            b.afterSourceIndex < caught.sourceIndex!
        )
      )
        continue;
      const p = bounce.payload,
        direction = singleDie(bounce, 1),
        destination = cell(bounceStep.payload?.CellTo);
      if (
        bounceStep.sourceTag !== "BallStep" ||
        bounceStep.stepType !== 3 ||
        bounceStep.payload?.BallId !== 0 ||
        bounceStep.payload.IsEvaluation !== 0 ||
        !knownFields(bounceStep.payload, [
          "IsEvaluation",
          "StepType",
          "CellFrom",
          "CellTo",
          "State",
          "BallId",
          "Probability"
        ]) ||
        !same(cell(bounceStep.payload.CellFrom), geometry.origin) ||
        !destination ||
        !same(bounceDestination(direction!, geometry.origin), destination) ||
        bounce.sourceTag !== "ResultRoll" ||
        bounce.rollType !== 25 ||
        bounce.actionId !== bounceStep.actionId ||
        p?.Status !== 1 ||
        p.NewRoll !== 0 ||
        p.Outcome !== 2 ||
        p.Requirement !== 0 ||
        p.Difficulty !== 0 ||
        !knownFields(p, [
          "Status",
          "Requirement",
          "Dice",
          "Difficulty",
          "RollType",
          "Outcome",
          "NewRoll",
          "Modifiers"
        ]) ||
        (p.Modifiers !== undefined && p.Modifiers !== "")
      )
        continue;
      const branch = geometry.branches.find((b) => b.direction === direction);
      const expectedTeam =
        branch?.kind === "occupied"
          ? branch.rosterIndex === geometry.actorRosterIndex
            ? pickup.actorTeamId
            : replay.teams.find((t) => t.id !== pickup.actorTeamId)?.id
          : undefined;
      if (
        branch?.kind !== "occupied" ||
        branch.playerId !== caught.playerId ||
        expectedTeam !== caught.actorTeamId ||
        !same(branch.destination, destination) ||
        catchStep.sourceTag !== "PlayerStep" ||
        catchStep.stepType !== 4 ||
        catchStep.stepActorId !== caught.playerId ||
        catchStep.actionId !== caught.actionId ||
        catchStep.payload?.StepType !== 4 ||
        String(catchStep.payload.PlayerId) !== caught.playerId ||
        catchStep.payload.TargetId !== -1 ||
        catchStep.payload.Skill !== 0 ||
        catchStep.payload.IsEvaluation !== 0 ||
        !same(cell(catchStep.payload.CellFrom), destination) ||
        !same(cell(catchStep.payload.CellTo), destination) ||
        !knownFields(catchStep.payload, [
          "Probability",
          "PlayerId",
          "TargetId",
          "IsEvaluation",
          "StepType",
          "CellTo",
          "State",
          "CellFrom",
          "Skill"
        ])
      )
        continue;
      const before = replay.boardCheckpoints?.find(
        (b) => b.afterSourceIndex === context!.checkpointAfter
      )?.board;
      const recipient = before?.teams[branch.rosterIndex]?.players.find(
        (p) => String(p.id) === caught.playerId
      );
      if (
        !recipient ||
        recipient.pitchLocation !== "on_pitch" ||
        !same({ x: recipient.cell.x!, y: recipient.cell.y! }, destination) ||
        recipient.mentalEffect ||
        (recipient.statusCode !== null && recipient.statusCode !== 0) ||
        (recipient.situationCode !== null && recipient.situationCode !== 0) ||
        [
          ...(recipient.traits?.innateSkills ?? []),
          ...(recipient.traits?.acquiredSkills ?? [])
        ].some((s) => ![7, 30, 57, 68, 63, 59, 61, 6].includes(s))
      )
        continue;
      result.set(caught.id, {
        pickupSourceId: pickup.id,
        bounceSourceId: bounce.id,
        declarationSourceId: geometry.declarationSourceId,
        moveOutcomeSourceId: geometry.moveOutcomeSourceId,
        checkpointAfter: context!.checkpointAfter
      });
    }
  return result;
}

export function attachBounceCatchReactions(
  proofs: ReadonlyMap<string, BounceCatchReaction>,
  sources: ReadonlyMap<string, LuckEvent>
) {
  for (const [id, proof] of proofs) {
    const caught = sources.get(id),
      pickup = sources.get(proof.pickupSourceId),
      bounce = sources.get(proof.bounceSourceId);
    if (
      caught?.scoringStatus !== "scored" ||
      caught.actualSuccess !== true ||
      caught.metadata.rerollUsed ||
      pickup?.scoringStatus !== "scored" ||
      pickup.actualSuccess !== false ||
      pickup.metadata.pickupBallChain?.bounceSourceIds[0] !==
        proof.bounceSourceId ||
      pickup.metadata.pickupBallChain.catchEventIds[0] !== caught.id ||
      !caught.metadata.ballCatchCell ||
      !bounce?.metadata.ballTravel
    )
      continue;
    caught.metadata.bounceCatchReaction = proof;
    caught.catchPossessionBounds = estimateFreshCatchPossession(
      caught.probabilitySuccess!
    );
  }
}
