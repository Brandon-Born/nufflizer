import {
  lastBoardCheckpointBefore,
  type ReplayBoardCheckpoint
} from "@/domain/replay/boardState";
import {
  plainBounceSettlementKnown,
  offPitchPickupPlayer
} from "@/domain/replay/pickupSuccessors";
import { supportsSettledPickupTraits } from "@/domain/replay/playerTraits";
import {
  visitCurrentTraits,
  type CurrentTraitEvidence
} from "@/domain/replay/traitContinuity";
import type { OwnershipTimeline } from "@/domain/replay/ownershipTimeline";
import type { ReplayModel } from "@/domain/replay/types";
import { teamMovementContinuity } from "@/domain/replay/teamMovementContinuity";
import type { PreRollEvidence } from "@/domain/replay/reconstructContext";
import {
  estimatePickupPossessionBounds,
  exactPickupPossession
} from "./contextImpact";
import type { LuckEvent, LuckReport } from "./types";
import type { RerollResourceFlow } from "./rerollResourceFlow";

type ClockSnapshot = RerollResourceFlow["clockSnapshots"][number];
type PickupSkillFrame = {
  checkpoint: ReplayBoardCheckpoint;
  profiles: CurrentTraitEvidence[];
  offPitch: NonNullable<ClockSnapshot["pickupOffPitch"]>;
};
type PickupSkillContinuity = {
  original: PickupSkillFrame;
  waiting?: PickupSkillFrame;
};

// The linked question and replacement have identical recorded modifiers.
export function supportsPickupDecisionModifiers(
  requirement: unknown,
  difficulty: unknown,
  modifiers: LuckEvent["metadata"]["fixedNumericModifiers"],
  committed: boolean
) {
  if (
    !modifiers ||
    typeof requirement !== "number" ||
    !Number.isInteger(requirement)
  )
    return false;
  if (modifiers.length === 0) return requirement === difficulty;
  const rain = modifiers[0];
  return (
    committed &&
    modifiers.length === 1 &&
    difficulty === requirement + 1 &&
    rain?.modifierType === 15 &&
    rain.playerId === -1 &&
    rain.skillId === -1 &&
    rain.effectId === -1 &&
    rain.value === -1
  );
}

