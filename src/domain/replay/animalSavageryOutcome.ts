import {
  readAnimalSavageryOffer,
  recordedConfusedProvider
} from "./mentalEffects";
import { readActivationDie } from "./activationChecks";
import {
  consistentNormalStandBy,
  lastBoardCheckpointBefore,
  type ReplayBoardCheckpoint
} from "./boardState";
import { scopedMentalNotificationHolder } from "./mentalNotification";
import { ownerAt, type OwnershipTimeline } from "./ownershipTimeline";
import type { ReplayEvent, ReplayModel } from "./types";

export type AnimalSavageryOutcome =
  | { kind: "actor_effect"; effectSourceId: string }
  | {
      kind: "teammate_selected";
      offerSourceId: string;
      selectionSourceId: string;
      offeredVictimIds: string[];
      victimId: string;
      armorSourceId?: string;
    };

export type AnimalSavageryContinuation = {
  beforeCheckpointAfter: number;
  afterCheckpointAfter: number;
  standBySourceId: string;
  followingActivationSourceId: string;
  followingPlayerId: string;
  teamTurn: number;
  actorRecordedCanAct: boolean | null;
  victim?: {
    beforeRecordedCanAct: boolean | null;
    afterRecordedCanAct: boolean | null;
    afterPitchLocation: "on_pitch" | "off_pitch";
    afterStatusCode: number | null;
    afterSituationCode: number | null;
  };
};

const isId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const hasOnly = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length &&
  keys.every((key) => key in value);

function cell(value: unknown) {
  if (!value || typeof value !== "object") return;
  const { X: x, Y: y } = value as Record<string, unknown>;
  if (isId(x) && x <= 25 && isId(y) && y <= 14) return { x, y };
}

function sameCell(a: unknown, b: unknown) {
  const first = cell(a),
    second = cell(b);
  return !!first && !!second && first.x === second.x && first.y === second.y;
}

function observedAt(
  player: { cell: { x: number | null; y: number | null } },
  position: unknown
) {
  const c = cell(position);
  return !!c && player.cell.x === c.x && player.cell.y === c.y;
}

function messageInStep(header: ReplayEvent, event: ReplayEvent, slot: number) {
  const at = event.locator,
    from = header.locator;
  return (
    !!from &&
    !!at &&
    from.stepIndex === 0 &&
    from.messageIndex === undefined &&
    at.replayStep === from.replayStep &&
    at.childIndex === from.childIndex &&
    at.stepIndex === 0 &&
    at.messageIndex === slot &&
    !!header.actionId &&
    event.actionId === header.actionId &&
    event.stepTag === header.stepTag &&
    event.stepType === header.stepType &&
    event.playerId === header.playerId &&
    event.stepActorId === header.stepActorId &&
    event.targetId === header.targetId &&
    event.stepTargetId === header.stepTargetId &&
    !event.attributionConflict &&
    !header.attributionConflict
  );
}

function armorAfterSelection(
  damage: ReplayEvent | undefined,
  roll: ReplayEvent | undefined,
  selection: ReplayEvent,
  atActor: unknown,
  victimId: string
) {
  if (!damage || !roll || !selection.locator || !damage.locator) return;
  const header = damage.payload,
    attacker = cell(atActor),
    victim = cell(header?.CellFrom);
  if (
    damage.sourceTag !== "DamageStep" ||
    damage.stepType !== 2 ||
    damage.locator.replayStep !== selection.locator.replayStep ||
    damage.locator.childIndex !== selection.locator.childIndex! + 1 ||
    damage.playerId !== victimId ||
    damage.targetId !== victimId ||
    damage.stepActorId !== victimId ||
    damage.stepTargetId !== victimId ||
    header?.Source !== 16 ||
    header.Applied !== 1 ||
    header.IsEvaluation !== 0 ||
    header.Skill !== 0 ||
    (header.State !== 2 && header.State !== 3) ||
    !attacker ||
    !victim ||
    !sameCell(header.CellFrom, header.CellTo) ||
    Math.max(
      Math.abs(attacker.x - victim.x),
      Math.abs(attacker.y - victim.y)
    ) !== 1 ||
    roll.sourceTag !== "ResultRoll" ||
    roll.rollType !== 10 ||
    roll.payload?.NewRoll !== 1 ||
    roll.payload.Status !== 1 ||
    !messageInStep(damage, roll, 0)
  )
    return;
  return roll.id;
}

