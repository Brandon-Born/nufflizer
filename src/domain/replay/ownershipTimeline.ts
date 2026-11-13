import type { ReplayEvent, ReplayModel } from "./types";
import type { ObservedPlayer, ReplayBoardCheckpoint } from "./boardState";
import { lastBoardCheckpointBefore } from "./boardState";
import {
  buildPlayerOwnershipIndex,
  type PlayerOwnershipIndex
} from "./attribution";
import { observeRecruitmentPurchases } from "./recruitment";
import { preservesTraitContinuity } from "./traitTransitions";

export type OwnershipProof = {
  playerId: string;
  teamId: string;
  basis: "initial_roster" | "current_roster" | "confirmed_recruitment";
  checkpointAfter?: number;
  identitySourceId?: string;
  playerTypeId?: number;
};
export type OwnershipResolution =
  | { status: "confirmed"; proof: OwnershipProof }
  | {
      status: "unresolved";
      reason:
        | "initial_overlap"
        | "current_roster_conflict"
        | "pending_identity"
        | "invalid_current_identity"
        | "unverified_transition"
        | "missing_evidence";
      playerId: string;
      initialTeamId?: string;
      observedTeamId?: string;
      checkpointAfter?: number;
      identitySourceId?: string;
    };
export type OwnershipTimeline = {
  initial: PlayerOwnershipIndex;
  resolve: (playerId: string, event: ReplayEvent) => OwnershipResolution;
  atIndex: (playerId: string, sourceIndex: number) => OwnershipResolution;
};
export type OwnershipLookup = ReadonlyMap<string, string> | OwnershipTimeline;
export function ownerAt(
  owners: OwnershipLookup,
  playerId: string,
  event: ReplayEvent
) {
  if (!("resolve" in owners)) return owners.get(playerId);
  const value = owners.resolve(playerId, event);
  return value.status === "confirmed" ? value.proof.teamId : undefined;
}
function integer(value: unknown) {
  if (typeof value === "string" && /^\d{1,16}$/.test(value))
    value = Number(value);
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}
function lastBefore<T>(
  values: readonly T[],
  index: number,
  source: (value: T) => number
) {
  let low = 0,
    high = values.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (source(values[mid]!) < index) low = mid + 1;
    else high = mid;
  }
  return low ? values[low - 1] : undefined;
}
function identity(player: ObservedPlayer) {
  return {
    id:
      player.traitsDataPlayerId === undefined
        ? player.traits?.dataPlayerId
        : player.traitsDataPlayerId,
    type:
      player.traitsPlayerTypeId === undefined
        ? player.traits?.playerTypeId
        : player.traitsPlayerTypeId
  };
}

const usageFields: Readonly<Record<string, readonly string[]>> = {
  ResultBombExplosion: ["Cell"],
  ResultAnimalSavagery: ["VictimId"],
  ResultApothecary: ["PlayerStatus", "ApothecaryUsed", "Casualty", "IsInjury"],
  ResultStarSpecialRuleUsage: [
    "PlayerId",
    "StarSpecialRule",
    "Used",
    "TargetId"
  ],
  ResultTeamSpecialRuleUsage: ["Used", "Rule"],
  QuestionApothecaryCasualtyChoice: ["GamerId", "NewRoll", "OriginalRoll"],
  ResultNoContest: []
};

