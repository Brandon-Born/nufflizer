import {
  preservesTraitContinuity,
  scopedTraitEffectPlayer
} from "./traitTransitions";
import type { ReplayEvent, ReplayModel } from "./types";
import type { ObservedPlayerTraits } from "./playerTraits";
import type { ObservedBoard, ReplayBoardCheckpoint } from "./boardState";
import {
  createOwnershipTimeline,
  type OwnershipTimeline
} from "./ownershipTimeline";
import { animalSavageryTraitTransitions } from "./animalSavageryOutcome";
import { knownKoTraitTransition, koRemovalStarts } from "./koTraitContinuity";
import { recordedConfusedProvider } from "./mentalEffects";
import { bombTraitTransitions } from "./bombTraitContinuity";
import { refereeTraitTransitions } from "./refereeTraitContinuity";

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

type SuspendedProfile = {
  proof: CurrentTraitEvidence;
} & (
  | { state: "awaiting_off_pitch" | "knocked_out" | "recovered" }
  | { state: "effect_added" | "effect_observed" | "effect_ended" }
  | { state: "animal_choice"; damageThrough: number }
);

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
export function visitCurrentTraits(
  replay: ReplayModel,
  visit: (
    event: ReplayEvent,
    current: ReplayBoardCheckpoint | undefined,
    ledger: ReadonlyMap<string, CurrentTraitEvidence>
  ) => void,
  owners: OwnershipTimeline = createOwnershipTimeline(replay)
) {
  if (replay.replayVersion !== "1-4-0-0") return;
  const known = replay.teams.map((t) => t.id);
  const ledger = new Map<string, CurrentTraitEvidence>();
  const suspendedProfiles = new Map<string, SuspendedProfile>();
  const emptyPrayers = new Map<number, number>();
  const checkpoints = replay.boardCheckpoints ?? [];
  const animalChoices = animalSavageryTraitTransitions(replay, owners);
  let cursor = 0,
    current: ReplayBoardCheckpoint | undefined,
    previousCheckpoint: ReplayBoardCheckpoint | undefined,
    previousIndex = -1;
  let header: ReplayEvent | undefined;
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
      suspendedProfiles.clear();
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
      suspendedProfiles.clear();
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
    for (const id of suspendedProfiles.keys())
      if (!present.has(id)) suspendedProfiles.delete(id);
    for (const [i, team] of board.teams.entries())
      for (const player of team.players) {
        const id = String(player.id),
          teamId = teams[i]!,
          suspended = suspendedProfiles.get(id);
        let old = ledger.get(id);
        if (
          !team.transformationsKnownAbsent ||
          !team.effectsKnownEmpty ||
          !emptyPrayers.has(team.rosterIndex) ||
          (() => {
            const proof = owners.atIndex(id, cp.afterSourceIndex + 1);
            return (
              proof.status !== "confirmed" || proof.proof.teamId !== teamId
            );
          })()
        ) {
          ledger.delete(id);
          suspendedProfiles.delete(id);
          continue;
        }
        if (suspended) {
          const seed = suspended.proof;
          const sameRoster =
            seed.teamId === teamId && seed.rosterIndex === team.rosterIndex;
          const dataMatches =
            !player.traitsDataPresent ||
            (player.traitsDataPlayerId === player.id &&
              player.traitsPlayerTypeId === seed.traits.playerTypeId &&
              (player.traitsDataTeamId == null ||
                String(player.traitsDataTeamId) === teamId) &&
              (["innateSkills", "acquiredSkills"] as const).every((key) => {
                const list = player.traits?.[key];
                return (
                  list === null ||
                  JSON.stringify(list) === JSON.stringify(seed.traits[key])
                );
              }));
          const inBox =
            player.pitchLocation === "off_pitch" &&
            player.cell.x === -1 &&
            player.cell.y === -1;
          const onSafeBoard = board.phaseCode === 3 || board.phaseCode === 5;
          const inReserves =
            inBox &&
            player.situationCode === 1 &&
            (player.statusCode === null || player.statusCode === 0);
          const upright =
            onSafeBoard &&
            player.pitchLocation === "on_pitch" &&
            (player.situationCode === null || player.situationCode === 0) &&
            (player.statusCode === null || player.statusCode === 0);
          if (!sameRoster || !dataMatches) suspendedProfiles.delete(id);
          else if (
            suspended.state === "effect_added" ||
            suspended.state === "effect_observed"
          ) {
            if (
              player.animalSavageryEffect &&
              player.pitchLocation === "on_pitch" &&
              player.tackleZone !== true
            )
              suspended.state = "effect_observed";
            else suspendedProfiles.delete(id);
            // Active effects cannot seed a current eligible profile.
            ledger.delete(id);
            continue;
          } else if (!player.effectsKnownEmpty) suspendedProfiles.delete(id);
          else if (
            suspended.state === "awaiting_off_pitch" ||
            suspended.state === "knocked_out"
          ) {
            if (inBox && player.situationCode === 2 && player.statusCode === 3)
              suspended.state = "knocked_out";
            else suspendedProfiles.delete(id);
          } else if (suspended.state === "recovered") {
            if (upright && board.stable === true) {
              old = seed;
              suspendedProfiles.delete(id);
            } else if (!onSafeBoard || (!upright && !inReserves))
              suspendedProfiles.delete(id);
          } else if (
            suspended.state === "effect_ended" ||
            (suspended.state === "animal_choice" &&
              cp.afterSourceIndex >= suspended.damageThrough)
          ) {
            if (
              upright &&
              board.stable === true &&
              player.tackleZone === true
            ) {
              old = seed;
              suspendedProfiles.delete(id);
            } else if (
              !onSafeBoard ||
              (!inReserves &&
                (player.pitchLocation !== "on_pitch" ||
                  ![null, 0, 1, 2].includes(player.statusCode) ||
                  ![null, 0].includes(player.situationCode)))
            )
              suspendedProfiles.delete(id);
          }
        }
        if (!player.effectsKnownEmpty) {
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
            suspendedProfiles.delete(id);
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
  for (const turn of replay.turns) {
    const removals = koRemovalStarts(turn.events);
    const bomb = bombTraitTransitions(turn.events, owners);
    const referee = refereeTraitTransitions(turn.events, owners);
    for (const event of turn.events) {
      const index = event.sourceIndex;
      if (index === undefined || index <= previousIndex) {
        ledger.clear();
        suspendedProfiles.clear();
        emptyPrayers.clear();
        continue;
      }
      previousIndex = index;
      if (event.sourceTag === "PlayerStep") header = event;
      while (
        cursor < checkpoints.length &&
        checkpoints[cursor]!.afterSourceIndex < index
      ) {
        current = checkpoints[cursor++]!;
        const previous = previousCheckpoint;
        previousCheckpoint = current;
        // A malformed later refresh cannot erase an already recorded prefix.
        // At that refresh, invalidate continuity rather than borrowing it.
        if (
          previous &&
          (current.afterSourceIndex < previous.afterSourceIndex ||
            (current.afterSourceIndex === previous.afterSourceIndex &&
              !orderedSameIndexCheckpoints(previous, current)))
        ) {
          ledger.clear();
          suspendedProfiles.clear();
          emptyPrayers.clear();
          continue;
        }
        observe(current);
      }
      visit(event, current, ledger);
      const affectedByEffect = scopedTraitEffectPlayer(event, header);
      const affectedByChoice = event.id
        ? animalChoices.get(event.id)
        : undefined;
      const id = event.playerId;
      if (
        [
          "EventBuyMercenary",
          "EventRemoveMercenary",
          "ResultPlayerRemoval",
          "ResultPlayerSentOff"
        ].includes(event.sourceTag) &&
        id
      ) {
        if (event.id && removals.has(event.id)) {
          const seed = ledger.get(id);
          const owner = owners.resolve(id, event);
          if (
            seed &&
            owner.status === "confirmed" &&
            owner.proof.teamId === seed.teamId
          )
            suspendedProfiles.set(id, {
              proof: seed,
              state: "awaiting_off_pitch"
            });
          else if (suspendedProfiles.get(id)?.state !== "awaiting_off_pitch")
            suspendedProfiles.delete(id);
        } else suspendedProfiles.delete(id);
        ledger.delete(id);
      } else if (
        id &&
        event.payload?.Outcome === "1" &&
        knownKoTraitTransition(event)
      ) {
        const pending = suspendedProfiles.get(id);
        if (
          pending?.state === "knocked_out" ||
          pending?.state === "awaiting_off_pitch" ||
          pending?.state === "recovered"
        ) {
          const owner = owners.resolve(id, event);
          if (
            pending.state === "knocked_out" &&
            owner.status === "confirmed" &&
            owner.proof.teamId === pending.proof.teamId &&
            (event.payload.TeamId === undefined ||
              event.payload.TeamId === pending.proof.teamId)
          )
            pending.state = "recovered";
          else suspendedProfiles.delete(id);
        }
      } else if (affectedByEffect !== undefined) {
        const pending = suspendedProfiles.get(affectedByEffect);
        const seed =
          ledger.get(affectedByEffect) ??
          (pending?.state === "animal_choice" ? pending.proof : undefined);
        const owner = owners.resolve(affectedByEffect, event);
        suspendedProfiles.delete(affectedByEffect);
        ledger.delete(affectedByEffect);
        if (
          recordedConfusedProvider(event.payload?.Effect) === 84 &&
          !event.executionExclusion &&
          owner.status === "confirmed"
        ) {
          if (
            event.sourceTag === "ResultAddPlayerEffect" &&
            seed?.teamId === owner.proof.teamId &&
            (seed.traits.innateSkills?.includes(84) ||
              seed.traits.acquiredSkills?.includes(84))
          )
            suspendedProfiles.set(affectedByEffect, {
              proof: seed,
              state: "effect_added"
            });
          else if (
            event.sourceTag.endsWith("EndPlayerEffect") &&
            pending?.state === "effect_observed" &&
            pending.proof.teamId === owner.proof.teamId
          )
            suspendedProfiles.set(affectedByEffect, {
              proof: pending.proof,
              state: "effect_ended"
            });
        }
      } else if (affectedByChoice) {
        for (const id of affectedByChoice.players) {
          const seed = ledger.get(id);
          suspendedProfiles.delete(id);
          if (seed && affectedByChoice.damageThrough !== undefined)
            suspendedProfiles.set(id, {
              proof: seed,
              state: "animal_choice",
              damageThrough: affectedByChoice.damageThrough
            });
          ledger.delete(id);
        }
      } else if (
        !(event.id && (bomb.has(event.id) || referee.has(event.id))) &&
        !preservesTraitContinuity(event)
      ) {
        ledger.clear();
        suspendedProfiles.clear();
        emptyPrayers.clear();
      }
    }
  }
}

// Several boards can precede the next emitted event. Their physical XML
// locations establish refresh order even when the event coordinate is equal.
// Equal or missing physical locations never establish a continuation.
function orderedSameIndexCheckpoints(
  a: ReplayBoardCheckpoint,
  b: ReplayBoardCheckpoint
) {
  const located = (c: ReplayBoardCheckpoint) =>
    c.kind === "board" &&
    Number.isSafeInteger(c.replayStep) &&
    c.replayStep! > 0 &&
    Number.isSafeInteger(c.childIndex) &&
    c.childIndex! >= 0;
  if (!located(b)) return false;
  if (a.kind === "initial")
    return (
      a.replayStep === null && a.childIndex === null && a.afterSourceIndex === 0
    );
  return (
    located(a) &&
    (b.replayStep! > a.replayStep! ||
      (b.replayStep === a.replayStep && b.childIndex! > a.childIndex!))
  );
}

export function findBlockTraitEvidence(
  replay: ReplayModel,
  owners?: OwnershipTimeline
) {
  const result = new Map<string, BlockTraitEvidence>();
  visitCurrentTraits(
    replay,
    (event, current, ledger) => {
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
    },
    owners
  );
  return result;
}

// Selected subjects receive a separate continued-trait receipt. No omitted
// physical state, raw pre-roll field or ownership is restored by this lookup.
export function findSubjectTraitEvidence(
  replay: ReplayModel,
  subjects: ReadonlyMap<string, string>,
  owners?: OwnershipTimeline
) {
  const result = new Map<string, CurrentTraitEvidence>();
  if (!subjects.size) return result;
  visitCurrentTraits(
    replay,
    (event, current, ledger) => {
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
    },
    owners
  );
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
  visitCurrentTraits(
    replay,
    (event, current, ledger) => {
      const id = event.id ? participants.get(event.id) : undefined;
      const evidence = id ? ledger.get(id) : undefined;
      const owner = id ? owners.resolve(id, event) : undefined;
      if (
        event.id &&
        evidence &&
        current?.board?.phaseCode === 5 &&
        event.sourceIndex !== undefined &&
        current.afterSourceIndex < event.sourceIndex &&
        owner?.status === "confirmed" &&
        owner.proof.teamId === evidence.teamId
      )
        result.set(event.id, structuredClone(evidence));
    },
    owners
  );
  return result;
}

// Decision-time knowledge, after block dice. This must not be used as an
// earlier pre-roll skill or position observation.
export function findPushTraitEvidence(
  replay: ReplayModel,
  owners?: OwnershipTimeline
) {
  const result = new Map<
    string,
    { checkpointAfter: number; players: CurrentTraitEvidence[] }
  >();
  visitCurrentTraits(
    replay,
    (event, current, ledger) => {
      if (event.sourceTag !== "QuestionPushBack" || !event.id || !current)
        return;
      result.set(event.id, {
        checkpointAfter: current.afterSourceIndex,
        players: Array.from(ledger.values()).filter((p) => p.onPitch)
      });
    },
    owners
  );
  return result;
}