export function validPickupDecisionStage(
  event: LuckEvent,
  context: PreRollEvidence | undefined,
  sources: ReadonlyMap<string, LuckEvent>,
  committed: boolean
) {
  const m = event.metadata;
  const geometry = context?.pickupSuccessors;
  const question = sources.get(m.rerollQuestionId ?? "");
  const choice = sources.get(m.rerollDecisionId ?? "");
  const declaration = sources.get(geometry?.declarationSourceId ?? "");
  const move = sources.get(geometry?.moveOutcomeSourceId ?? "");
  const original = m.originalDice as
    { Die?: { DieType?: unknown; Value?: unknown } } | undefined;
  const owns = (row: LuckEvent | undefined) =>
    !!row && row.playerId === event.playerId && row.teamId === event.teamId;
  return (
    !!geometry &&
    !!context &&
    event.scoringStatus === "scored" &&
    event.type === "ball_handling" &&
    event.actualSuccess !== null &&
    m.sourceTag === "ResultRoll" &&
    m.rollType === 4 &&
    m.stepType === 1 &&
    m.targetId === "-1" &&
    m.rerollUsed === committed &&
    m.teamRerollsSpent === (committed ? 1 : 0) &&
    !m.rerollSkill &&
    m.rerollResource === (committed ? "team" : undefined) &&
    !m.rerollOriginalId &&
    !m.lonerGate &&
    !m.proGate &&
    m.probabilityPolicy === (committed ? "two_attempt" : "single_attempt") &&
    (!event.contextualImpact ||
      event.contextualImpact.policy === "exact_pickup_possession") &&
    !event.contextualBounds &&
    supportsPickupDecisionModifiers(
      m.requirement,
      m.difficulty,
      m.fixedNumericModifiers,
      committed
    ) &&
    m.difficulty !== undefined &&
    Number.isInteger(m.difficulty) &&
    m.difficulty >= 2 &&
    m.difficulty <= 6 &&
    m.dice?.length === 1 &&
    Number.isInteger(m.dice[0]) &&
    m.dice[0]! >= 1 &&
    m.dieTypes?.length === 1 &&
    m.dieTypes[0] === 0 &&
    m.dice[0]! <= 6 &&
    original?.Die?.DieType === 0 &&
    typeof original.Die.Value === "number" &&
    Number.isInteger(original.Die.Value) &&
    original.Die.Value >= 1 &&
    original.Die.Value < m.difficulty &&
    (committed
      ? m.rerollDraws?.initialSourceId === m.rerollQuestionId &&
        m.rerollDraws?.initialFace === original.Die.Value &&
        m.rerollDraws?.baseSuccessChance === (7 - m.difficulty) / 6 &&
        event.actualSuccess === m.dice[0]! >= m.difficulty
      : !m.rerollDraws &&
        event.actualSuccess === false &&
        original.Die.Value === m.dice[0] &&
        event.probabilitySuccess === (7 - m.difficulty) / 6) &&
    context.phaseCode === 5 &&
    context.actorCarriesBall !== true &&
    (context.actorRosterTeamId === undefined ||
      context.actorRosterTeamId === event.teamId) &&
    context.activationId === geometry.declarationSourceId &&
    context.actorCell?.x === geometry.origin.x &&
    context.actorCell.y === geometry.origin.y &&
    owns(declaration) &&
    declaration?.metadata.sourceTag === "ResultUseAction" &&
    declaration.metadata.actionCode === 1 &&
    declaration.metadata.stepType === 0 &&
    owns(move) &&
    move?.metadata.sourceTag === "ResultMoveOutcome" &&
    move.metadata.actionId === question?.metadata.actionId &&
    move.metadata.sequenceId === question?.metadata.sequenceId &&
    m.sourceIndex !== undefined &&
    move.metadata.sourceIndex === m.sourceIndex - 4 &&
    context.checkpointAfter < move.metadata.sourceIndex &&
    (declaration.metadata.sourceIndex ?? Infinity) <
      move.metadata.sourceIndex &&
    owns(question) &&
    question?.metadata.sourceTag === "QuestionTeamRerollUsage" &&
    question.metadata.stepType === 1 &&
    question.metadata.targetId === "-1" &&
    question.metadata.sourceIndex === m.sourceIndex - 3 &&
    question.metadata.recordedRerollOffer?.kind === "numeric" &&
    question.metadata.recordedRerollOffer.rollType === 4 &&
    question.metadata.recordedRerollOffer.teamAvailable === true &&
    question.metadata.recordedRerollOffer.proAvailable === false &&
    owns(choice) &&
    choice?.metadata.sourceTag === "ResultTeamRerollUsage" &&
    choice.metadata.stepType === 1 &&
    choice.metadata.sourceIndex === m.sourceIndex - 1 &&
    choice.metadata.actionId === m.actionId &&
    choice.metadata.sequenceId === m.sequenceId &&
    choice.metadata.recordedRerollChoice?.validFields === true &&
    choice.metadata.recordedRerollChoice.used === committed &&
    choice.metadata.recordedRerollChoice.gamerId ===
      question.metadata.recordedRerollOffer.gamerId
  );
}

export function committedPickupCheckpoint(
  context: PreRollEvidence,
  sourceIndex: number,
  playerId: string,
  checkpoints: readonly ReplayBoardCheckpoint[],
  epochs: ReadonlyMap<ReplayBoardCheckpoint, number>
) {
  const question = sourceIndex - 3;
  const decision = sourceIndex - 1;
  const waiting = lastBoardCheckpointBefore(checkpoints, decision);
  if (
    waiting?.afterSourceIndex !== question ||
    !waiting.board ||
    waiting.board.stable === false ||
    plainBounceSettlementKnown(waiting.board) !== context.pickupSettlementKnown
  )
    return;
  return teamMovementContinuity(
    checkpoints,
    context.checkpointAfter,
    question,
    decision,
    playerId,
    context.actorCell,
    { knownAvailablePlayerIds: [], unknownPlayerIds: [] },
    epochs
  );
}

