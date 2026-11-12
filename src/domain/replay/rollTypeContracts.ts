import { ROLL_TYPE_MAP } from "./mappings";

export type RollContractKind =
  "scored_deterministic" | "excluded_deterministic" | "randomizer" | "summary";
export type RollConfidence = "high" | "medium" | "low";
export type RollKnowledgeStatus = "known" | "ambiguous" | "unknown";
export type RollScoringCategory =
  | "block"
  | "armor_break"
  | "injury"
  | "ball_handling"
  | "argue_call"
  | "movement_risk"
  | "dodge";

export type RollTypeContract = {
  sourceTag: string;
  rollType: number;
  label: string;
  kind: RollContractKind;
  confidence: RollConfidence;
  status: RollKnowledgeStatus;
  scoringCategory?: RollScoringCategory;
  notes: string;
};

function contractKey(sourceTag: string, rollType: number): string {
  return `${sourceTag}|${rollType}`;
}

// Identity and scoring are separate: block linkage and damage attribution
// must still pass their versioned runtime contracts.
const OBSERVED_ROLL_TYPE_CONTRACTS: RollTypeContract[] = [
  {
    sourceTag: "QuestionKORecovery",
    rollType: 11,
    label: "injury",
    kind: "excluded_deterministic",
    confidence: "high",
    status: "known",
    scoringCategory: "injury",
    notes: "UI-025 records Stunty injury dice inside a staff-choice question. These are original injury evidence, not a recovery check; expected odds remain unknown."
  },
  {
    sourceTag: "EventRoll",
    rollType: 13,
    label: "ko_recovery",
    kind: "scored_deterministic",
    confidence: "high",
    status: "known",
    scoringCategory: "injury",
    notes:
      "UI-040 verifies unmodified 4+ recovery. Installed modifier code 20 and direct demo records corroborate the exact Kegs +1 variant at 3+."
  },
  {
    sourceTag: "QuestionBlockDice",
    rollType: 3,
    label: "block_pool",
    kind: "summary",
    confidence: "high",
    status: "known",
    scoringCategory: "block",
    notes:
      "Pool freshness and linked selection are verified separately; a repeated question is not a new roll."
  },
  {
    sourceTag: "ResultBlockRoll",
    rollType: 3,
    label: "selected_block_die",
    kind: "excluded_deterministic",
    confidence: "high",
    status: "known",
    scoringCategory: "block",
    notes:
      "Pool freshness and linked selection are verified separately; a repeated question is not a new roll."
  },
  {
    sourceTag: "ResultCasualtyRoll",
    rollType: 12,
    label: "casualty",
    kind: "excluded_deterministic",
    confidence: "high",
    status: "known",
    scoringCategory: "injury",
    notes:
      "Named damage stage; injury and casualty distributions require their own contracts."
  },
  {
    sourceTag: "ResultInjuryRoll",
    rollType: 11,
    label: "injury",
    kind: "excluded_deterministic",
    confidence: "high",
    status: "known",
    scoringCategory: "injury",
    notes:
      "Named damage stage; injury and casualty distributions require their own contracts."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 1,
    label: "rush",
    kind: "scored_deterministic",
    confidence: "high",
    status: "known",
    scoringCategory: "movement_risk",
    notes: "UI-008/009: verified single D6 Rush."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 2,
    label: "dodge",
    kind: "scored_deterministic",
    confidence: "high",
    status: "known",
    scoringCategory: "dodge",
    notes:
      "UI-006/008/009: verified single D6 Dodge, independent of the movement container."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 4,
    label: "pick_up",
    kind: "scored_deterministic",
    confidence: "high",
    status: "known",
    scoringCategory: "ball_handling",
    notes: "UI-002/022: verified Pick up."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 5,
    label: "pass",
    kind: "excluded_deterministic",
    confidence: "high",
    status: "known",
    notes:
      "Raw identity is known; outcome, policy or attribution remains outside the scoring contract."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 6,
    label: "interfere",
    kind: "excluded_deterministic",
    confidence: "high",
    status: "known",
    notes:
      "Raw identity is known; outcome, policy or attribution remains outside the scoring contract."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 7,
    label: "catch",
    kind: "scored_deterministic",
    confidence: "high",
    status: "known",
    scoringCategory: "ball_handling",
    notes: "UI-014/093/097: verified Catch with scoped natural-roll edges."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 8,
    label: "scatter",
    kind: "randomizer",
    confidence: "high",
    status: "known",
    notes:
      "Raw identity is known; outcome, policy or attribution remains outside the scoring contract."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 9,
    label: "throw_in",
    kind: "randomizer",
    confidence: "low",
    status: "ambiguous",
    notes:
      "Compiled ThrowIn name only; dice roles, geometry and behavior remain unverified. Retained as an unscored random outcome."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 10,
    label: "armor",
    kind: "scored_deterministic",
    confidence: "high",
    status: "known",
    scoringCategory: "armor_break",
    notes:
      "UI-009/015/020: verified two-D6 armor only within the damage-subject and fixed-assist contract."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 15,
    label: "pro",
    kind: "excluded_deterministic",
    confidence: "high",
    status: "known",
    notes:
      "Raw identity is known; outcome, policy or attribution remains outside the scoring contract."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 21,
    label: "bribe",
    kind: "excluded_deterministic",
    confidence: "high",
    status: "known",
    scoringCategory: "argue_call",
    notes:
      "Raw identity is known; outcome, policy or attribution remains outside the scoring contract."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 25,
    label: "bounce",
    kind: "randomizer",
    confidence: "high",
    status: "known",
    notes:
      "Raw identity is known; outcome, policy or attribution remains outside the scoring contract."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 26,
    label: "deviate",
    kind: "randomizer",
    confidence: "high",
    status: "known",
    notes:
      "Raw identity is known; outcome, policy or attribution remains outside the scoring contract."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 29,
    label: "jump_over",
    kind: "excluded_deterministic",
    confidence: "high",
    status: "known",
    notes:
      "Raw identity is known; outcome, policy or attribution remains outside the scoring contract."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 30,
    label: "argue_the_call",
    kind: "excluded_deterministic",
    confidence: "high",
    status: "known",
    scoringCategory: "argue_call",
    notes:
      "Raw identity is known; outcome, policy or attribution remains outside the scoring contract."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 31,
    label: "dauntless",
    kind: "excluded_deterministic",
    confidence: "high",
    status: "known",
    notes:
      "Raw identity is known; outcome, policy or attribution remains outside the scoring contract."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 33,
    label: "bone_head",
    kind: "excluded_deterministic",
    confidence: "high",
    status: "known",
    notes:
      "Raw identity is known; outcome, policy or attribution remains outside the scoring contract."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 34,
    label: "really_stupid",
    kind: "excluded_deterministic",
    confidence: "high",
    status: "known",
    notes:
      "Raw identity is known; outcome, policy or attribution remains outside the scoring contract."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 36,
    label: "animal_savagery",
    kind: "excluded_deterministic",
    confidence: "high",
    status: "known",
    notes:
      "Raw identity is known; outcome, policy or attribution remains outside the scoring contract."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 37,
    label: "foul_appearance",
    kind: "excluded_deterministic",
    confidence: "high",
    status: "known",
    notes:
      "Raw identity is known; outcome, policy or attribution remains outside the scoring contract."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 41,
    label: "throw_team_mate",
    kind: "excluded_deterministic",
    confidence: "high",
    status: "known",
    notes:
      "Raw identity is known; outcome, policy or attribution remains outside the scoring contract."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 42,
    label: "land",
    kind: "excluded_deterministic",
    confidence: "high",
    status: "known",
    notes:
      "Raw identity is known; outcome, policy or attribution remains outside the scoring contract."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 43,
    label: "always_hungry",
    kind: "excluded_deterministic",
    confidence: "high",
    status: "known",
    notes:
      "Raw identity is known; outcome, policy or attribution remains outside the scoring contract."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 45,
    label: "projectile_vomit",
    kind: "excluded_deterministic",
    confidence: "high",
    status: "known",
    notes:
      "Raw identity is known; outcome, policy or attribution remains outside the scoring contract."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 46,
    label: "regeneration",
    kind: "scored_deterministic",
    confidence: "high",
    status: "known",
    scoringCategory: "injury",
    notes:
      "Only the linked post-casualty 4+ check with verified removal, skill use and subject ownership is scored."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 48,
    label: "fireball_hit",
    kind: "excluded_deterministic",
    confidence: "high",
    status: "known",
    notes:
      "Raw identity is known; outcome, policy or attribution remains outside the scoring contract."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 67,
    label: "chainsaw",
    kind: "excluded_deterministic",
    confidence: "high",
    status: "known",
    notes:
      "Raw identity is known; outcome, policy or attribution remains outside the scoring contract."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 70,
    label: "throw_a_rock",
    kind: "randomizer",
    confidence: "low",
    status: "ambiguous",
    notes: "Compiled name retained; replay field behavior remains unverified."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 71,
    label: "loner",
    kind: "excluded_deterministic",
    confidence: "high",
    status: "known",
    notes:
      "Raw identity is known; outcome, policy or attribution remains outside the scoring contract."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 73,
    label: "shadowing",
    kind: "excluded_deterministic",
    confidence: "high",
    status: "known",
    notes:
      "Raw identity is known; outcome, policy or attribution remains outside the scoring contract."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 74,
    label: "animosity",
    kind: "excluded_deterministic",
    confidence: "high",
    status: "known",
    notes:
      "Raw identity is known; outcome, policy or attribution remains outside the scoring contract."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 87,
    label: "ball_and_chain_direction",
    kind: "randomizer",
    confidence: "high",
    status: "known",
    notes:
      "Raw identity is known; outcome, policy or attribution remains outside the scoring contract."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 88,
    label: "bomb_hit",
    kind: "excluded_deterministic",
    confidence: "high",
    status: "known",
    notes:
      "Raw identity is known; outcome, policy or attribution remains outside the scoring contract."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 89,
    label: "bomb_explode_on_catch",
    kind: "excluded_deterministic",
    confidence: "high",
    status: "known",
    notes:
      "Raw identity is known; outcome, policy or attribution remains outside the scoring contract."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 97,
    label: "breathe_fire",
    kind: "excluded_deterministic",
    confidence: "high",
    status: "known",
    notes:
      "Raw identity is known; outcome, policy or attribution remains outside the scoring contract."
  }
];

