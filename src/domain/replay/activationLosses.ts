import { buildPlayerOwnershipIndex } from "./attribution";
import {
  checkpointClockEpochs,
  consistentNormalStandBy,
  lastBoardCheckpointBefore,
  type ObservedBoard
} from "./boardState";
import type { ReplayModel } from "./types";

type Cell = { x: number; y: number };
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
function same(
  a: { x: number | null; y: number | null } | undefined,
  b: Cell | undefined
) {
  return !!a && !!b && a.x === b.x && a.y === b.y;
}
export type ConfirmedActivationLoss = {
  rollSourceId: string;
  rollSourceIndex: number;
  declarationSourceId: string;
  skillSourceId: string;
  followingActivationSourceId: string;
  followingSourceIndex: number;
  followingPlayerId: string;
  actorId: string;
  subjectId: string;
  teamId: string;
  teamTurn: number;
  rosterIndex: number;
  periodCode: number | null;
  actorCell: Cell;
  beforeCheckpointAfter: number;
  afterCheckpointAfter: number;
};

// GR-003 and UI-099: a failed ordinary Block declaration costs this actor's
// activation, while a different teammate is independently observed acting.
// Following evidence confirms aftermath; it can affect only later frames.
export function findConfirmedActivationLosses(
  replay: ReplayModel
): ConfirmedActivationLoss[] {
  const result: ConfirmedActivationLoss[] = [];
  if (replay.replayVersion !== "1-4-0-0") return result;
  const owners = buildPlayerOwnershipIndex(replay).playerToTeam;
  const checkpoints = replay.boardCheckpoints ?? [];
  const epochs = checkpointClockEpochs(checkpoints);
  for (const turn of replay.turns) {
    const events = turn.events;
    for (const [index, roll] of events.entries()) {
      const step = events[index - 3],
        declaration = events[index - 2],
        skill = events[index - 1];
      const p = roll.payload;
      const die = (
        p?.Dice as { Die?: { DieType?: number; Value?: number } } | undefined
      )?.Die;
      const actor = step?.stepActorId,
        subject = step?.stepTargetId;
      if (
        roll.sourceTag !== "ResultRoll" ||
        roll.rollType !== 37 ||
        !roll.id ||
        roll.sourceIndex === undefined ||
        p?.Status !== 1 ||
        p.NewRoll !== 1 ||
        p.Requirement !== 2 ||
        p.Difficulty !== 2 ||
        p.Outcome !== 0 ||
        (p.Modifiers !== undefined && p.Modifiers !== "") ||
        die?.DieType !== 0 ||
        die.Value !== 1 ||
        step?.sourceTag !== "PlayerStep" ||
        step.stepType !== 0 ||
        step.payload?.IsEvaluation !== 0 ||
        step.payload.Skill !== 0 ||
        !actor ||
        !subject ||
        actor === subject ||
        subject === "-1" ||
        declaration?.sourceTag !== "ResultUseAction" ||
        declaration.actionCode !== 2 ||
        !declaration.id ||
        declaration.sourceIndex === undefined ||
        skill?.sourceTag !== "ResultSkillUsage" ||
        !skill.id ||
        skill.payload?.Skill !== 10 ||
        skill.payload.Used !== 1 ||
        skill.playerId !== subject ||
        declaration.playerId !== actor ||
        roll.playerId !== actor ||
        [declaration, skill, roll].some(
          (e) => e.actionId !== step.actionId || e.attributionConflict
        )
      )
        continue;
      const from = cell(step.payload.CellFrom),
        target = cell(step.payload.CellTo);
      if (
        !from ||
        !target ||
        Math.max(Math.abs(from.x - target.x), Math.abs(from.y - target.y)) !== 1
      )
        continue;
      let next = index + 1;
      while (
        events[next]?.sourceTag === "Carrier" &&
        events[next]?.checkpointCarrier
      )
        next++;
      const standBy =
        events[next]?.sourceTag === "EventRulesEngineStandBy"
          ? events[next++]
          : undefined;
      while (
        events[next]?.sourceTag === "Carrier" &&
        events[next]?.checkpointCarrier
      )
        next++;
      const followingStep = events[next],
        following = events[next + 1];
      if (
        followingStep?.sourceTag !== "PlayerStep" ||
        followingStep.stepType !== 0 ||
        followingStep.payload?.IsEvaluation !== 0 ||
        following?.sourceTag !== "ResultUseAction" ||
        !following.id ||
        following.sourceIndex === undefined ||
        !following.playerId ||
        following.playerId === actor ||
        following.playerId !== followingStep.stepActorId ||
        following.actionId !== followingStep.actionId ||
        !Number.isInteger(following.actionCode) ||
        following.actionCode! < 1 ||
        following.actionCode! > 6 ||
        following.attributionConflict
      )
        continue;
      const before = lastBoardCheckpointBefore(
        checkpoints,
        declaration.sourceIndex
      );
      const after = lastBoardCheckpointBefore(
        checkpoints,
        following.sourceIndex
      );
      const a = before?.board,
        b = after?.board;
      if (
        !before ||
        !after ||
        !a ||
        !b ||
        (standBy && !consistentNormalStandBy(standBy, a, b)) ||
        a.issues.length ||
        b.issues.length ||
        a.stable !== true ||
        b.stable !== true ||
        a.phaseCode !== 5 ||
        b.phaseCode !== 5 ||
        after.afterSourceIndex < roll.sourceIndex ||
        a.periodCode !== b.periodCode ||
        epochs.get(before) !== epochs.get(after)
      )
        continue;
      const own = a.teams.find((t) =>
        t.players.some((p) => String(p.id) === actor)
      );
      const opponent = a.teams.find((t) =>
        t.players.some((p) => String(p.id) === subject)
      );
      const later = b.teams.find((t) =>
        t.players.some((p) => String(p.id) === actor)
      );
      const original = own?.players.find((p) => String(p.id) === actor);
      const final = later?.players.find((p) => String(p.id) === actor);
      const teammate = later?.players.find(
        (p) => String(p.id) === following.playerId
      );
      if (
        !own ||
        !opponent ||
        own === opponent ||
        own.explicitTeamId === null ||
        own.rosterIndex !== a.activeTeamIndex ||
        later?.rosterIndex !== b.activeTeamIndex ||
        later.explicitTeamId !== own.explicitTeamId ||
        own.gameTurn === null ||
        own.gameTurn < 1 ||
        own.gameTurn !== later.gameTurn ||
        original?.canAct !== true ||
        final?.canAct === true ||
        !same(original?.cell, from) ||
        !same(final?.cell, from) ||
        teammate?.canAct !== true ||
        !same(
          opponent.players.find((p) => String(p.id) === subject)?.cell,
          target
        ) ||
        !same(teammate.cell, cell(followingStep.payload.CellFrom))
      )
        continue;
      const teamId = String(own.explicitTeamId),
        subjectOwner = owners.get(subject);
      if (
        !subjectOwner ||
        subjectOwner === teamId ||
        (opponent.explicitTeamId !== null &&
          String(opponent.explicitTeamId) !== subjectOwner) ||
        (owners.get(actor) && owners.get(actor) !== teamId) ||
        (owners.get(following.playerId) &&
          owners.get(following.playerId) !== teamId)
      )
        continue;
      if (
        [declaration, roll, following].some(
          (e) =>
            (e.actorTeamId &&
              e.actorTeamSource !== "turn_inferred" &&
              e.actorTeamId !== teamId) ||
            (e.teamId && e.teamId !== teamId)
        ) ||
        (skill.actorTeamId &&
          skill.actorTeamSource !== "turn_inferred" &&
          skill.actorTeamId !== subjectOwner) ||
        (skill.teamId && skill.teamId !== subjectOwner)
      )
        continue;
      result.push({
        rollSourceId: roll.id,
        rollSourceIndex: roll.sourceIndex,
        declarationSourceId: declaration.id,
        skillSourceId: skill.id,
        followingActivationSourceId: following.id,
        followingSourceIndex: following.sourceIndex,
        followingPlayerId: following.playerId,
        actorId: actor,
        subjectId: subject,
        teamId,
        teamTurn: own.gameTurn,
        rosterIndex: own.rosterIndex,
        actorCell: from,
        periodCode: a.periodCode,
        beforeCheckpointAfter: before.afterSourceIndex,
        afterCheckpointAfter: after.afterSourceIndex
      });
    }
  }
  return result;
}

export function applyKnownActivationLosses(
  board: ObservedBoard,
  losses: ReadonlyMap<string, ConfirmedActivationLoss>
) {
  let current = board;
  const remaining = new Map<string, ConfirmedActivationLoss>();
  for (const [id, loss] of losses) {
    const team = current.teams.find(
      (t) =>
        t.rosterIndex === loss.rosterIndex &&
        String(t.explicitTeamId) === loss.teamId
    );
    const actor = team?.players.find((p) => String(p.id) === loss.actorId);
    if (
      current.phaseCode !== 5 ||
      current.stable !== true ||
      current.periodCode !== loss.periodCode ||
      current.activeTeamIndex !== loss.rosterIndex ||
      team?.gameTurn !== loss.teamTurn ||
      !actor ||
      actor.canAct === true ||
      !same(actor.cell, loss.actorCell)
    ) {
      continue;
    }
    remaining.set(id, loss);
    if (actor.canAct === false) continue;
    current = {
      ...current,
      teams: current.teams.map((t) =>
        t !== team
          ? t
          : {
              ...t,
              players: t.players.map((p) =>
                p !== actor ? p : { ...p, canAct: false }
              )
            }
      )
    };
  }
  return { board: current, losses: remaining };
}
