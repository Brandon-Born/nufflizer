import {
  lastBoardCheckpointBefore,
  type ReplayBoardCheckpoint
} from "@/domain/replay/boardState";
import { unmodifiedD6Check } from "@/domain/replay/numericCheck";
import {
  failedMovementOffer,
  sameMovementActor
} from "@/domain/replay/teamRerollMovement";
import type { ReplayEvent } from "@/domain/replay/types";
import { observedBounceDirection } from "./ballConsequences";
import type { LuckEvent, LuckReport } from "./types";

type Cell = { x: number; y: number };
type BallLeg = { sourceId: string; from: Cell; to: Cell };
export const MAX_FALL_BALL_LEGS = 8;

function ballCell(value: unknown): Cell | undefined {
  const point = value as { X?: number; Y?: number } | undefined;
  if (
    Number.isInteger(point?.X) &&
    point!.X! >= -1 &&
    point!.X! <= 26 &&
    Number.isInteger(point?.Y) &&
    point!.Y! >= -1 &&
    point!.Y! <= 15
  )
    return { x: point!.X!, y: point!.Y! };
}

const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;
const onPitch = ({ x, y }: Cell) => x >= 0 && x <= 25 && y >= 0 && y <= 14;

function validLeg(
  leg: BallLeg,
  type: number | undefined,
  faces: readonly number[],
  types: readonly number[]
) {
  if (type === 25)
    return (
      onPitch(leg.from) &&
      faces.length === 1 &&
      types.length === 1 &&
      types[0] === 1 &&
      observedBounceDirection(faces[0], leg.from, leg.to)
    );
  return (
    type === 9 &&
    !onPitch(leg.from) &&
    !same(leg.from, leg.to) &&
    faces.length === 3 &&
    types.length === 3 &&
    types.every((die) => die === 0) &&
    faces.every((face) => Number.isInteger(face) && face >= 1 && face <= 6)
  );
}

export function isFallBallRoll(event?: ReplayEvent) {
  return (
    event?.sourceTag === "ResultRoll" &&
    (event.rollType === 25 || event.rollType === 9)
  );
}

export function observedRushFallBallPath(
  raw: readonly ReplayEvent[],
  damageIndex: number,
  start: number,
  checkpoints: readonly ReplayBoardCheckpoint[]
) {
  const damage = raw[damageIndex]!,
    step = raw[damageIndex - 5];
  const roll = raw[damageIndex - 3],
    choice = raw[damageIndex - 4];
  const original = raw[damageIndex - 7],
    originalStep = raw[damageIndex - 8];
  const offer = original && failedMovementOffer(original);
  const from = ballCell(step?.payload?.CellFrom),
    to = ballCell(step?.payload?.CellTo);
  if (
    !step ||
    !roll ||
    !choice ||
    !original ||
    !originalStep ||
    !from ||
    !to ||
    (to.x !== 0 && to.x !== 25) ||
    !onPitch(from) ||
    !onPitch(to) ||
    unmodifiedD6Check(roll, 1, 2, false) !== 2 ||
    !sameMovementActor(original, roll) ||
    !sameMovementActor(choice, roll) ||
    offer?.family !== 1 ||
    offer.threshold !== 2 ||
    original.payload?.CanUseProReroll !== 0 ||
    choice.sourceTag !== "ResultTeamRerollUsage" ||
    choice.payload?.Used !== 1 ||
    choice.payload.GamerId !== original.payload.GamerId ||
    original.sourceIndex !== (roll.sourceIndex ?? 0) - 4 ||
    originalStep.sourceTag !== "PlayerStep" ||
    originalStep.actionId !== original.actionId ||
    originalStep.payload?.Skill !== 0 ||
    originalStep.payload?.IsEvaluation !== 0 ||
    step.payload?.Skill !== 0 ||
    step.sourceIndex === undefined ||
    raw[damageIndex - 6]?.checkpointCarrier !== true ||
    raw[damageIndex - 6]?.playerId !== roll.playerId
  )
    return;
  const originalFrom = ballCell(originalStep.payload.CellFrom);
  const originalTo = ballCell(originalStep.payload.CellTo);
  if (
    !originalFrom ||
    !originalTo ||
    !same(originalFrom, from) ||
    !same(originalTo, to)
  )
    return;

  const waiting = lastBoardCheckpointBefore(checkpoints, step.sourceIndex);
  const board = waiting?.board,
    actor = Number(roll.playerId);
  if (
    !waiting ||
    !board ||
    waiting.afterSourceIndex !== original.sourceIndex ||
    waiting.kind !== "board" ||
    board.phaseCode !== 5 ||
    board.issues.length ||
    checkpoints[0]?.kind !== "initial" ||
    checkpoints[0].board?.pitchLayout !== "standard" ||
    board.standardPitchCompatible !== true ||
    board.activePlayerId !== actor ||
    board.ball.possession !== "held" ||
    board.ball.carrierId !== actor ||
    board.ball.cell.x !== from.x ||
    board.ball.cell.y !== from.y
  )
    return;
  const owner = board.teams.find(
    (team) => team.rosterIndex === board.ball.holderRosterIndex
  );
  const carrier = owner?.players.find((player) => player.id === actor);
  if (
    !owner ||
    !carrier ||
    carrier.cell.x !== from.x ||
    carrier.cell.y !== from.y ||
    owner.rosterIndex !== choice.payload.GamerId ||
    (board.activeTeamIndex !== null &&
      board.activeTeamIndex !== owner.rosterIndex) ||
    (owner.sideCode === 32 ? to.x !== 25 : owner.sideCode !== 64 || to.x !== 0)
  )
    return;

  const legs: BallLeg[] = [];
  let expectedStart = to;
  for (let i = start; i < raw.length - 1; i += 2) {
    const header = raw[i],
      die = raw[i + 1];
    const origin = ballCell(header?.payload?.CellFrom),
      destination = ballCell(header?.payload?.CellTo);
    const dice = (die?.payload?.Dice as { Die?: unknown } | undefined)?.Die;
    const items = (Array.isArray(dice) ? dice : [dice]) as (
      { DieType: number; Value: number } | undefined
    )[];
    if (
      !header ||
      !die?.id ||
      !origin ||
      !destination ||
      !same(origin, expectedStart) ||
      header.sourceTag !== "BallStep" ||
      header.stepType !== 3 ||
      header.payload?.BallId !== 0 ||
      header.payload.IsEvaluation !== 0 ||
      header.sequenceId !== damage.sequenceId ||
      header.locator?.stepIndex !==
        (damage.locator?.stepIndex ?? -1) + legs.length + 1 ||
      !isFallBallRoll(die) ||
      die.actionId !== header.actionId ||
      die.sequenceId !== header.sequenceId ||
      die.sourceIndex !== (header.sourceIndex ?? -2) + 1 ||
      die.locator?.messageIndex !== 0 ||
      die.payload?.Status !== 1 ||
      die.payload.NewRoll !== 0 ||
      die.payload.Outcome !== 2 ||
      die.payload.Requirement !== 0 ||
      die.payload.Difficulty !== 0 ||
      die.payload.Modifiers !== ""
    )
      return;
    const leg = { sourceId: die.id, from: origin, to: destination };
    if (
      !validLeg(
        leg,
        die.rollType,
        items.map((item) => item?.Value ?? 0),
        items.map((item) => item?.DieType ?? -1)
      )
    )
      return;
    legs.push(leg);
    expectedStart = destination;
  }
  if (legs.length < 3 || onPitch(legs[0]!.to) || !onPitch(legs.at(-1)!.to))
    return;
  return { waitingCheckpointAfter: waiting.afterSourceIndex, legs };
}