const contractMap = new Map<string, RollTypeContract>(
  OBSERVED_ROLL_TYPE_CONTRACTS.map((contract) => [
    contractKey(contract.sourceTag, contract.rollType),
    contract
  ])
);

export function getRollTypeContract(
  sourceTag: string,
  rollType: number | undefined
): RollTypeContract | undefined {
  if (!Number.isFinite(rollType)) {
    return undefined;
  }

  const declared = contractMap.get(contractKey(sourceTag, rollType as number));
  if (declared) return declared;
  if (
    (sourceTag === "ResultRoll" || sourceTag === "EventRoll") &&
    ROLL_TYPE_MAP[rollType!]
  )
    return {
      sourceTag,
      rollType: rollType!,
      label: ROLL_TYPE_MAP[rollType!]!,
      kind: "excluded_deterministic",
      confidence: "low",
      status: "ambiguous",
      notes: "Compiled name only; no supported action or scoring contract."
    };
  return undefined;
}

export function labelForRollType(
  sourceTag: string,
  rollType: number | undefined,
  fallbackLabel: string
): string {
  const contract = getRollTypeContract(sourceTag, rollType);
  return contract?.label ?? fallbackLabel;
}

export function isRollCandidateContract(
  contract: RollTypeContract | undefined
): boolean {
  if (!contract) {
    return false;
  }

  return (
    contract.kind === "scored_deterministic" ||
    contract.kind === "excluded_deterministic" ||
    contract.kind === "randomizer"
  );
}

export function listObservedRollTypeContracts(): RollTypeContract[] {
  return OBSERVED_ROLL_TYPE_CONTRACTS.map((contract) => ({ ...contract }));
}
