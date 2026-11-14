import { preservesTraitContinuity, scopedTraitEffectPlayer } from "./traitTransitions";
import type { ReplayEvent, ReplayModel } from "./types";
import type { ObservedPlayerTraits } from "./playerTraits";
import type { ObservedBoard, ReplayBoardCheckpoint } from "./boardState";
import { createOwnershipTimeline, type OwnershipTimeline } from "./ownershipTimeline";

export type CurrentTraitEvidence = {
  playerId: string;
  teamId: string;
  rosterIndex: number;
  observedCheckpointAfter: number;
  currentCheckpointAfter: number;
  prayersCheckpointAfter: number;
  onPitch: boolean;
  tackleZone: boolean | null;
  statusCode: number | null;
  traits: ObservedPlayerTraits;
};
export type BlockTraitEvidence = {
  attacker: CurrentTraitEvidence;
  defender: CurrentTraitEvidence;
};

export { preservesTraitContinuity } from "./traitTransitions";

function complete(p: ObservedPlayerTraits | null) {
  return (
    p !== null &&
    p.dataPlayerId !== null &&
    p.playerTypeId !== null &&
    p.innateSkills !== null &&
    p.acquiredSkills !== null
  );
}
function rosterTeamIds(board: ObservedBoard, known: readonly string[]) {
  if (
    known.length !== 2 ||
    new Set(known).size !== 2 ||
    board.teams.length !== 2
  )
    return;
  const explicit = board.teams.map((t) =>
    t.explicitTeamId === null ? null : String(t.explicitTeamId)
  );
  if (
    explicit.every((x) => x === null) ||
    explicit.some((x) => x !== null && !known.includes(x))
  )
    return;
  const resolved = explicit.map(
    (x, i) => x ?? known.find((k) => k !== explicit[1 - i])
  );
  return resolved[0] !== resolved[1] ? (resolved as string[]) : undefined;
}