// The caller supplies the verified terminal copy of a declined reroll. Effects
// and choices are evidence alongside that roll, with no extra dice contribution.
export function observeAnimalSavageryOutcome(
  kept: ReplayEvent,
  sources: ReadonlyMap<string | undefined, ReplayEvent>,
  owners: OwnershipTimeline
): AnimalSavageryOutcome | undefined {
  if (
    !kept.id ||
    !kept.sourceIndex ||
    !kept.playerId ||
    kept.locator?.replayStep === undefined
  )
    return;
  const at = kept.sourceIndex,
    actor = kept.playerId,
    position = kept.locator,
    frame = kept.locator.replayStep;
  const raw = (offset: number) => sources.get(`source-${at + offset}`);
  const header = raw(-2),
    following = raw(1);
  if (
    !header ||
    !following?.id ||
    !messageInStep(header, kept, 1) ||
    !messageInStep(header, following, 2)
  )
    return;
  const team = ownerAt(owners, actor, kept);
  if (team === undefined) return;

  if (
    following.sourceTag === "ResultAddPlayerEffect" &&
    header.payload?.State === 2 &&
    recordedConfusedProvider(following.payload?.Effect) === 84 &&
    scopedMentalNotificationHolder(following, header) === actor
  ) {
    return { kind: "actor_effect", effectSourceId: following.id };
  }

  const offer = readAnimalSavageryOffer(following.payload);
  if (
    following.sourceTag !== "QuestionAnimalSavagery" ||
    header.payload?.State !== 1 ||
    offer?.teamId !== team
  )
    return;
  const offeredVictimIds = offer.victimIds;
  if (
    offeredVictimIds.some(
      (id) => id === actor || ownerAt(owners, id, following) !== team
    )
  )
    return;

  const possibleCarrier = raw(2);
  const resumedOffset =
    possibleCarrier?.sourceTag === "Carrier" &&
    possibleCarrier.checkpointCarrier === true
      ? 3
      : 2;
  const resumed = raw(resumedOffset),
    choice = raw(resumedOffset + 1);
  const next = resumed?.payload,
    prior = header.payload,
    selected = choice?.payload;
  if (
    !resumed ||
    !next ||
    !choice?.id ||
    !selected ||
    resumed.sourceTag !== "PlayerStep" ||
    resumed.stepType !== 0 ||
    resumed.playerId !== actor ||
    resumed.stepActorId !== actor ||
    resumed.targetId !== kept.targetId ||
    resumed.stepTargetId !== kept.stepTargetId ||
    next.PlayerId !== prior?.PlayerId ||
    next.TargetId !== prior?.TargetId ||
    next.State !== 1 ||
    next.IsEvaluation !== 0 ||
    next.Skill !== 0 ||
    !sameCell(next.CellFrom, prior?.CellFrom) ||
    !sameCell(next.CellTo, prior?.CellTo) ||
    resumed.locator?.replayStep !== frame + 1 ||
    resumed.locator.childIndex !== position.childIndex ||
    choice.sourceTag !== "ResultAnimalSavagery" ||
    !messageInStep(resumed, choice, 0) ||
    !hasOnly(selected, ["VictimId"]) ||
    !isId(selected.VictimId)
  )
    return;
  const victimId = String(selected.VictimId);
  if (
    !offeredVictimIds.includes(victimId) ||
    ownerAt(owners, actor, choice) !== team ||
    ownerAt(owners, victimId, choice) !== team
  )
    return;

  return {
    kind: "teammate_selected",
    offerSourceId: following.id,
    selectionSourceId: choice.id,
    offeredVictimIds,
    victimId,
    armorSourceId: armorAfterSelection(
      raw(resumedOffset + 2),
      raw(resumedOffset + 3),
      choice,
      next.CellFrom,
      victimId
    )
  };
}

