import type { ReplayEvent, ReplayModel } from "./types";
import {
  checkpointClockEpochs,
  consistentNormalStandBy,
  lastBoardCheckpointBefore,
  type ObservedBoard
} from "./boardState";
import { observedActorRoster } from "./observedActorRoster";
import { isInertReplayControl } from "./inertControls";
import type { ActivationEnd } from "./activationEnds";
import {
  createOwnershipTimeline,
  type OwnershipTimeline
} from "./ownershipTimeline";

// Supplied by the source-qualified block resolution/damage linker. These
// facts certify an actual commitment, not a legal hypothetical die/skill policy.
export type BlockCommitment = {
  poolSourceId: string;
  finalSourceId: string;
  nextSourceId: string;
};
function cell(value: unknown) {
  const p = value as { X?: unknown; Y?: unknown } | undefined;
  return p &&
    !Array.isArray(p) &&
    Object.keys(p).every((k) => k === "X" || k === "Y") &&
    typeof p.X === "number" &&
    typeof p.Y === "number" &&
    Number.isInteger(p.X) &&
    Number.isInteger(p.Y) &&
    p.X >= 0 &&
    p.X <= 25 &&
    p.Y >= 0 &&
    p.Y <= 14
    ? { x: p.X, y: p.Y }
    : undefined;
}
function same(a: ReturnType<typeof cell>, b: ReturnType<typeof cell>) {
  return !!a && !!b && a.x === b.x && a.y === b.y;
}
const aftermathFields: Readonly<Record<string, readonly string[]>> = {
  ResultMoveOutcome: [
    "Moved",
    "TentacleUsed",
    "FumbleRooskieUsed",
    "Rolls",
    "Pushbacks"
  ],
  DamageStep: [
    "Applied",
    "Probability",
    "Source",
    "PlayerId",
    "TargetId",
    "TeamId",
    "IsEvaluation",
    "StepType",
    "CellTo",
    "State",
    "CellFrom",
    "Skill"
  ],
  ResultRoll: [
    "Status",
    "Requirement",
    "Modifiers",
    "Dice",
    "Difficulty",
    "RollType",
    "Outcome",
    "NewRoll"
  ],
  ResultInjuryRoll: [
    "Status",
    "Modifiers",
    "Dice",
    "Source",
    "RollType",
    "Outcome"
  ],
  ResultCasualtyRoll: [
    "Status",
    "Modifiers",
    "Dice",
    "Source",
    "RollType",
    "Outcome"
  ],
  ResultPlayerRemoval: ["PlayerId", "Situation", "Reason", "Status"],
  ResultSkillUsage: ["PlayerId", "Skill", "Used"],
  ResultGainSpp: ["PlayerId", "SppGained"],
  QuestionApothecaryCasualtyUsage: ["GamerId", "RollInfos"],
  QuestionApothecaryInjuryUsage: ["GamerId", "RollInfos"]
};
function knownAftermath(e: ReplayEvent) {
  if (e.sourceTag === "Carrier" && e.checkpointCarrier) return true;
  const fields = aftermathFields[e.sourceTag];
  return (
    !!fields &&
    !!e.payload &&
    Object.keys(e.payload).every((k) => fields.includes(k)) &&
    (e.sourceTag !== "ResultSkillUsage" ||
      ([13, 19, 63, 75, 81].includes(e.payload.Skill as number) &&
        e.payload.Used === 1))
  );
}
function ordinaryStep(e: ReplayEvent | undefined, type: number) {
  return (
    e?.sourceTag === "PlayerStep" &&
    e.stepType === type &&
    e.payload?.Skill === 0 &&
    e.payload.IsEvaluation === 0 &&
    Object.keys(e.payload).every((k) =>
      [
        "Probability",
        "PlayerId",
        "TargetId",
        "TeamId",
        "IsEvaluation",
        "StepType",
        "CellTo",
        "State",
        "CellFrom",
        "Skill"
      ].includes(k)
    )
  );
}
function declaration(
  e: ReplayEvent | undefined,
  step: ReplayEvent | undefined
) {
  return (
    e?.sourceTag === "ResultUseAction" &&
    !!e.id &&
    e.sourceIndex !== undefined &&
    ordinaryStep(step, 0) &&
    step!.stepActorId === e.playerId &&
    step!.actionId === e.actionId &&
    !e.attributionConflict &&
    !step!.attributionConflict &&
    (e.actionCode ?? 0) >= 1 &&
    (e.actionCode ?? 0) <= 6
  );
}
function owned(board: ObservedBoard, id: string, teamIds: readonly string[]) {
  const active = board.teams.find(
    (t) => t.rosterIndex === board.activeTeamIndex
  );
  if (
    board.phaseCode !== 5 ||
    board.stable !== true ||
    board.issues.length ||
    (board.periodCode !== null && ![0, 1, 2].includes(board.periodCode)) ||
    !active ||
    active.explicitTeamId === null ||
    active.gameTurn === null ||
    active.gameTurn <= 0 ||
    observedActorRoster(
      board,
      Number(id),
      String(active.explicitTeamId),
      teamIds
    ) !== active
  )
    return;
  return active;
}

