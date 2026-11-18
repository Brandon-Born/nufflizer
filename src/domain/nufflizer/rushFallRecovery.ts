import type {
  ObservedBoard,
  ReplayBoardCheckpoint
} from "@/domain/replay/boardState";
import type { ReplayEvent } from "@/domain/replay/types";
import { observedActorRoster } from "@/domain/replay/observedActorRoster";
import { unmodifiedD6Check } from "@/domain/replay/numericCheck";
import { plainPickupMoveOutcome } from "@/domain/replay/pickupSuccessors";
import type { LuckEvent, LuckReport } from "./types";

type MovementFall = NonNullable<LuckEvent["metadata"]["movementFall"]>;
type Loose = Extract<
  NonNullable<NonNullable<MovementFall["ballPath"]>["aftermath"]>,
  { status: "loose" }
>;
type Recovery = NonNullable<Loose["recovery"]>;
type Cell = { x: number; y: number };
const MAX_BRIDGE = 256;
const MAX_CARRY = 8;
const controls = new Set([
  "EventRulesEngineStandBy",
  "EventGamersAreReady",
  "EventStartActiveTimer",
  "EventActiveGamerChanged",
  "EventPauseActiveTimer",
  "EventActiveTimerChanged"
]);
type RawIndex = ReadonlyMap<number, ReplayEvent>;

function readCell(value: unknown): Cell | undefined {
  const c = value as { X?: number; Y?: number } | undefined;
  if (
    Number.isInteger(c?.X) &&
    Number.isInteger(c?.Y) &&
    c!.X! >= 0 &&
    c!.X! <= 25 &&
    c!.Y! >= 0 &&
    c!.Y! <= 14
  )
    return { x: c!.X!, y: c!.Y! };
}
const same = (a: { x: number | null; y: number | null } | undefined, b: Cell) =>
  a?.x === b.x && a.y === b.y;
const adjacent = (a: Cell, b: Cell) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) === 1;
const offerType = (event?: ReplayEvent) =>
  (event?.payload?.RollInfos as { RollType?: number } | undefined)?.RollType;
const sameStep = (a: ReplayEvent, b?: ReplayEvent) =>
  !!b &&
  a.actionId !== undefined &&
  b.actionId === a.actionId &&
  b.sequenceId === a.sequenceId &&
  b.playerId === a.playerId;
const emptyMove = (step: ReplayEvent, move?: ReplayEvent) =>
  move?.sourceTag === "ResultDoMove" &&
  sameStep(step, move) &&
  Object.keys(move.payload ?? {}).length === 0;
const ordinaryStep = (step: ReplayEvent | undefined) =>
  step?.sourceTag === "PlayerStep" &&
  step.stepType === 1 &&
  step.payload?.IsEvaluation === 0 &&
  step.payload.Skill === 0 &&
  !step.attributionConflict;