// Intrinsic traits survive only observed roster identity and supported messages.
// A complete refresh replaces the seed. A partial refresh may corroborate an
// existing instance only when its explicit identity and every present skill
// list agree. It cannot seed knowledge or supply a missing list by itself.
// Missing physical/clock fields remain unknown; no observation is mutated.
function visitCurrentTraits(
  replay: ReplayModel,
  visit: (
    event: ReplayEvent,
    current: ReplayBoardCheckpoint | undefined,
    ledger: ReadonlyMap<string, CurrentTraitEvidence>
  ) => void,
  owners:OwnershipTimeline=createOwnershipTimeline(replay)
) {
  if (replay.replayVersion !== "1-4-0-0") return;
  const known = replay.teams.map((t) => t.id);
  const ledger = new Map<string, CurrentTraitEvidence>();
  const emptyPrayers = new Map<number, number>();
  const checkpoints = replay.boardCheckpoints ?? [];
  let cursor = 0,
    current: ReplayBoardCheckpoint | undefined,
    previousCheckpoint: ReplayBoardCheckpoint | undefined,
    previousIndex = -1;
  function observe(cp: ReplayBoardCheckpoint) {
    const board = cp.board,
      teams = board && rosterTeamIds(board, known);
    if (
      !board ||
      !board.effectsKnownEmpty ||
      board.issues.length ||
      !teams ||
      cp.status !== "observed"
    ) {
      ledger.clear();
      emptyPrayers.clear();
      return;
    }
    const ids = board.teams.flatMap((t) => t.players.map((p) => String(p.id)));
    if (
      ids.length > 128 ||
      new Set(ids).size !== ids.length ||
      ids.includes("null")
    ) {
      ledger.clear();
      emptyPrayers.clear();
      return;
    }
    const present = new Set(ids);
    for (const team of board.teams) {
      if (team.prayersKnownEmpty === true)
        emptyPrayers.set(team.rosterIndex, cp.afterSourceIndex);
      else if (team.prayersKnownEmpty === false)
        emptyPrayers.delete(team.rosterIndex);
    }
    for (const id of ledger.keys()) if (!present.has(id)) ledger.delete(id);
    for (const [i, team] of board.teams.entries())
      for (const player of team.players) {
        const id = String(player.id),
          teamId = teams[i]!,
          old = ledger.get(id);
        if (
          !team.transformationsKnownAbsent ||
          !team.effectsKnownEmpty ||
          !emptyPrayers.has(team.rosterIndex) ||
          !player.effectsKnownEmpty ||
          (()=>{const proof=owners.atIndex(id,cp.afterSourceIndex+1);return proof.status!=="confirmed" || proof.proof.teamId!==teamId;})()
        ) {
          ledger.delete(id);
          continue;
        }
        if (player.traitsDataPresent) {
          if (
            complete(player.traits) &&
            player.traits!.dataPlayerId === player.id &&
            (player.traitsDataTeamId === null ||
              player.traitsDataTeamId === undefined ||
              String(player.traitsDataTeamId) === teamId)
          ) {
            ledger.set(id, {
              playerId: id,
              teamId,
              rosterIndex: team.rosterIndex,
              observedCheckpointAfter: cp.afterSourceIndex,
              currentCheckpointAfter: cp.afterSourceIndex,
              prayersCheckpointAfter: emptyPrayers.get(team.rosterIndex)!,
              onPitch: player.pitchLocation === "on_pitch",
              tackleZone: player.tackleZone,
              statusCode: player.statusCode,
              traits: structuredClone(player.traits!)
            });
          } else if (
            old &&
            old.teamId === teamId &&
            old.rosterIndex === team.rosterIndex &&
            player.traits?.dataPlayerId === player.id &&
            player.traits.playerTypeId === old.traits.playerTypeId &&
            (player.traitsDataTeamId == null ||
              String(player.traitsDataTeamId) === teamId) &&
            ["innateSkills", "acquiredSkills"].every((key) => {
              const list =
                player.traits![key as "innateSkills" | "acquiredSkills"];
              return (
                list === null ||
                JSON.stringify(list) ===
                  JSON.stringify(
                    old.traits[key as "innateSkills" | "acquiredSkills"]
                  )
              );
            })
          ) {
            ledger.set(id, {
              ...old,
              currentCheckpointAfter: cp.afterSourceIndex,
              prayersCheckpointAfter: emptyPrayers.get(team.rosterIndex)!,
              onPitch: player.pitchLocation === "on_pitch",
              tackleZone: player.tackleZone,
              statusCode: player.statusCode
            });
          } else ledger.delete(id);
        } else if (
          old &&
          old.teamId === teamId &&
          old.rosterIndex === team.rosterIndex
        ) {
          ledger.set(id, {
            ...old,
            currentCheckpointAfter: cp.afterSourceIndex,
            prayersCheckpointAfter: emptyPrayers.get(team.rosterIndex)!,
            onPitch: player.pitchLocation === "on_pitch",
            tackleZone: player.tackleZone,
            statusCode: player.statusCode
          });
        } else ledger.delete(id);
      }
  }
  for (const turn of replay.turns)
    for (const event of turn.events) {
      const index = event.sourceIndex;
      if (index === undefined || index <= previousIndex) {
        ledger.clear();
        emptyPrayers.clear();
        continue;
      }
      previousIndex = index;
      while (
        cursor < checkpoints.length &&
        checkpoints[cursor]!.afterSourceIndex < index
      ) {
        current = checkpoints[cursor++]!;
        const previous = previousCheckpoint;
        previousCheckpoint = current;
        // A malformed later refresh cannot erase an already recorded prefix.
        // At that refresh, invalidate continuity rather than borrowing it.
        if (previous && (
          current.afterSourceIndex < previous.afterSourceIndex ||
          (current.afterSourceIndex === previous.afterSourceIndex &&
            !orderedSameIndexCheckpoints(previous, current))
        )) {
          ledger.clear();
          emptyPrayers.clear();
          continue;
        }
        observe(current);
      }
      visit(event, current, ledger);
      const affectedByEffect = scopedTraitEffectPlayer(event);
      if (
        [
          "EventBuyMercenary",
          "EventRemoveMercenary",
          "ResultPlayerRemoval",
          "ResultPlayerSentOff"
        ].includes(event.sourceTag) &&
        event.playerId
      ) {
        ledger.delete(event.playerId);
      } else if (affectedByEffect !== undefined) {
        ledger.delete(affectedByEffect);
      } else if (!preservesTraitContinuity(event)) {
        ledger.clear();
        emptyPrayers.clear();
      }
    }
}