// Prefix-only: availability changes at the following teammate's declaration,
// after an applied ordinary Block and a compatible stable checkpoint. A later
// matching clock cannot repair an intervening unknown transition/clock epoch.
export function findBlockActivationEnds(
  replay: ReplayModel,
  commitments: readonly BlockCommitment[],
  owners: OwnershipTimeline = createOwnershipTimeline(replay)
): ActivationEnd[] {
  if (replay.replayVersion !== "1-4-0-0" || !commitments.length) return [];
  const allEvents = replay.turns
      .flatMap((t) => t.events)
      .filter((e) => !(e.sourceTag === "Carrier" && e.checkpointCarrier)),
    allCheckpoints = replay.boardCheckpoints ?? [],
    teamIds = replay.teams.map((t) => t.id);
  // Malformed suffixes cannot revoke an already witnessed completion. Stop
  // admission at the first unordered/unindexed source; never skip the gap and
  // recover a later convenient declaration or checkpoint.
  const invalidEvent = allEvents.findIndex(
    (e, i) =>
      e.sourceIndex === undefined ||
      (i > 0 && e.sourceIndex <= allEvents[i - 1]!.sourceIndex!)
  );
  const events =
    invalidEvent < 0 ? allEvents : allEvents.slice(0, invalidEvent);
  const invalidCheckpoint = allCheckpoints.findIndex(
    (c, i) =>
      i > 0 && c.afterSourceIndex < allCheckpoints[i - 1]!.afterSourceIndex
  );
  const cps =
    invalidCheckpoint < 0
      ? allCheckpoints
      : allCheckpoints.slice(0, invalidCheckpoint);
  const indices = new Map(
      events.flatMap((e, i) => (e.id ? [[e.id, i] as const] : []))
    ),
    steps = new Map(
      events
        .filter((e) => e.sourceTag === "PlayerStep" && e.actionId)
        .map((e) => [e.actionId!, e])
    );
  const epochs = checkpointClockEpochs(cps),
    result: ActivationEnd[] = [],
    confirmations = new Set<string>();
  for (const fact of commitments) {
    const pi = indices.get(fact.poolSourceId),
      fi = indices.get(fact.finalSourceId),
      ni = indices.get(fact.nextSourceId);
    if (
      pi === undefined ||
      fi === undefined ||
      ni === undefined ||
      pi >= fi ||
      fi >= ni ||
      fi - pi > 256 ||
      ni - fi > 128
    )
      continue;
    const pool = events[pi]!,
      final = events[fi]!,
      blockStep = pool.actionId ? steps.get(pool.actionId) : undefined;
    const attacker = blockStep?.stepActorId,
      target = blockStep?.stepTargetId;
    if (
      pool.sourceTag !== "QuestionBlockDice" ||
      final.sourceTag !== "ResultBlockOutcome" ||
      !ordinaryStep(blockStep, 6) ||
      !attacker ||
      !target ||
      attacker === target ||
      blockStep.payload?.Skill !== 0 ||
      blockStep.payload.IsEvaluation !== 0 ||
      final.payload?.AttackerId !== Number(attacker) ||
      final.payload.DefenderId !== Number(target) ||
      ![0, 1].includes(final.payload.Follow as number)
    )
      continue;
    const from = cell(blockStep.payload.CellFrom),
      to = cell(blockStep.payload.CellTo);
    if (!events.slice(fi + 1, ni).every(knownAftermath)) continue;
    if (
      !from ||
      !to ||
      Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y)) !== 1
    )
      continue;
    let di = pi - 1;
    // Only the immediate ordinary block prefix, optionally including its
    // Dauntless test. No prior completed block, activation/reaction or reroll
    // chain may be crossed to recover a convenient earlier declaration.
    for (; di >= 0 && pi - di <= 128; di--) {
      const e = events[di]!;
      if (e.sourceTag === "ResultUseAction") break;
      if (e.sourceTag === "Carrier" && e.checkpointCarrier) continue;
      if (
        ordinaryStep(e, 6) &&
        e.stepActorId === attacker &&
        e.stepTargetId === target &&
        e.payload?.Skill === 0 &&
        e.payload.IsEvaluation === 0 &&
        same(cell(e.payload.CellFrom), from) &&
        same(cell(e.payload.CellTo), to)
      )
        continue;
      if (
        e.sourceTag === "ResultSkillUsage" &&
        e.playerId === attacker &&
        e.payload?.Skill === 26 &&
        e.payload.Used === 1 &&
        Object.keys(e.payload).every((k) =>
          ["PlayerId", "Skill", "Used"].includes(k)
        )
      )
        continue;
      if (
        e.sourceTag === "ResultRoll" &&
        e.playerId === attacker &&
        e.stepType === 6 &&
        e.rollType === 31
      )
        continue;
      break;
    }
    const declared = events[di],
      declaredStep = declared?.actionId
        ? steps.get(declared.actionId)
        : undefined;
    if (
      !declaration(declared, declaredStep) ||
      declared!.actionCode !== 2 ||
      declared!.playerId !== attacker ||
      !same(cell(declaredStep!.payload?.CellFrom), from) ||
      !same(cell(declaredStep!.payload?.CellTo), to)
    )
      continue;
    const before = lastBoardCheckpointBefore(cps, declaredStep!.sourceIndex!),
      a = before?.board;
    if (!a || !before) continue;
    const beforeIndex = indices.get(declaredStep!.id!)!;
    if (
      declaredStep!.sourceIndex! - before.afterSourceIndex > 128 ||
      !events
        .slice(Math.max(0, beforeIndex - 128), beforeIndex)
        .filter((e) => e.sourceIndex! > before.afterSourceIndex)
        .every(isInertReplayControl)
    )
      continue;
    const team = owned(a, attacker, teamIds),
      actor = team?.players.find((p) => String(p.id) === attacker);
    const defenderTeam = a.teams.find(
      (t) => t !== team && t.players.some((p) => String(p.id) === target)
    );
    const defender = defenderTeam?.players.find((p) => String(p.id) === target);
    if (
      !team ||
      !actor ||
      actor.pitchLocation !== "on_pitch" ||
      actor.canAct !== true ||
      !same(actor.cell as { x: number; y: number }, from) ||
      !defender ||
      defender.pitchLocation !== "on_pitch" ||
      !same(defender.cell as { x: number; y: number }, to) ||
      a.teams.reduce(
        (n, t) => n + t.players.filter((p) => String(p.id) === target).length,
        0
      ) !== 1
    )
      continue;
    const role = (id: string, event: ReplayEvent, teamId: string) => {
      const proof = owners.resolve(id, event);
      return proof.status === "confirmed" && proof.proof.teamId === teamId;
    };
    if (
      !role(attacker, declared!, String(team.explicitTeamId)) ||
      !role(attacker, final, String(team.explicitTeamId)) ||
      !role(
        target,
        pool,
        teamIds.find((id) => id !== String(team.explicitTeamId)) ?? ""
      )
    )
      continue;
    let next = ni;
    const skipCarriers = () => {
      while (
        next - ni < 128 &&
        ((events[next]?.sourceTag === "Carrier" &&
          events[next]?.checkpointCarrier) ||
          (events[next] !== undefined && isInertReplayControl(events[next]!)))
      )
        next++;
    };
    skipCarriers();
    const wait =
      events[next]?.sourceTag === "EventRulesEngineStandBy"
        ? events[next++]
        : undefined;
    skipCarriers();
    const followingStep = events[next++];
    skipCarriers();
    const following = events[next];
    if (
      !declaration(following, followingStep) ||
      following!.playerId === attacker ||
      !following!.playerId ||
      confirmations.has(following!.id!)
    )
      continue;
    if (!role(following!.playerId!, following!, String(team.explicitTeamId)))
      continue;
    const after = lastBoardCheckpointBefore(cps, followingStep!.sourceIndex!),
      b = after?.board;
    if (
      !b ||
      !after ||
      after.afterSourceIndex < final.sourceIndex! ||
      after.afterSourceIndex >= followingStep!.sourceIndex! ||
      epochs.get(before) !== epochs.get(after) ||
      !owned(b, following!.playerId, teamIds) ||
      b.activeTeamIndex !== team.rosterIndex ||
      b.periodCode !== a.periodCode ||
      (wait && !consistentNormalStandBy(wait, a, b))
    )
      continue;
    const followingIndex = indices.get(followingStep!.id!)!;
    if (
      followingStep!.sourceIndex! - after.afterSourceIndex > 128 ||
      !events
        .slice(Math.max(0, followingIndex - 128), followingIndex)
        .filter((e) => e.sourceIndex! > after.afterSourceIndex)
        .every(isInertReplayControl)
    )
      continue;
    const nextTeam = b.teams.find((t) => t.rosterIndex === team.rosterIndex),
      old = nextTeam?.players.find((p) => String(p.id) === attacker),
      fresh = nextTeam?.players.find(
        (p) => String(p.id) === following!.playerId
      );
    const reached = final.payload!.Follow === 1 ? to : from;
    if (
      nextTeam?.explicitTeamId !== team.explicitTeamId ||
      nextTeam.gameTurn !== team.gameTurn ||
      old?.pitchLocation !== "on_pitch" ||
      observedActorRoster(
        b,
        Number(attacker),
        String(team.explicitTeamId),
        teamIds
      ) !== nextTeam ||
      !same(old.cell as { x: number; y: number }, reached) ||
      fresh?.pitchLocation !== "on_pitch" ||
      fresh.canAct !== true ||
      !same(
        fresh.cell as { x: number; y: number },
        cell(followingStep!.payload?.CellFrom)
      )
    )
      continue;
    // An applied follow must itself be recorded. This does not simulate or
    // extrapolate a push chain, knockdown, damage or carrier consequence.
    if (
      final.payload!.Follow === 1 &&
      !events
        .slice(pi + 1, fi)
        .some(
          (e) =>
            e.sourceTag === "ResultFollowUp" &&
            e.playerId === attacker &&
            e.payload?.Follow === 1 &&
            Object.keys(e.payload).every((k) =>
              ["Follow", "CellFrom", "CellTo"].includes(k)
            ) &&
            same(cell(e.payload.CellFrom), from) &&
            same(cell(e.payload.CellTo), to)
        )
    )
      continue;
    confirmations.add(following!.id!);
    result.push({
      kind: "ordinary_block_completed",
      sourceId: following!.id!,
      sourceIndex: following!.sourceIndex!,
      declarationSourceId: declared!.id!,
      blockPoolSourceId: pool.id!,
      blockSourceId: final.id!,
      actorId: attacker,
      teamId: String(team.explicitTeamId),
      rosterIndex: team.rosterIndex,
      teamTurn: team.gameTurn!,
      periodCode: a.periodCode,
      actorCell: reached,
      followingPlayerId: following!.playerId,
      checkpointAfter: after.afterSourceIndex,
      rosterCheckpointAfter: before.afterSourceIndex,
      completionCheckpointAfter: after.afterSourceIndex
    });
  }
  return result;
}
