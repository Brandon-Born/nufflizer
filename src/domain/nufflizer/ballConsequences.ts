import type { ReplayEvent, ReplayTurn } from "@/domain/replay/types";
import type { LuckEvent } from "./types";

type Cell = { x: number; y: number };
import { bounceDestination } from "@/domain/replay/pickupSuccessors";
export function observedBounceDirection(direction:number|undefined,from:Cell,to:Cell) {
  const expected=bounceDestination(Number(direction),from);
  return expected?.x === to.x && expected?.y === to.y;
}
function cell(value: unknown): Cell | undefined {
  const raw = value as { X?: unknown; Y?: unknown } | undefined;
  return typeof raw?.X === "number" &&
    Number.isInteger(raw.X) &&
    raw.X >= 0 &&
    raw.X <= 25 &&
    typeof raw.Y === "number" &&
    Number.isInteger(raw.Y) &&
    raw.Y >= 0 &&
    raw.Y <= 14
    ? { x: raw.X, y: raw.Y }
    : undefined;
}
function same(a: Cell | undefined, b: Cell | undefined) {
  return a !== undefined && b !== undefined && a.x === b.x && a.y === b.y;
}

export function bounceAt(events: readonly ReplayEvent[], index: number, from: Cell) {
  const step = events[index],
    roll = events[index + 1];
  const start = cell(step?.payload?.CellFrom),
    to = cell(step?.payload?.CellTo);
  const die = (
    roll?.payload?.Dice as
      { Die?: { DieType?: number; Value?: number } } | undefined
  )?.Die;
  if (
    step?.sourceTag !== "BallStep" ||
    step.stepType !== 3 ||
    step.payload?.IsEvaluation !== 0 ||
    step.payload.BallId !== 0 ||
    !step.actionId ||
    step.locator?.stepIndex === undefined ||
    !roll?.id ||
    roll.sourceTag !== "ResultRoll" ||
    roll.rollType !== 25 ||
    roll.actionId !== step.actionId ||
    roll.payload?.Status !== 1 ||
    roll.payload.NewRoll !== 0 ||
    roll.payload.Outcome !== 2 ||
    die?.DieType !== 1 ||
    !Number.isInteger(die.Value) ||
    die.Value! < 1 ||
    die.Value! > 8 ||
    !same(from, start) ||
    !to ||
    !observedBounceDirection(die.Value, from, to)
  )
    return;
  return { step, roll, from, to };
}

// These are observed causal branches, not a value model or possession simulator.
// Each subtotal references already-scored checks. D8 directions add no score.
export function linkPickupBallConsequences(
  turn: ReplayTurn,
  reported: ReadonlyMap<string, LuckEvent>
) {
  const raw = turn.events;
  const indices = new Map(
    raw.flatMap((e, i) => (e.id ? [[e.id, i] as const] : []))
  );
  const steps = new Map<string, ReplayEvent>();
  const ambiguousSteps = new Set<string>();
  for (const event of raw)
    if (event.sourceTag === "PlayerStep" && event.actionId) {
      if (steps.has(event.actionId)) ambiguousSteps.add(event.actionId);
      steps.set(event.actionId, event);
    }
  const terminalByQuestion = new Map<string, LuckEvent>();
  for (const source of raw) {
    const event = source.id ? reported.get(source.id) : undefined;
    if (event?.metadata.rerollQuestionId && event.scoringStatus === "scored")
      terminalByQuestion.set(event.metadata.rerollQuestionId, event);
  }

  for (const [index, event] of raw.entries()) {
    const pickup = event.id ? reported.get(event.id) : undefined;
    if (
      !pickup ||
      pickup.metadata.rollType !== 4 ||
      pickup.scoringStatus !== "scored" ||
      pickup.actualSuccess !== false ||
      !pickup.playerId ||
      !event.actionId ||
      ambiguousSteps.has(event.actionId)
    )
      continue;
    const step = steps.get(event.actionId);
    const start = cell(step?.payload?.CellTo);
    if (
      step?.stepType !== 1 ||
      step.payload?.IsEvaluation !== 0 ||
      step.stepActorId !== pickup.playerId ||
      !start
    )
      continue;
    const first = bounceAt(raw, index + 1, start);
    if (
      !first ||
      first.step.sequenceId !== step.sequenceId ||
      first.step.locator?.stepIndex !== (step.locator?.stepIndex ?? -2) + 1
    )
      continue;
    const bounceSourceIds: string[] = [],
      catchEventIds: string[] = [];
    const diceByTeam: Record<string, number> = {
      [pickup.teamId]: pickup.weightedDelta
    };
    let next = index + 1,
      from = start;
    for (let count = 0; count < 16; count++) {
      const bounce = bounceAt(raw, next, from);
      if (!bounce) break;
      const direction = reported.get(bounce.roll.id!);
      if (!direction || direction.scoringStatus !== "excluded") break;
      direction.metadata.ballTravel = { from: bounce.from, to: bounce.to };
      bounceSourceIds.push(bounce.roll.id!);
      from = bounce.to;
      const catchStep = raw[next + 2],
        catchRaw = raw[next + 3];
      if (
        catchStep?.sourceTag !== "PlayerStep" ||
        catchStep.stepType !== 4 ||
        catchStep.payload?.IsEvaluation !== 0 ||
        catchStep.attributionConflict ||
        !same(cell(catchStep.payload.CellFrom), from) ||
        !same(cell(catchStep.payload.CellTo), from) ||
        catchStep.sequenceId !== bounce.step.sequenceId ||
        catchStep.locator?.stepIndex !== bounce.step.locator!.stepIndex! + 1 ||
        !catchRaw?.id ||
        catchRaw.actionId !== catchStep.actionId
      )
        break;
      let caught = reported.get(catchRaw.id);
      if (caught?.scoringStatus !== "scored")
        caught = terminalByQuestion.get(catchRaw.id);
      if (
        !caught ||
        caught.scoringStatus !== "scored" ||
        caught.metadata.rollType !== 7 ||
        caught.playerId !== catchStep.stepActorId ||
        caught.actualSuccess === null
      )
        break;
      const final = caught.metadata.sourceId
        ? indices.get(caught.metadata.sourceId)
        : undefined;
      if (
        final === undefined ||
        final < next + 3 ||
        catchEventIds.includes(caught.id)
      )
        break;
      catchEventIds.push(caught.id);
      caught.metadata.ballCatchCell = from;
      diceByTeam[caught.teamId] =
        (diceByTeam[caught.teamId] ?? 0) + caught.weightedDelta;
      if (caught.actualSuccess) break;
      const following = raw[final + 1];
      if (
        following?.sequenceId !== raw[final]?.sequenceId ||
        following?.locator?.stepIndex !==
          (raw[final]?.locator?.stepIndex ?? -2) + 1
      )
        break;
      next = final + 1;
    }
    if (bounceSourceIds.length)
      pickup.metadata.pickupBallChain = {
        bounceSourceIds,
        catchEventIds,
        diceByTeam,
        endingCell: from
      };
  }
}