export function validReportedMovementFallTail(
  event: LuckEvent,
  report: LuckReport,
  sources: ReadonlyMap<string, LuckEvent>,
  damageEvents: readonly LuckEvent[]
) {
  const m = event.metadata,
    fall = m.movementFall,
    path = fall?.ballPath;
  if (!fall) return false;
  const damageEnd = damageEvents.reduce(
    (last, row) => Math.max(last, row.metadata.sourceIndex ?? -1),
    -1
  );
  if (!path) return fall.turnoverSourceIndex === damageEnd + 1;
  const first = path.legs[0]!,
    last = path.legs.at(-1)!;
  const decision = report.rerollResources.decisions.find(
    (row) => row.decisionSourceId === m.rerollDecisionId
  );
  if (
    m.rollType !== 1 ||
    m.stepType !== 1 ||
    m.difficulty !== 2 ||
    m.requirement !== 2 ||
    m.rerollResource !== "team" ||
    m.rerollUsed !== true ||
    m.teamRerollsSpent !== 1 ||
    m.lonerGate ||
    m.proGate ||
    m.rerollSkill ||
    m.rerollDraws?.initialFace !== 1 ||
    m.dice?.length !== 1 ||
    m.dice[0] !== 1 ||
    decision?.namespace?.basis !== "observed_roster" ||
    decision.namespace.checkpointAfter !== path.waitingCheckpointAfter ||
    decision.namespace.actorPlayerId !== event.playerId ||
    decision.teamId !== event.teamId ||
    decision.status !== "linked" ||
    path.waitingCheckpointAfter !== (m.sourceIndex ?? 0) - 4 ||
    (first.from.x !== 0 && first.from.x !== 25) ||
    !onPitch(first.from) ||
    onPitch(first.to) ||
    !onPitch(last.to)
  )
    return false;
  return (
    fall.turnoverSourceIndex === damageEnd + path.legs.length * 2 + 1 &&
    path.legs.every((leg, i) => {
      const row = sources.get(leg.sourceId),
        meta = row?.metadata;
      return (
        row?.scoringStatus === "excluded" &&
        meta?.sourceTag === "ResultRoll" &&
        meta.sourceIndex === damageEnd + (i + 1) * 2 &&
        meta.sequenceId === m.sequenceId &&
        meta.locator?.replayStep === m.locator?.replayStep &&
        meta.locator?.childIndex === m.locator?.childIndex &&
        meta.locator?.stepIndex === (m.locator?.stepIndex ?? -1) + 2 + i &&
        meta.locator?.messageIndex === 0 &&
        (i === 0 || same(path.legs[i - 1]!.to, leg.from)) &&
        validLeg(leg, meta.rollType, meta.dice ?? [], meta.dieTypes ?? [])
      );
    })
  );
}