// Known action, injury/effect and choice records retain roster-instance IDs.
// This does not certify their dice policy, skills, controller or availability.
// Unknown sources and unsupported typed step/effect layouts break continuity; catalogue
// purchases/removals have separate per-ID mutation boundaries below.
export function preservesRosterOwnership(event: ReplayEvent) {
  if (event.sourceTag === "PlayerStep" || event.sourceTag === "AccuracyStep") {
    if (
      Object.keys(event.payload ?? {}).some(
        (k) =>
          ![
            "Probability",
            "PlayerId",
            "TargetId",
            "TeamId",
            "IsEvaluation",
            "StepType",
            "CellTo",
            "State",
            "CellFrom",
            "Skill",
            "FinalCell"
          ].includes(k)
      )
    )
      return false;
    return (
      event.stepType !== undefined &&
      Number.isInteger(event.stepType) &&
      event.stepType >= 0 &&
      event.stepType <= 38 &&
      (event.payload?.Skill === undefined ||
        (Number.isSafeInteger(event.payload.Skill) &&
          Number(event.payload.Skill) >= -1)) &&
      (event.payload?.IsEvaluation === undefined ||
        [0, 1].includes(Number(event.payload.IsEvaluation)))
    );
  }
  const p = event.payload;
  if (event.sourceTag === "ThrowTeamMateStep")
    return (
      event.stepType === 13 &&
      p?.IsEvaluation === 0 &&
      Object.keys(p).every((k) =>
        [
          "Probability",
          "IsEvaluation",
          "StepType",
          "ThrowerId",
          "ThrownMateId",
          "CellTo",
          "CellFrom",
          "State",
          "Skill"
        ].includes(k)
      ) &&
      integer(p.ThrowerId) !== undefined &&
      integer(p.ThrownMateId) !== undefined
    );
  if (event.sourceTag === "DamageStep")
    return (
      !!p &&
      Object.keys(p).every((k) =>
        [
          "Applied",
          "Probability",
          "Source",
          "PlayerId",
          "TargetId",
          "TeamId",
          "IsEvaluation",
          "StepType",
          "Skill",
          "State",
          "CellFrom",
          "CellTo"
        ].includes(k)
      ) &&
      (p.IsEvaluation === undefined ||
        [0, 1].includes(Number(p.IsEvaluation))) &&
      (p.Skill === undefined ||
        (Number.isSafeInteger(p.Skill) && Number(p.Skill) >= -1))
    );
  const usage = usageFields[event.sourceTag];
  if (usage) return !!p && Object.keys(p).every((k) => usage.includes(k));
  if (
    event.sourceTag === "EventAddPlayerEffect" ||
    event.sourceTag === "EventEndPlayerEffect" ||
    event.sourceTag === "ResultAddPlayerEffect" ||
    event.sourceTag === "ResultEndPlayerEffect"
  ) {
    const effect = p?.Effect as Record<string, unknown> | undefined;
    return (
      !!p &&
      Object.keys(p).every((k) => k === "PlayerId" || k === "Effect") &&
      integer(p.PlayerId) !== undefined &&
      !!effect &&
      !Array.isArray(effect) &&
      integer(effect.EffectId) !== undefined &&
      Object.keys(effect).every((k) =>
        [
          "EffectId",
          "ProviderType",
          "ProviderId",
          "Durations",
          "CharacModifiers",
          "AdditionalSkills"
        ].includes(k)
      )
    );
  }
  if (event.sourceTag === "ResultUseAction")
    return (
      integer(p?.Action) !== undefined &&
      !!p &&
      Object.keys(p).every((k) => k === "Action" || k === "TeamId")
    );
  if (event.sourceTag === "ResultSkillUsage")
    return (
      !!p &&
      Object.keys(p).every((k) => ["PlayerId", "Skill", "Used"].includes(k)) &&
      integer(p.PlayerId) !== undefined &&
      integer(p.Skill) !== undefined &&
      [0, 1, "0", "1"].includes(p.Used as string | number)
    );
  if (
    event.sourceTag === "ResultPlayerRemoval" ||
    event.sourceTag === "ResultPlayerSentOff"
  )
    return (
      !!p &&
      Object.keys(p).every((k) =>
        ["PlayerId", "Situation", "Reason", "Status"].includes(k)
      ) &&
      integer(p.PlayerId) !== undefined
    );
  if (event.sourceTag === "ResultGainSpp")
    return (
      !!p &&
      Object.keys(p).every((k) => k === "PlayerId" || k === "SppGained") &&
      integer(p.PlayerId) !== undefined &&
      integer(p.SppGained) !== undefined
    );
  if (event.sourceTag === "EventRoll" && event.rollType === 13)
    return (
      !!p &&
      Object.keys(p).every((k) =>
        [
          "Dice",
          "Difficulty",
          "Modifiers",
          "Outcome",
          "PlayerId",
          "Requirement",
          "RollType",
          "TeamId"
        ].includes(k)
      ) &&
      integer(p.PlayerId) !== undefined
    );
  if (event.sourceTag === "EventIntensiveTrainingSkill")
    return (
      !!p &&
      Object.keys(p).every((k) =>
        ["PlayerId", "TeamId", "Skill", "Prayer"].includes(k)
      ) &&
      integer(p.PlayerId) !== undefined &&
      integer(p.Skill) !== undefined
    );
  if (event.sourceTag === "EventFaceUpStunnedPlayers")
    return (
      !!p && Object.keys(p).every((k) => k === "PitchRolls" || k === "Players")
    );
  // Parser conflicts are evidence to reconcile per player, not game mutations.
  return preservesTraitContinuity(
    event.attributionConflict ? { ...event, attributionConflict: false } : event
  );
}