// The bomb is a separate object. Qualify the known successful throw, failed
// interception, explosion-linked catch and armor aftermath as one window.
// A regular-ball bounce or any other unrecognized action interrupts it.
function bombWindow(
  raw: RawIndex,
  declaration: ReplayEvent,
  reported: ReadonlyMap<string | undefined, LuckEvent>
) {
  const index = declaration.sourceIndex!;
  const throwStep = raw.get(index + 1),
    pass = raw.get(index + 2),
    question = raw.get(index + 3);
  if (
    throwStep?.sourceTag !== "PlayerStep" ||
    throwStep.stepType !== 32 ||
    throwStep.payload?.Skill !== 80 ||
    throwStep.payload.IsEvaluation !== 0 ||
    throwStep.playerId !== declaration.playerId ||
    throwStep.sequenceId !== declaration.sequenceId ||
    pass?.sourceTag !== "ResultRoll" ||
    pass.rollType !== 5 ||
    pass.payload?.Outcome !== 1 ||
    !sameStep(throwStep, pass) ||
    question?.sourceTag !== "QuestionInterceptors" ||
    question.payload?.PassType !== 4 ||
    !sameStep(throwStep, question)
  )
    return;
  let cursor = index + 4;
  while (cursor < index + 12 && controls.has(raw.get(cursor)?.sourceTag ?? ""))
    cursor++;
  const intercept = raw.get(cursor),
    interceptDie = raw.get(cursor + 1);
  const catchStep = raw.get(cursor + 2),
    catchDie = raw.get(cursor + 3);
  const observed = catchDie?.id
    ? reported.get(catchDie.id)?.metadata.bombCatch
    : undefined;
  if (
    intercept?.sourceTag !== "PlayerStep" ||
    intercept.stepType !== 29 ||
    intercept.payload?.IsEvaluation !== 0 ||
    interceptDie?.sourceTag !== "ResultRoll" ||
    interceptDie.rollType !== 6 ||
    interceptDie.payload?.Outcome !== 0 ||
    !sameStep(intercept, interceptDie) ||
    catchStep?.sourceTag !== "PlayerStep" ||
    catchStep.stepType !== 4 ||
    !sameStep(catchStep, catchDie) ||
    !observed?.caught ||
    !observed.starQuestionSourceId
  )
    return;
  const blastAt = cursor + 8;
  const blast = raw.get(blastAt),
    decision = raw.get(blastAt + 1);
  if (
    blast?.id !== observed.explosionSourceId ||
    decision?.sourceTag !== "ResultStarSpecialRuleUsage"
  )
    return;
  for (let next = blastAt + 2; next < blastAt + 32; next += 2) {
    const step = raw.get(next),
      die = raw.get(next + 1);
    if (
      step?.sourceTag === "EventRulesEngineStandBy" &&
      step.payload?.Phase === "5"
    )
      return { end: next, catchSourceId: catchDie!.id! };
    if (
      !step ||
      step.sequenceId !== blast.sequenceId ||
      step.payload?.IsEvaluation !== 0 ||
      die?.sourceTag !== "ResultRoll" ||
      !sameStep(step, die) ||
      !(
        (step.sourceTag === "PlayerStep" &&
          step.stepType === 33 &&
          die.rollType === 88) ||
        (step.sourceTag === "DamageStep" &&
          step.payload.Source === 12 &&
          step.payload.Applied === 1 &&
          die.rollType === 10)
      )
    )
      return;
  }
}

function ordinaryPrefix(event: ReplayEvent, landing: Cell) {
  const p = event.payload;
  if (event.executionExclusion) return false;
  if (controls.has(event.sourceTag)) return true;
  switch (event.sourceTag) {
    case "PlayerStep": {
      const from = readCell(p?.CellFrom),
        to = readCell(p?.CellTo);
      return (
        p?.IsEvaluation === 0 &&
        !!from &&
        !!to &&
        (event.stepType === 1
          ? ordinaryStep(event) &&
            adjacent(from, to) &&
            !same(from, landing) &&
            !same(to, landing)
          : !same(from, landing) &&
            (event.stepType === 0 || (event.stepType === 7 && same(from, to))))
      );
    }
    case "ResultUseAction":
      return event.stepType === 0 && (p?.Action === 1 || p?.Action === 3);
    case "ResultSkillUsage":
      return event.stepType === 0 && p?.Skill === 51 && p.Used === 1;
    case "ResultAddPlayerEffect": {
      const effect = p?.Effect as
        | {
            ProviderType?: unknown;
            ProviderId?: unknown;
            EffectId?: unknown;
            CharacModifiers?: unknown;
            AdditionalSkills?: unknown;
          }
        | undefined;
      return (
        event.stepType === 0 &&
        effect?.ProviderType === 4 &&
        effect.ProviderId === 51 &&
        effect.EffectId === 44 &&
        effect.CharacModifiers === "" &&
        effect.AdditionalSkills === ""
      );
    }
    case "QuestionTeamRerollUsage":
      return event.stepType === 0 && offerType(event) === 34;
    case "ResultTeamRerollUsage":
      return event.stepType === 0 && p?.Used === 0;
    case "ResultNoRollSuccess":
      return event.stepType === 7 && Object.keys(p ?? {}).length === 0;
    case "ResultDoMove":
      return event.stepType === 1 && Object.keys(p ?? {}).length === 0;
    case "ResultRoll":
      return (
        (event.stepType === 0 && event.rollType === 34) ||
        (event.stepType === 1 && event.rollType === 2 && p?.Outcome === 1)
      );
    case "ResultMoveOutcome": {
      const roll = (
        p?.Rolls as
          { RollSummary?: { RollType?: number; Outcome?: number } } | undefined
      )?.RollSummary;
      return (
        plainPickupMoveOutcome(event) ||
        (roll?.RollType === 2 &&
          roll.Outcome === 1 &&
          plainPickupMoveOutcome({ ...event, payload: { ...p, Rolls: "" } }))
      );
    }
    default:
      return false;
  }
}