// A verified offer preserves unrelated lists. A resolved choice suspends the
// participants. Only a linked armor step can support later profile continuity.
export function animalSavageryTraitTransitions(
  replay: ReplayModel,
  owners: OwnershipTimeline
): ReadonlyMap<string, { players: readonly string[]; damageThrough?: number }> {
  const scopes = new Map<
    string,
    { players: readonly string[]; damageThrough?: number }
  >();
  if (
    !replay.turns.some((turn) =>
      turn.events.some((event) => event.sourceTag === "QuestionAnimalSavagery")
    )
  )
    return scopes;
  const sources = new Map(
    replay.turns.flatMap((turn) =>
      turn.events.map((event) => [event.id, event] as const)
    )
  );
  for (const offer of sources.values()) {
    if (
      offer.sourceTag !== "QuestionAnimalSavagery" ||
      !offer.id ||
      !offer.sourceIndex
    )
      continue;
    const at = (offset: number) =>
      sources.get(`source-${offer.sourceIndex! + offset}`);
    const kept = at(-1),
      choice = at(-2),
      resumed = at(-3),
      marker = at(-4);
    const first =
      marker?.sourceTag === "Carrier" && marker.checkpointCarrier === true
        ? at(-5)
        : marker;
    if (
      !kept ||
      !resumed ||
      !choice ||
      !first ||
      !kept.playerId ||
      kept.executionExclusion ||
      offer.executionExclusion ||
      choice.executionExclusion ||
      kept.sourceTag !== "ResultRoll" ||
      first.sourceTag !== "QuestionTeamRerollUsage" ||
      choice.sourceTag !== "ResultTeamRerollUsage" ||
      choice.payload?.Used !== 0 ||
      !hasOnly(choice.payload, ["Used", "GamerId"]) ||
      !messageInStep(resumed, choice, 0) ||
      first.playerId !== kept.playerId ||
      first.stepActorId !== kept.stepActorId ||
      first.stepTargetId !== kept.stepTargetId ||
      first.stepTag !== "PlayerStep" ||
      first.stepType !== 0 ||
      first.attributionConflict ||
      first.executionExclusion ||
      first.locator?.replayStep === undefined ||
      kept.locator?.replayStep !== first.locator.replayStep + 1 ||
      first.locator.childIndex !== kept.locator.childIndex
    )
      continue;
    const originalSlot = first.locator.messageIndex;
    const originalHeader =
      (originalSlot === 2 || originalSlot === 3) &&
      first.sourceIndex !== undefined &&
      sources.get(`source-${first.sourceIndex - originalSlot - 1}`);
    if (
      !originalHeader ||
      originalHeader.sourceTag !== "PlayerStep" ||
      resumed.sourceTag !== "PlayerStep" ||
      originalHeader.payload?.Skill !== 0 ||
      resumed.payload?.Skill !== 0 ||
      originalHeader.payload.IsEvaluation !== 0 ||
      resumed.payload.IsEvaluation !== 0 ||
      !messageInStep(originalHeader, first, originalSlot!) ||
      !sameCell(originalHeader.payload.CellFrom, resumed.payload.CellFrom) ||
      !sameCell(originalHeader.payload.CellTo, resumed.payload.CellTo)
    )
      continue;
    const team = ownerAt(owners, kept.playerId, kept);
    if (
      team === undefined ||
      String(choice.payload.GamerId) !== team ||
      String(first.payload?.GamerId) !== team ||
      ownerAt(owners, kept.playerId, first) !== team ||
      first.payload?.CanUseTeamReroll !== 1 ||
      first.payload.CanUseProReroll !== 0 ||
      first.payload.StarSpecialRule !== -1
    )
      continue;
    const original = first.payload.RollInfos;
    if (!original || typeof original !== "object" || Array.isArray(original))
      continue;
    const draw = readActivationDie(
      first,
      original as Record<string, unknown>,
      84,
      1,
      1,
      owners,
      team
    );
    const repeated = readActivationDie(
      kept,
      kept.payload,
      84,
      1,
      0,
      owners,
      team
    );
    if (
      !draw ||
      draw.passed ||
      !repeated ||
      repeated.passed ||
      repeated.face !== draw.face ||
      repeated.target !== draw.target
    )
      continue;
    const outcome = observeAnimalSavageryOutcome(kept, sources, owners);
    if (
      outcome?.kind !== "teammate_selected" ||
      outcome.offerSourceId !== offer.id
    )
      continue;
    const armor = sources.get(outcome.armorSourceId);
    const terminal =
      armor &&
      lastDamageMessage(armor, (index) => sources.get(`source-${index}`));
    scopes.set(offer.id, { players: [] });
    scopes.set(outcome.selectionSourceId, {
      players: [kept.playerId, outcome.victimId],
      damageThrough: terminal?.sourceIndex
    });
  }
  return scopes;
}