// A team retry crosses a verified wait. An immediate Sure Hands replacement
// must still have the very same board as its linked original draw.
export function findContinuedPickupTraits(
  replay: ReplayModel,
  checkpoints: ReadonlyMap<string, number>,
  owners: OwnershipTimeline,
  sources: ReadonlyMap<string, LuckEvent>
) {
  const result = new Map<string, PickupSkillContinuity>();
  const sameAction = new Map<string, number>();
  for (const [source, event] of sources) {
    if (event.possessionBounds?.policy !== "sure_hands_reroll") continue;
    const first = sources.get(event.metadata.rerollOriginalId ?? "");
    if (
      first?.metadata.sourceIndex !== undefined &&
      first.metadata.actionId === event.metadata.actionId &&
      first.metadata.sequenceId === event.metadata.sequenceId
    )
      sameAction.set(source, first.metadata.sourceIndex);
  }
  if (!checkpoints.size && !sameAction.size) return result;
  const openings = new Set([...checkpoints.values(), ...sameAction.values()]);
  const original = new Map<number, PickupSkillFrame>();
  visitCurrentTraits(
    replay,
    (event, current, ledger) => {
      const index = event.sourceIndex;
      const waiting = event.id ? checkpoints.get(event.id) : undefined;
      const firstSkillRoll = event.id ? sameAction.get(event.id) : undefined;
      if (
        index === undefined ||
        (!openings.has(index) &&
          waiting === undefined &&
          firstSkillRoll === undefined) ||
        current?.board?.phaseCode !== 5
      )
        return;
      const board = current.board;
      const profiles: CurrentTraitEvidence[] = [];
      const offPitch: PickupSkillFrame["offPitch"] = [[], []];
      for (const team of board.teams) {
        for (const player of team.players) {
          const absent = offPitchPickupPlayer(player);
          if (absent) {
            offPitch[team.rosterIndex]!.push(absent);
            continue;
          }
          const profile = ledger.get(String(player.id));
          if (
            !profile ||
            profile.currentCheckpointAfter !== current.afterSourceIndex ||
            !supportsSettledPickupTraits(profile.traits)
          )
            return;
          profiles.push(profile);
        }
      }
      const frame = { checkpoint: current, profiles, offPitch };
      if (openings.has(index)) original.set(index, frame);
      const firstIndex = waiting ?? firstSkillRoll;
      if (
        firstIndex === undefined ||
        (waiting !== undefined && current.afterSourceIndex !== waiting)
      )
        return;
      const before = original.get(firstIndex);
      if (
        before &&
        (waiting !== undefined || before.checkpoint === current) &&
        before.profiles.length === profiles.length &&
        JSON.stringify(before.offPitch) === JSON.stringify(offPitch) &&
        before.profiles.every((seed, i) => {
          const now = profiles[i]!;
          return (
            seed.playerId === now.playerId &&
            seed.teamId === now.teamId &&
            seed.rosterIndex === now.rosterIndex &&
            seed.onPitch === now.onPitch &&
            seed.observedCheckpointAfter === now.observedCheckpointAfter &&
            JSON.stringify(seed.traits) === JSON.stringify(now.traits)
          );
        })
      )
        result.set(event.id!, {
          original: before,
          waiting: waiting === undefined ? undefined : frame
        });
    },
    owners
  );
  return result;
}

function replacementActorHasLoner(
  profile: CurrentTraitEvidence,
  actor: LuckEvent["playerId"]
) {
  return (
    profile.playerId === actor &&
    [44, 1008].some(
      (id) =>
        profile.traits.innateSkills?.includes(id) ||
        profile.traits.acquiredSkills?.includes(id)
    )
  );
}