export function observeRushFallRecovery(
  fall: MovementFall,
  originTeam: string,
  checkpoints: readonly ReplayBoardCheckpoint[],
  raw: RawIndex,
  reported: ReadonlyMap<string | undefined, LuckEvent>,
  teamIds: readonly string[]
): Recovery | undefined {
  const path = fall.ballPath,
    after = path?.aftermath;
  if (!path || after?.status !== "loose") return;
  const landing = path.legs.at(-1)!.to,
    first = after.checkpointAfter;
  let offer: ReplayEvent | undefined;
  for (let index = first + 1; index <= first + MAX_BRIDGE; index++) {
    const event = raw.get(index);
    if (
      !event ||
      event.sourceTag === "EventEndTurn" ||
      (event.sourceTag === "ResultRoll" && event.rollType === 4)
    )
      return;
    if (
      event.sourceTag === "QuestionTeamRerollUsage" &&
      offerType(event) === 4
    ) {
      offer = event;
      break;
    }
  }
  if (offer?.sourceIndex === undefined || !offer.id) return;
  const waiting = offer.sourceIndex;
  const declaration = raw.get(waiting - 4),
    approach = raw.get(waiting - 3),
    approachOutcome = raw.get(waiting - 1);
  const resumed = raw.get(waiting + 1),
    choice = raw.get(waiting + 2),
    die = raw.get(waiting + 3);
  const pickup = die?.id ? reported.get(die.id) : undefined;
  const actor = Number(offer.playerId);
  const from = readCell(approach?.payload?.CellFrom);
  if (
    !pickup ||
    !die?.id ||
    !pickup.playerId ||
    pickup.playerId !== offer.playerId ||
    pickup.teamId === originTeam ||
    pickup.teamId === "unresolved" ||
    pickup.scoringStatus !== "scored" ||
    pickup.actualSuccess !== true ||
    pickup.metadata.rerollResource !== "team" ||
    pickup.metadata.rerollQuestionId !== offer.id ||
    pickup.metadata.rerollDecisionId !== choice?.id ||
    pickup.metadata.teamRerollsSpent !== 1 ||
    pickup.metadata.lonerGate ||
    pickup.metadata.proGate ||
    pickup.metadata.rerollSkill ||
    unmodifiedD6Check(die, 4, 2, true) === undefined ||
    declaration?.sourceTag !== "ResultUseAction" ||
    declaration.payload?.Action !== 1 ||
    declaration.playerId !== offer.playerId ||
    declaration.sequenceId !== offer.sequenceId ||
    !approach ||
    !ordinaryStep(approach) ||
    !sameStep(approach, offer) ||
    !from ||
    !adjacent(from, landing) ||
    !same(readCell(approach.payload?.CellTo), landing) ||
    !emptyMove(approach, raw.get(waiting - 2)) ||
    !approachOutcome ||
    !sameStep(approach, approachOutcome) ||
    !plainPickupMoveOutcome(approachOutcome) ||
    !resumed ||
    !ordinaryStep(resumed) ||
    !sameStep(resumed, die) ||
    !sameStep(resumed, choice) ||
    !same(readCell(resumed.payload?.CellFrom), from) ||
    !same(readCell(resumed.payload?.CellTo), landing) ||
    choice?.sourceTag !== "ResultTeamRerollUsage" ||
    choice.payload?.Used !== 1 ||
    choice.payload.GamerId !== offer.payload?.GamerId
  )
    return;

  const frames = checkpoints.filter(
    (cp) => cp.afterSourceIndex >= first && cp.afterSourceIndex <= waiting
  );
  const initial = frames[0]?.board,
    last = frames.at(-1);
  if (
    !initial ||
    last?.afterSourceIndex !== waiting ||
    frames.length > 64 ||
    frames.length < 2 ||
    initial.periodCode === null
  )
    return;
  const compatible = (b: ObservedBoard) =>
    b.phaseCode === 5 &&
    !b.issues.length &&
    b.periodCode === initial.periodCode &&
    b.teams.length === 2 &&
    b.teams.every(
      (team, i) =>
        team.gameTurn === initial.teams[i]?.gameTurn &&
        team.players.length === initial.teams[i]?.players.length &&
        team.players.every(
          (p) =>
            p.id !== null &&
            initial.teams[i]?.players.some((prior) => prior.id === p.id)
        )
    );
  if (
    frames.some((cp) => {
      const b = cp.board;
      return (
        !b ||
        !compatible(b) ||
        !same(b.ball.cell, landing) ||
        b.ball.isHeld === true ||
        b.ball.carrierId !== null ||
        b.teams.some((team) =>
          team.players.some(
            (p) =>
              (cp !== last || p.id !== actor) &&
              !(
                (p.cell.x !== null && p.cell.x !== landing.x) ||
                (p.cell.y !== null && p.cell.y !== landing.y)
              )
          )
        )
      );
    })
  )
    return;
  const owner = observedActorRoster(last.board!, actor, pickup.teamId, teamIds);
  if (
    last.board?.activePlayerId !== actor ||
    owner?.rosterIndex !== choice.payload.GamerId ||
    !same(owner?.players.find((p) => p.id === actor)?.cell, landing)
  )
    return;

  const bombs: string[] = [];
  for (let index = first + 1; index < waiting - 5; index++) {
    const event = raw.get(index);
    if (!event) return;
    const bombDeclaration = raw.get(index + 1);
    if (
      event.sourceTag === "PlayerStep" &&
      event.stepType === 0 &&
      event.payload?.IsEvaluation === 0 &&
      bombDeclaration?.sourceTag === "ResultUseAction" &&
      bombDeclaration.payload?.Action === 16 &&
      sameStep(event, bombDeclaration)
    ) {
      const window = bombWindow(raw, bombDeclaration, reported);
      if (!window || window.end >= waiting - 5) return;
      bombs.push(window.catchSourceId);
      index = window.end;
    } else if (!ordinaryPrefix(event, landing)) return;
  }

  const confirmed = checkpoints.find(
    (cp) => cp.afterSourceIndex >= waiting + 3
  );
  const board = confirmed?.board,
    confirmedOwner =
      board && observedActorRoster(board, actor, pickup.teamId, teamIds);
  if (
    !confirmed ||
    !board ||
    !compatible(board) ||
    board.stable !== true ||
    confirmed.replayStep !== die.locator?.replayStep ||
    board.activePlayerId !== actor ||
    board.ball.possession !== "held" ||
    board.ball.carrierId !== actor ||
    !confirmedOwner ||
    confirmedOwner.rosterIndex !== owner?.rosterIndex
  )
    return;
  let position = landing,
    index = waiting + 4;
  for (
    let moves = 0;
    moves < MAX_CARRY && index < confirmed.afterSourceIndex;
    moves++, index += 3
  ) {
    const step = raw.get(index),
      outcome = raw.get(index + 2),
      to = readCell(step?.payload?.CellTo);
    if (
      !step ||
      !ordinaryStep(step) ||
      step.sequenceId !== die.sequenceId ||
      step.playerId !== offer.playerId ||
      !same(readCell(step.payload?.CellFrom), position) ||
      !to ||
      !adjacent(position, to) ||
      !emptyMove(step, raw.get(index + 1)) ||
      !outcome ||
      !sameStep(step, outcome) ||
      !plainPickupMoveOutcome(outcome)
    )
      return;
    position = to;
  }
  if (
    index !== confirmed.afterSourceIndex ||
    raw.get(index)?.sourceTag !== "EventRulesEngineStandBy" ||
    !same(board.ball.cell, position)
  )
    return;
  return {
    pickupSourceId: die.id,
    waitingCheckpointAfter: waiting,
    confirmedCheckpointAfter: index,
    confirmedCell: position,
    boardCount: frames.length,
    bombCatchSourceIds: bombs
  };
}

