import type { ReplayModel } from "@/domain/replay/types";
import type { OwnershipTimeline } from "@/domain/replay/ownershipTimeline";
import {
  findSubjectTraitEvidence,
  type CurrentTraitEvidence
} from "@/domain/replay/traitContinuity";
import type { LuckEvent } from "./types";

export const INJURY_OUTCOMES = [
  "stunned",
  "ko",
  "badly_hurt",
  "casualty"
] as const;
type InjuryOutcome = (typeof INJURY_OUTCOMES)[number];

// BB2020 p60; Thick Skull p85, corroborated by in-game GR-010.
// The table is conditional on an injury roll, with no injury modifier applied.
// Treatment, recovery and later availability are different transitions.
export function unmodifiedInjuryOutcome(
  total: number,
  stunty: boolean,
  thickSkull: boolean
): InjuryOutcome {
  if (stunty) {
    if (total <= (thickSkull ? 7 : 6)) return "stunned";
    if (total <= 8) return "ko";
    if (total === 9) return "badly_hurt";
    return "casualty";
  }
  if (total <= (thickSkull ? 8 : 7)) return "stunned";
  return total <= 9 ? "ko" : "casualty";
}

export function enumerateUnmodifiedInjury(
  stunty: boolean,
  thickSkull: boolean
) {
  const counts = [0, 0, 0, 0];
  for (let a = 1; a <= 6; a++)
    for (let b = 1; b <= 6; b++)
      counts[
        INJURY_OUTCOMES.indexOf(
          unmodifiedInjuryOutcome(a + b, stunty, thickSkull)
        )
      ]!++;
  return { counts, probabilities: counts.map((n) => n / 36) };
}

// Only individually identified skills whose own presence does not alter this
// injury table. Unknown traits/effects cannot certify an ordinary player.
const supported = new Set([
  6, 7, 10, 13, 15, 19, 26, 27, 30, 38, 44, 50, 57, 59, 61, 63, 68, 75, 81, 83,
  1008
]);
export function injuryTableForTraits(
  traitEvidence: CurrentTraitEvidence,
  dice: readonly number[],
  observedOutcome: string
) {
  const t = traitEvidence.traits;
  if (
    t.dataPlayerId === null ||
    String(t.dataPlayerId) !== traitEvidence.playerId ||
    t.playerTypeId === null ||
    t.innateSkills === null ||
    t.acquiredSkills === null ||
    [t.innateSkills, t.acquiredSkills].some(
      (a) => new Set(a).size !== a.length
    ) ||
    [...t.innateSkills, ...t.acquiredSkills].some((s) => !supported.has(s)) ||
    dice.length !== 2 ||
    dice.some((d) => !Number.isInteger(d) || d < 1 || d > 6)
  )
    return;
  const skills = new Set([...t.innateSkills, ...t.acquiredSkills]);
  const stunty = skills.has(59),
    thickSkull = skills.has(63);
  if (
    unmodifiedInjuryOutcome(dice[0]! + dice[1]!, stunty, thickSkull) !==
    observedOutcome
  )
    return;
  return {
    rules: "bb2020" as const,
    policy: "fixed_unmodified_injury" as const,
    stunty,
    thickSkull,
    traitEvidence,
    ...enumerateUnmodifiedInjury(stunty, thickSkull)
  };
}

export function attachInjuryTables(
  replay: ReplayModel,
  sources: ReadonlyMap<string, LuckEvent>,
  owners?:OwnershipTimeline
) {
  const raw = new Map(
    replay.turns.flatMap((t) => t.events).map((e) => [e.id, e])
  );
  const subjects = new Map(
    [...sources].flatMap(([id, event]) =>
      event.metadata.injuryObservation?.recordKind === "direct" &&
      event.metadata.modifiers?.length === 0 &&
      event.metadata.modifiersSum === 0 &&
      event.playerId &&
      raw.get(id)?.payload?.Modifiers === "" &&
      [0, 1, 9].includes(event.metadata.injuryObservation.sourceCode)
        ? [[id, event.playerId] as const]
        : []
    )
  );
  const evidence = findSubjectTraitEvidence(replay, subjects,owners);
  for (const [id, traits] of evidence) {
    const event = sources.get(id)!;
    if (
      traits.currentCheckpointAfter >=
      event.metadata.injuryObservation!.damageStepSourceIndex
    )
      continue;
    const table = injuryTableForTraits(
      traits,
      event.metadata.dice ?? [],
      event.metadata.injuryObservation!.outcome
    );
    if (table) event.metadata.injuryTable = table;
  }
}