export function validReportedContinuedPickupTraits(
  event: LuckEvent,
  report: LuckReport
) {
  const point =
    event.contextualImpact?.policy === "exact_pickup_possession"
      ? event.contextualImpact
      : undefined;
  const range = event.possessionBounds;
  const traits = point?.continuedTraits ?? range?.continuedTraits;
  const offPitchPlayerCount =
    point?.offPitchPlayerCount ?? range?.offPitchPlayerCount;
  const context = event.metadata.preRoll;
  const stage = point?.stage ?? range?.policy;
  const skill = stage === "sure_hands_reroll";
  const checkpoint = context?.checkpointAfter;
  const frames = report.rerollResources.flow.clockSnapshots;
  const before = frames.find(
    (frame) => frame.source.checkpointAfter === checkpoint
  );
  const wait = frames.find(
    (frame) =>
      frame.source.checkpointAfter ===
      (point?.waitingCheckpointAfter ?? range?.waitingCheckpointAfter)
  );
  if (!traits)
    return (
      !offPitchPlayerCount &&
      !(skill ? before?.pickupOffPitch : wait?.pickupOffPitch)
    );
  if (
    (!skill && stage !== "team_pickup_possession") ||
    context?.pickupSettlementKnown !== true ||
    !context.pickupSuccessors?.branches.some(
      (branch) => branch.kind === "empty"
    ) ||
    checkpoint === undefined ||
    !before ||
    (skill ? !!wait : !wait) ||
    !traits.some((p) => p.playerId === event.playerId && p.onPitch) ||
    new Set(traits.map((p) => p.playerId)).size !== traits.length
  )
    return false;
  if (skill && (before.clock?.phaseCode !== 5 || frames.some((frame) =>
    frame.source.checkpointAfter > checkpoint &&
    frame.source.checkpointAfter < (event.metadata.sourceIndex ?? 0)
  ))) return false;
  if (
    !skill &&
    JSON.stringify(before.pickupOffPitch) !==
      JSON.stringify(wait?.pickupOffPitch)
  )
    return false;
  const excluded = before.pickupOffPitch ?? [[], []];
  const excludedCount = excluded[0]!.length + excluded[1]!.length;
  if (
    offPitchPlayerCount !== (excludedCount || undefined) ||
    excluded.some(
      (players, roster) =>
        new Set(players.map((player) => player.playerId)).size !==
          players.length ||
        players.some(
          ({ playerId }) =>
            !before.playerIds[roster]!.includes(playerId) ||
            (!skill && !wait?.playerIds[roster]!.includes(playerId)) ||
            String(playerId) === event.playerId ||
            context.pickupSuccessors!.branches.some(
              (branch) =>
                branch.kind === "occupied" &&
                branch.playerId === String(playerId)
            )
        )
    ) ||
    traits.length !==
      before.playerIds[0].length + before.playerIds[1].length - excludedCount
  )
    return false;
  return traits.every((p) => {
    const id = Number(p.playerId);
    return (
      p.teamId === report.teams[p.rosterIndex]?.teamId &&
      String(p.traits.dataPlayerId) === p.playerId &&
      p.traits.playerTypeId !== null &&
      p.currentCheckpointAfter === checkpoint &&
      p.observedCheckpointAfter <= checkpoint &&
      p.prayersCheckpointAfter <= checkpoint &&
      before.playerIds[p.rosterIndex]!.includes(id) &&
      (skill || wait?.playerIds[p.rosterIndex]!.includes(id)) &&
      !excluded[p.rosterIndex]!.some((player) => player.playerId === id) &&
      frames.some(
        (frame) =>
          frame.source.checkpointAfter === p.observedCheckpointAfter &&
          frame.playerIds[p.rosterIndex]!.includes(id)
      ) &&
      supportsSettledPickupTraits(p.traits) &&
      (skill || !replacementActorHasLoner(p, event.playerId))
    );
  });
}