// Membership is an ownership observation, independent of position, activity,
// effects, readable names and skill-list completeness. At least one explicit
// team ID is needed; only its known opposite can qualify an omitted roster ID.
function memberAt(
  cp: ReplayBoardCheckpoint | undefined,
  id: string,
  known: readonly string[]
) {
  const board = cp?.status === "observed" ? cp.board : null;
  if (
    !board ||
    board.teams.length !== 2 ||
    known.length !== 2 ||
    new Set(known).size !== 2
  )
    return;
  const explicit = board.teams.map((t) =>
    t.explicitTeamId === null ? null : String(t.explicitTeamId)
  );
  if (explicit.every((t) => t === null)) return;
  if (
    explicit.some((t) => t !== null && !known.includes(t)) ||
    (explicit[0] !== null && explicit[0] === explicit[1])
  ) {
    if (board.teams.some((t) => t.players.some((p) => String(p.id) === id)))
      return { conflict: true as const };
    return;
  }
  const teams = explicit.map(
    (t, i) => t ?? known.find((k) => k !== explicit[1 - i])
  );
  if (!teams[0] || !teams[1] || teams[0] === teams[1]) return;
  const members = board.teams.flatMap((t, i) =>
    t.players
      .filter((p) => p.id !== null && String(p.id) === id)
      .map((player) => ({ player, teamId: teams[i]! }))
  );
  if (members.length > 1) return { conflict: true as const };
  const member = members[0];
  if (!member) return;
  const data = identity(member.player);
  if (
    (data.id != null && String(data.id) !== id) ||
    (member.player.traitsDataTeamId != null &&
      String(member.player.traitsDataTeamId) !== member.teamId)
  )
    return { conflict: true as const };
  return { ...member, conflict: false as const, data };
}