function lastDamageMessage(
  armor: ReplayEvent,
  get: (index: number) => ReplayEvent | undefined
) {
  const header = get(armor.sourceIndex! - 1);
  if (!header) return;
  let end = armor;
  // These notifications belong to the bounded source-16 damage step. Stop
  // before a choice or unknown mutation, even if an ordinary wait follows.
  for (const tag of [
    "ResultSkillUsage",
    "ResultInjuryRoll",
    "ResultCasualtyRoll",
    "ResultPlayerRemoval"
  ]) {
    const next = get(end.sourceIndex! + 1);
    if (next?.sourceTag !== tag) continue;
    const payload = next.payload;
    if (
      !messageInStep(header, next, end.locator!.messageIndex! + 1) ||
      next.executionExclusion ||
      !payload ||
      (tag === "ResultSkillUsage"
        ? !hasOnly(payload, ["PlayerId", "Skill", "Used"]) ||
          payload.PlayerId !== Number(header.playerId) ||
          ![59, 63].includes(Number(payload.Skill)) ||
          payload.Used !== 1
        : tag === "ResultPlayerRemoval"
          ? !hasOnly(payload, ["PlayerId", "Situation", "Reason", "Status"]) ||
            payload.PlayerId !== Number(header.playerId)
          : payload.Source !== 16)
    )
      return;
    end = next;
  }
  return end;
}