export function validReportedRushRecovery(
  event: LuckEvent,
  report: LuckReport,
  sources: ReadonlyMap<string, LuckEvent>
) {
  const path = event.metadata.movementFall?.ballPath;
  const after = path?.aftermath;
  const recovery = after?.status === "loose" ? after.recovery : undefined;
  if (!path || !recovery || after?.status !== "loose") return true;
  const pickup = sources.get(recovery.pickupSourceId),
    index = pickup?.metadata.sourceIndex;
  if (
    !pickup ||
    !index ||
    pickup.teamId === event.teamId ||
    pickup.teamId === "unresolved" ||
    pickup.scoringStatus !== "scored" ||
    pickup.actualSuccess !== true ||
    pickup.metadata.rollType !== 4 ||
    pickup.metadata.rerollResource !== "team" ||
    pickup.metadata.teamRerollsSpent !== 1 ||
    pickup.metadata.rerollSkill ||
    pickup.metadata.lonerGate ||
    pickup.metadata.proGate ||
    index !== recovery.waitingCheckpointAfter + 3 ||
    index <= after.checkpointAfter ||
    index - after.checkpointAfter > MAX_BRIDGE + 3 ||
    recovery.confirmedCheckpointAfter <= index ||
    recovery.confirmedCheckpointAfter - index > MAX_CARRY * 3 + 1
  )
    return false;
  const steps = (recovery.confirmedCheckpointAfter - index - 1) / 3;
  const start = path.legs.at(-1)!.to,
    end = recovery.confirmedCell;
  if (
    !Number.isInteger(steps) ||
    Math.max(Math.abs(start.x - end.x), Math.abs(start.y - end.y)) > steps
  )
    return false;
  const { clockSnapshots, endNotifications } = report.rerollResources.flow;
  const frames = clockSnapshots.filter(
    (f) =>
      f.source.checkpointAfter >= after.checkpointAfter &&
      f.source.checkpointAfter <= recovery.waitingCheckpointAfter
  );
  const confirmed = clockSnapshots.find(
    (f) => f.source.checkpointAfter >= index
  );
  const choice = report.rerollResources.decisions.find(
    (row) => row.decisionSourceId === pickup.metadata.rerollDecisionId
  );
  const period = frames[0]?.clock?.periodCode;
  const turns = frames[0]?.clock?.teamTurns;
  const bombs = [...sources.values()].filter(
    (row) =>
      row.metadata.bombCatch &&
      (row.metadata.sourceIndex ?? -1) > after.checkpointAfter &&
      (row.metadata.sourceIndex ?? Infinity) < recovery.waitingCheckpointAfter
  );
  return (
    frames.length === recovery.boardCount &&
    frames[0]?.source.checkpointAfter === after.checkpointAfter &&
    frames.at(-1)?.source.checkpointAfter === recovery.waitingCheckpointAfter &&
    period != null &&
    frames.every(
      (f) =>
        f.clock?.phaseCode === 5 &&
        f.clock.periodCode === period &&
        f.clock.teamTurns.every((turn, i) => turn === turns?.[i])
    ) &&
    choice?.status === "linked" &&
    choice.teamId === pickup.teamId &&
    choice.namespace?.basis === "observed_roster" &&
    choice.namespace.actorPlayerId === pickup.playerId &&
    choice.namespace.checkpointAfter === recovery.waitingCheckpointAfter &&
    confirmed?.source.checkpointAfter === recovery.confirmedCheckpointAfter &&
    confirmed.source.replayStep === pickup.metadata.locator?.replayStep &&
    confirmed.clock?.phaseCode === 5 &&
    confirmed.clock.periodCode === period &&
    confirmed.clock.teamTurns.every((turn, i) => turn === turns?.[i]) &&
    !endNotifications.some(
      (end) =>
        end.sourceIndex !== null &&
        end.sourceIndex > after.checkpointAfter &&
        end.sourceIndex <= recovery.confirmedCheckpointAfter
    ) &&
    bombs.length === recovery.bombCatchSourceIds.length &&
    bombs.every((bomb, i) => {
      const explosion = bomb.metadata.bombCatch!.explosionSourceId;
      return (
        bomb.metadata.sourceId === recovery.bombCatchSourceIds[i] &&
        (sources.get(explosion)?.metadata.sourceIndex ?? Infinity) <
          recovery.waitingCheckpointAfter
      );
    })
  );
}