// A time-local index, not a mutable global player map. It never consults a
// future checkpoint. A selected recruitment binds only at its independently
// checked first following roster; an intervening removal/replacement blocks it.
// Identity observations do not restore omitted traits, clocks or availability.
export function createOwnershipTimeline(
  replay: ReplayModel
): OwnershipTimeline {
  const initial = buildPlayerOwnershipIndex(replay),
    known = replay.teams.map((t) => t.id),
    checkpoints = replay.boardCheckpoints ?? [];
  const supported = replay.replayVersion === "1-4-0-0";
  const ordered = checkpoints.every(
    (c, i) =>
      i === 0 || c.afterSourceIndex >= checkpoints[i - 1]!.afterSourceIndex
  );
  const purchases = new Map(
    observeRecruitmentPurchases(replay).map((p) => [p.sourceId, p])
  );
  const mutations = new Map<string, ReplayEvent[]>(),
    unsafe: number[] = [];
  for (const event of replay.turns.flatMap((t) => t.events)) {
    if (event.sourceIndex === undefined) continue;
    const mutating =
      event.sourceTag === "EventBuyMercenary" ||
      event.sourceTag === "EventRemoveMercenary";
    const id = mutating ? integer(event.payload?.MercenaryId) : undefined;
    if (id !== undefined) {
      const values = mutations.get(String(id)) ?? [];
      values.push(event);
      mutations.set(String(id), values);
    } else if (!preservesRosterOwnership(event)) unsafe.push(event.sourceIndex);
  }
  unsafe.sort((a, b) => a - b);
  for (const values of mutations.values())
    values.sort((a, b) => a.sourceIndex! - b.sourceIndex!);
  // Compress changes and renewals after an unsafe boundary. A later omission
  // cannot erase a conflict or fill physical state. The proof keeps the actual
  // positive roster checkpoint at which ownership was established.
  type Observation = {
    after: number;
    teamId?: string;
    conflict: boolean;
    dataId?: number | null;
    playerTypeId?: number | null;
    epoch: number;
    mutation: number;
  };
  const observations = new Map<string, Observation[]>(),
    lastKey = new Map<string, string>();
  if (supported && ordered)
    for (const cp of checkpoints) {
      const epoch = lastBefore(unsafe, cp.afterSourceIndex + 1, (n) => n) ?? -1;
      const ids = new Set(
        cp.board?.teams.flatMap((t) =>
          t.players.flatMap((p) => (p.id === null ? [] : [String(p.id)]))
        ) ?? []
      );
      for (const id of ids) {
        const member = memberAt(cp, id, known);
        if (!member) continue;
        const mutation =
          lastBefore(
            mutations.get(id) ?? [],
            cp.afterSourceIndex + 1,
            (e) => e.sourceIndex!
          )?.sourceIndex ?? -1;
        const values = observations.get(id) ?? [],
          prior = values.at(-1);
        const inherited =
          !member.conflict &&
          prior &&
          !prior.conflict &&
          prior.teamId === member.teamId &&
          prior.epoch === epoch &&
          prior.mutation === mutation;
        const dataId =
          !member.conflict && member.data.id === Number(id)
            ? member.data.id
            : inherited
              ? prior.dataId
              : undefined;
        const type =
          !member.conflict &&
          member.data.id === Number(id) &&
          member.data.type != null
            ? member.data.type
            : inherited
              ? prior.playerTypeId
              : undefined;
        const key = JSON.stringify([
          epoch,
          mutation,
          member.conflict ? null : member.teamId,
          member.conflict,
          dataId,
          type
        ]);
        if (lastKey.get(id) === key) continue;
        lastKey.set(id, key);
        values.push({
          after: cp.afterSourceIndex,
          conflict: member.conflict,
          epoch,
          mutation,
          ...(member.conflict
            ? {}
            : { teamId: member.teamId, dataId, playerTypeId: type })
        });
        observations.set(id, values);
      }
    }
  function resolve(id: string, index: number): OwnershipResolution {
    const original = initial.playerToTeam.get(id);
    const baseline = (): OwnershipResolution =>
      original
        ? {
            status: "confirmed",
            proof: { playerId: id, teamId: original, basis: "initial_roster" }
          }
        : {
            status: "unresolved",
            playerId: id,
            reason: initial.ambiguousPlayerIds.has(id)
              ? "initial_overlap"
              : "missing_evidence"
          };
    if (!supported || !Number.isSafeInteger(index)) return baseline();
    if (!ordered)
      return {
        status: "unresolved",
        playerId: id,
        reason: "unverified_transition",
        ...(original ? { initialTeamId: original } : {})
      };
    const cp = lastBoardCheckpointBefore(checkpoints, index);
    const mutation = lastBefore(
      mutations.get(id) ?? [],
      index,
      (e) => e.sourceIndex!
    );
    const observed = lastBefore(
      observations.get(id) ?? [],
      index,
      (o) => o.after
    );
    const barrier = lastBefore(unsafe, index, (n) => n);
    const renewed =
      observed && (barrier === undefined || observed.after >= barrier);
    const failed = (
      reason: Extract<OwnershipResolution, { status: "unresolved" }>["reason"]
    ): OwnershipResolution => ({
      status: "unresolved",
      reason,
      playerId: id,
      ...(original ? { initialTeamId: original } : {}),
      ...(observed?.teamId ? { observedTeamId: observed.teamId } : {}),
      ...(observed
        ? { checkpointAfter: observed.after }
        : cp
          ? { checkpointAfter: cp.afterSourceIndex }
          : {}),
      ...(mutation?.id ? { identitySourceId: mutation.id } : {})
    });
    if (
      observed?.conflict &&
      (!mutation || observed.after >= mutation.sourceIndex!)
    )
      return failed("invalid_current_identity");
    if (mutation) {
      const selected = mutation.id ? purchases.get(mutation.id) : undefined;
      if (
        selected?.rosterTeamId &&
        selected.checkpointAfter !== null &&
        selected.checkpointAfter < index &&
        (barrier === undefined || selected.checkpointAfter >= barrier)
      ) {
        if (
          observed &&
          observed.after >= selected.checkpointAfter &&
          observed.teamId !== selected.rosterTeamId
        )
          return failed("current_roster_conflict");
        return {
          status: "confirmed",
          proof: {
            playerId: id,
            teamId: selected.rosterTeamId,
            basis: "confirmed_recruitment",
            checkpointAfter: selected.checkpointAfter,
            identitySourceId: mutation.id,
            playerTypeId: selected.playerTypeId
          }
        };
      }
      if (
        renewed &&
        !observed.conflict &&
        observed.after >= mutation.sourceIndex! &&
        observed.teamId &&
        (!initial.ambiguousPlayerIds.has(id) ||
          (observed.dataId === Number(id) && observed.playerTypeId != null))
      )
        return {
          status: "confirmed",
          proof: {
            playerId: id,
            teamId: observed.teamId,
            basis: "current_roster",
            checkpointAfter: observed.after,
            identitySourceId: mutation.id
          }
        };
      return failed("pending_identity");
    }
    if (initial.ambiguousPlayerIds.has(id)) return failed("initial_overlap");
    if (original && observed?.teamId && original !== observed.teamId)
      return failed("current_roster_conflict");
    if (original && barrier === undefined) return baseline();
    if (renewed && !observed.conflict && observed.teamId)
      return {
        status: "confirmed",
        proof: {
          playerId: id,
          teamId: observed.teamId,
          basis: "current_roster",
          checkpointAfter: observed.after
        }
      };
    return failed(
      original || observed ? "unverified_transition" : "missing_evidence"
    );
  }
  return {
    initial,
    atIndex: resolve,
    resolve: (id, event) => resolve(id, event.sourceIndex ?? NaN)
  };
}

// Private attribution view for downstream policies. Raw parser annotations are
// retained in the input model. Only a qualified new identity/current member can
// replace an inferred/player-map owner, or clear a resolved initial conflict.
export function applyCurrentOwnership(
  replay: ReplayModel,
  owners: OwnershipTimeline
): ReplayModel {
  return {
    ...replay,
    turns: replay.turns.map((turn) => ({
      ...turn,
      events: turn.events.map((event) => {
        if (!event.playerId) return event;
        const result = owners.resolve(event.playerId, event);
        if (result.status === "unresolved") {
          if (result.reason === "missing_evidence") return event;
          return { ...event, attributionConflict: true };
        }
        const proof = result.proof;
        if (proof.basis === "initial_roster") return event;
        if (
          (event.teamId && event.teamId !== proof.teamId) ||
          (event.actorTeamSource === "explicit" &&
            event.actorTeamId &&
            event.actorTeamId !== proof.teamId)
        )
          return { ...event, attributionConflict: true };
        return {
          ...event,
          actorTeamId: proof.teamId,
          actorTeamSource: "player_map",
          attributionConflict: false
        };
      })
    }))
  };
}