export function attachPickupDecisionPossession(
  sources: ReadonlyMap<string, LuckEvent>,
  contexts: ReadonlyMap<string, PreRollEvidence>,
  committedCheckpoints: ReadonlyMap<string, number>,
  continuedTraits: ReadonlyMap<string, PickupSkillContinuity>,
  clockSnapshots: readonly ClockSnapshot[]
) {
  for (const event of sources.values()) {
    const m = event.metadata;
    const skill = event.possessionBounds?.policy === "sure_hands_reroll";
    const geometry = skill
      ? m.preRoll?.pickupSuccessors
      : contexts.get(m.rerollQuestionId ?? "")?.pickupSuccessors;
    if (!geometry || !m.preRoll || (!skill && event.possessionBounds)) continue;
    const context = { ...m.preRoll, pickupSuccessors: geometry };
    const committed = !skill && m.rerollUsed === true;
    if (!skill && !validPickupDecisionStage(event, context, sources, committed))
      continue;
    const chance = (7 - m.difficulty!) / 6;
    const waitingCheckpointAfter = committed
      ? committedCheckpoints.get(m.sourceId ?? "")
      : undefined;
    if (committed && waitingCheckpointAfter === undefined) continue;
    const continued = continuedTraits.get(m.sourceId ?? "");
    const proof =
      context.pickupSettlementKnown !== true &&
      continued?.original.profiles.length &&
      continued.original.checkpoint.afterSourceIndex ===
        context.checkpointAfter &&
      geometry.branches.some((branch) => branch.kind === "empty") &&
      (skill ||
        !continued.original.profiles.some((p) =>
          replacementActorHasLoner(p, event.playerId)
        )) &&
      continued.original.offPitch.every((players) =>
        players.every(
          ({ playerId }) =>
            !geometry.branches.some(
              (b) => b.kind === "occupied" && b.playerId === String(playerId)
            )
        )
      ) &&
      recordPickupOffPitch(continued, clockSnapshots)
        ? continued.original
        : undefined;
    if (skill && !proof) continue;
    if (proof) {
      context.pickupSettlementKnown = true;
      context.pickupSuccessors = {
        ...geometry,
        branches: geometry.branches.map((branch) =>
          branch.kind === "empty" ? { ...branch, settlement: "loose" } : branch
        )
      };
    }
    const bounds = estimatePickupPossessionBounds(
      context,
      skill
        ? "sure_hands_reroll"
        : committed
          ? "team_pickup_possession"
          : "kept_pickup_possession",
      Number(event.actualSuccess) - chance,
      chance
    );
    if (!bounds) continue;
    m.preRoll = context;
    const point = exactPickupPossession(
      bounds,
      event.actualSuccess!,
      waitingCheckpointAfter
    );
    const offPitchPlayerCount = proof?.offPitch.flat().length;
    const skillEvidence = proof
      ? {
          continuedTraits: proof.profiles,
          ...(offPitchPlayerCount ? { offPitchPlayerCount } : {})
        }
      : {};
    if (point) {
      event.contextualImpact = { ...point, ...skillEvidence };
      delete event.possessionBounds;
    } else
      event.possessionBounds = {
        ...bounds,
        waitingCheckpointAfter,
        ...skillEvidence
      };
  }
}

function recordPickupOffPitch(
  proof: PickupSkillContinuity,
  clockSnapshots: readonly ClockSnapshot[]
) {
  if (proof.original.offPitch.every((players) => players.length === 0))
    return true;
  const frames = (
    proof.waiting ? [proof.original, proof.waiting] : [proof.original]
  ).map(({ checkpoint }) => {
    const frame = clockSnapshots.find(
      (entry) => entry.source.checkpointAfter === checkpoint.afterSourceIndex
    );
    return frame?.source.replayStep === checkpoint.replayStep &&
      frame?.source.childIndex === checkpoint.childIndex
      ? frame
      : undefined;
  });
  const [original, waiting] = frames;
  if (!original || (proof.waiting && !waiting)) return false;
  original.pickupOffPitch = proof.original.offPitch;
  if (waiting && proof.waiting) waiting.pickupOffPitch = proof.waiting.offPitch;
  return true;
}