// An exact wait, settled board and actual next declaration identify the next
// actor. The snapshots preserve recorded flags and make no claim about an
// unobserved action the original player or victim might have taken.
export function observeAnimalSavageryContinuation(
  first: ReplayEvent,
  kept: ReplayEvent,
  outcome: AnimalSavageryOutcome,
  sources: ReadonlyMap<string | undefined, ReplayEvent>,
  ownership: OwnershipTimeline,
  checkpoints: readonly ReplayBoardCheckpoint[],
  epochs: ReadonlyMap<ReplayBoardCheckpoint, number>
): AnimalSavageryContinuation | undefined {
  const get = (index: number) => sources.get(`source-${index}`);
  const choice =
    outcome.kind === "teammate_selected"
      ? sources.get(outcome.selectionSourceId)
      : undefined;
  const armor =
    outcome.kind === "teammate_selected"
      ? sources.get(outcome.armorSourceId)
      : undefined;
  const damage = armor && get(armor.sourceIndex! - 1);
  const end =
    outcome.kind === "actor_effect"
      ? sources.get(outcome.effectSourceId)
      : armor && lastDamageMessage(armor, get);
  const anchor = choice ?? kept;
  if (
    !end?.locator ||
    !end.sourceIndex ||
    !anchor.locator ||
    !anchor.sourceIndex ||
    !kept.playerId
  )
    return;
  const targetHeader = get(
    anchor.sourceIndex - (anchor.locator.messageIndex ?? -1) - 1
  );
  const standBy = get(end.sourceIndex + 1);
  if (
    !standBy?.id ||
    standBy.locator?.replayStep !== end.locator.replayStep ||
    standBy.locator?.childIndex !== (end.locator.childIndex ?? -2) + 1
  )
    return;
  const afterWait = get(end.sourceIndex + 2);
  const nextHeader =
    afterWait?.sourceTag === "Carrier" && afterWait.checkpointCarrier === true
      ? get(end.sourceIndex + 3)
      : afterWait;
  const following = nextHeader?.sourceIndex && get(nextHeader.sourceIndex + 1);
  if (
    !nextHeader ||
    nextHeader.sourceTag !== "PlayerStep" ||
    nextHeader.stepType !== 0 ||
    nextHeader.payload?.Skill !== 0 ||
    nextHeader.payload.IsEvaluation !== 0 ||
    nextHeader.locator?.replayStep !== (end.locator.replayStep ?? -2) + 1 ||
    !following ||
    !following.id ||
    !following.playerId ||
    following.playerId === kept.playerId ||
    !following.sourceIndex ||
    !messageInStep(nextHeader, following, 0) ||
    following.sourceTag !== "ResultUseAction" ||
    following.payload?.TeamId !== 0 ||
    following.payload.Action !== following.actionCode ||
    ![1, 2, 3, 4, 5, 6].includes(following.actionCode ?? 0) ||
    !hasOnly(following.payload, ["Action", "TeamId"]) ||
    following.executionExclusion
  )
    return;

  const before = lastBoardCheckpointBefore(checkpoints, anchor.sourceIndex);
  const after = lastBoardCheckpointBefore(checkpoints, following.sourceIndex);
  const beforeSource =
    outcome.kind === "teammate_selected"
      ? sources.get(outcome.offerSourceId)
      : first;
  const a = before?.board,
    b = after?.board;
  const team = ownerAt(ownership, kept.playerId, kept);
  if (
    !before ||
    !after ||
    !a ||
    !b ||
    team === undefined ||
    before.status !== "observed" ||
    after.status !== "observed" ||
    a.issues.length ||
    b.issues.length ||
    before.afterSourceIndex !== beforeSource?.sourceIndex ||
    before.replayStep !== (anchor.locator.replayStep ?? -2) - 1 ||
    after.afterSourceIndex !== standBy.sourceIndex ||
    after.replayStep !== end.locator.replayStep ||
    after.childIndex !== standBy.locator.childIndex + 1 ||
    b.stable !== true ||
    a.activeGamerId !== Number(team) ||
    b.activeGamerId !== Number(team) ||
    a.activePlayerId !== Number(kept.playerId) ||
    b.activePlayerId !== Number(kept.playerId) ||
    epochs.get(before) !== epochs.get(after) ||
    !consistentNormalStandBy(standBy, a, b) ||
    ownerAt(ownership, following.playerId, following) !== team
  )
    return;
  const aTeam = a.teams.find(
    (roster) => roster.rosterIndex === a.activeTeamIndex
  );
  const bTeam = b.teams.find(
    (roster) => roster.rosterIndex === b.activeTeamIndex
  );
  const turn = aTeam?.gameTurn;
  if (
    !aTeam ||
    !bTeam ||
    String(aTeam.explicitTeamId) !== team ||
    String(bTeam.explicitTeamId) !== team ||
    !turn ||
    bTeam.gameTurn !== turn
  )
    return;
  const unique = (players: typeof aTeam.players, id: string) => {
    const matches = players.filter((player) => String(player.id) === id);
    return matches.length === 1 ? matches[0] : undefined;
  };
  const original = unique(aTeam.players, kept.playerId);
  const later = unique(bTeam.players, kept.playerId);
  const teammate = unique(bTeam.players, following.playerId);
  const actorCell = targetHeader?.payload?.CellFrom;
  if (
    !original ||
    !later ||
    !teammate ||
    original.pitchLocation !== "on_pitch" ||
    later.pitchLocation !== "on_pitch" ||
    teammate.pitchLocation !== "on_pitch" ||
    original.canAct !== true ||
    teammate.canAct !== true ||
    !observedAt(original, actorCell) ||
    !observedAt(later, actorCell) ||
    !observedAt(teammate, nextHeader.payload.CellFrom)
  )
    return;

  const continuation: AnimalSavageryContinuation = {
    beforeCheckpointAfter: before.afterSourceIndex,
    afterCheckpointAfter: after.afterSourceIndex,
    standBySourceId: standBy.id,
    followingActivationSourceId: following.id,
    followingPlayerId: following.playerId,
    teamTurn: turn,
    actorRecordedCanAct: later.canAct
  };
  if (outcome.kind === "teammate_selected") {
    const priorVictim = unique(aTeam.players, outcome.victimId);
    const laterVictim = unique(bTeam.players, outcome.victimId);
    const location = laterVictim?.pitchLocation;
    if (
      !priorVictim ||
      priorVictim.pitchLocation !== "on_pitch" ||
      !observedAt(priorVictim, damage?.payload?.CellFrom) ||
      !laterVictim ||
      (location !== "on_pitch" && location !== "off_pitch")
    )
      return;
    continuation.victim = {
      beforeRecordedCanAct: priorVictim.canAct,
      afterRecordedCanAct: laterVictim.canAct,
      afterPitchLocation: location,
      afterStatusCode: laterVictim.statusCode,
      afterSituationCode: laterVictim.situationCode
    };
  }
  return continuation;
}