// Several boards can precede the next emitted event. Their physical XML
// locations establish refresh order even when the event coordinate is equal.
// Equal or missing physical locations never establish a continuation.
function orderedSameIndexCheckpoints(a: ReplayBoardCheckpoint, b: ReplayBoardCheckpoint) {
  const located = (c: ReplayBoardCheckpoint) =>
    c.kind === "board" && Number.isSafeInteger(c.replayStep) &&
    c.replayStep! > 0 && Number.isSafeInteger(c.childIndex) && c.childIndex! >= 0;
  if (!located(b)) return false;
  if (a.kind === "initial")
    return a.replayStep === null && a.childIndex === null && a.afterSourceIndex === 0;
  return located(a) && (b.replayStep! > a.replayStep! ||
    (b.replayStep === a.replayStep && b.childIndex! > a.childIndex!));
}

export function findBlockTraitEvidence(replay: ReplayModel,owners?:OwnershipTimeline) {
  const result = new Map<string, BlockTraitEvidence>();
  visitCurrentTraits(replay, (event, current, ledger) => {
    if (
      event.sourceTag === "QuestionBlockDice" &&
      event.id &&
      event.stepTag === "PlayerStep" &&
      event.stepType === 6 &&
      !event.attributionConflict &&
      event.actorTeamSource !== "turn_inferred" &&
      current?.board?.phaseCode === 5
    ) {
      const attacker = ledger.get(event.stepActorId ?? ""),
        defender = ledger.get(event.stepTargetId ?? "");
      if (
        attacker &&
        defender &&
        attacker.teamId !== defender.teamId &&
        event.playerId === attacker.playerId &&
        event.actorTeamId === attacker.teamId &&
        event.sourceIndex !== undefined &&
        current.afterSourceIndex < event.sourceIndex
      )
        result.set(event.id, {
          attacker: structuredClone(attacker),
          defender: structuredClone(defender)
        });
    }
  },owners);
  return result;
}

// Selected subjects receive a separate continued-trait receipt. No omitted
// physical state, raw pre-roll field or ownership is restored by this lookup.
export function findSubjectTraitEvidence(
  replay: ReplayModel,
  subjects: ReadonlyMap<string, string>,
  owners?:OwnershipTimeline
) {
  const result = new Map<string, CurrentTraitEvidence>();
  if (!subjects.size) return result;
  visitCurrentTraits(replay, (event, current, ledger) => {
    const subject = event.id ? subjects.get(event.id) : undefined;
    const evidence = subject ? ledger.get(subject) : undefined;
    if (
      event.id &&
      subject &&
      evidence &&
      current?.board?.phaseCode === 5 &&
      event.sourceIndex !== undefined &&
      current.afterSourceIndex < event.sourceIndex &&
      event.playerId === subject &&
      event.actorTeamId === evidence.teamId &&
      !event.attributionConflict &&
      event.actorTeamSource !== "turn_inferred"
    )
      result.set(event.id, structuredClone(evidence));
  },owners);
  return result;
}

// A separately identified participant need not be the current record's subject
// (for example, the blocker when the injury record names its victim). Resolve
// that participant's own time-local ownership; never relabel the event actor.
export function findParticipantTraitEvidence(
  replay: ReplayModel,
  participants: ReadonlyMap<string, string>,
  owners: OwnershipTimeline
) {
  const result = new Map<string, CurrentTraitEvidence>();
  if (!participants.size) return result;
  visitCurrentTraits(replay, (event, current, ledger) => {
    const id = event.id ? participants.get(event.id) : undefined;
    const evidence = id ? ledger.get(id) : undefined;
    const owner = id ? owners.resolve(id, event) : undefined;
    if (event.id && evidence && current?.board?.phaseCode === 5 &&
      event.sourceIndex !== undefined && current.afterSourceIndex < event.sourceIndex &&
      owner?.status === "confirmed" && owner.proof.teamId === evidence.teamId)
      result.set(event.id, structuredClone(evidence));
  }, owners);
  return result;
}

// Decision-time knowledge, after block dice. This must not be used as an
// earlier pre-roll skill or position observation.
export function findPushTraitEvidence(replay: ReplayModel, owners?: OwnershipTimeline) {
  const result = new Map<string, { checkpointAfter: number; players: CurrentTraitEvidence[] }>();
  visitCurrentTraits(replay, (event, current, ledger) => {
    if(event.sourceTag!=="QuestionPushBack" || !event.id || !current) return;
    result.set(event.id, {checkpointAfter:current.afterSourceIndex,players:Array.from(ledger.values()).filter(p=>p.onPitch)});
  }, owners);
  return result;
}
