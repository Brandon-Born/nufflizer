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

// Provisional inventory from sanitized fixtures. Numeric shape and adjacency do not establish BB3 rule meaning.
// analyzeLuck excludes disputed block/damage categories and abstains from whole-match verdicts (NUF-009).
const OBSERVED_ROLL_TYPE_CONTRACTS: RollTypeContract[] = [
  {
    sourceTag: "QuestionBlockDice",
    rollType: 3,
    label: "unverified_block_question",
    kind: "summary",
    confidence: "low",
    status: "ambiguous",
    notes:
      "Preserved choice/pool evidence; not an additional independent roll. NUF-009/010."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 15,
    label: "unverified_roll_15",
    kind: "excluded_deterministic",
    confidence: "low",
    status: "unknown",
    notes:
      "Newly visible after ordered extraction; no semantic promotion. NUF-009."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 21,
    label: "unverified_roll_21",
    kind: "excluded_deterministic",
    confidence: "low",
    status: "unknown",
    notes:
      "Newly visible after ordered extraction; no semantic promotion. NUF-009."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 36,
    label: "unverified_roll_36",
    kind: "excluded_deterministic",
    confidence: "low",
    status: "unknown",
    notes:
      "Newly visible after ordered extraction; no semantic promotion. NUF-009."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 46,
    label: "unverified_roll_46",
    kind: "excluded_deterministic",
    confidence: "low",
    status: "unknown",
    notes:
      "Newly visible after ordered extraction; no semantic promotion. NUF-009."
  },
  {
    sourceTag: "ResultBlockRoll",
    rollType: 3,
    label: "unverified_block_faces",
    kind: "excluded_deterministic",
    confidence: "high",
    status: "known",
    scoringCategory: "block",
    notes:
      "Correction: actual face data exists under payload.Die. Keep excluded pending pool/choice/skill semantics, NUF-009/010."
  },
  {
    sourceTag: "ResultInjuryRoll",
    rollType: 11,
    label: "unverified_injury_2d6",
    kind: "excluded_deterministic",
    confidence: "high",
    status: "known",
    scoringCategory: "injury",
    notes: "Damage chain summary roll emitted after armor-like checks."
  },
  {
    sourceTag: "ResultCasualtyRoll",
    rollType: 12,
    label: "unverified_casualty",
    kind: "excluded_deterministic",
    confidence: "high",
    status: "known",
    scoringCategory: "injury",
    notes: "Casualty severity chain summary roll."
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
      "UI-006/008/009 identify Dodge, including Titchy +1; version 1-4-0-0 numeric D6 scope only."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 10,
    label: "armor_chain_2d6_check",
    kind: "scored_deterministic",
    confidence: "high",
    status: "known",
    scoringCategory: "armor_break",
    notes: "Two-die threshold check strongly tied to block/foul damage chains."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 34,
    label: "really_stupid",
    kind: "excluded_deterministic",
    confidence: "high",
    status: "known",
    notes:
      "UI-paired identity confirmed; trait/gate policy and consequences are not scored in this slice."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 4,
    label: "pick_up",
    kind: "scored_deterministic",
    confidence: "high",
    status: "known",
    scoringCategory: "ball_handling",
    notes:
      "UI-002/094 identify Pick up. Sure Hands replacement is separate evidence, not unconditional availability."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 37,
    label: "foul_appearance",
    kind: "excluded_deterministic",
    confidence: "high",
    status: "known",
    notes:
      "UI-paired identity confirmed; trait/gate policy and consequences are not scored in this slice."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 71,
    label: "loner",
    kind: "excluded_deterministic",
    confidence: "high",
    status: "known",
    notes:
      "UI-paired identity confirmed; trait/gate policy and consequences are not scored in this slice."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 8,
    label: "kickoff_scatter_randomizer",
    kind: "randomizer",
    confidence: "high",
    status: "known",
    notes: "Three-die directional randomizer with no success threshold."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 9,
    label: "kickoff_event_randomizer",
    kind: "randomizer",
    confidence: "high",
    status: "known",
    notes: "Three-die randomizer chain with outcome=2 and zero target."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 25,
    label: "single_die_chain_randomizer",
    kind: "randomizer",
    confidence: "high",
    status: "known",
    notes: "Single dieType=1 randomizer event with no threshold semantics."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 26,
    label: "paired_kickoff_randomizer",
    kind: "randomizer",
    confidence: "high",
    status: "known",
    notes:
      "Paired randomizer event with dieType mix (1 and 0) and no threshold."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 30,
    label: "special_randomizer_30",
    kind: "randomizer",
    confidence: "medium",
    status: "ambiguous",
    notes: "Observed once as outcome=2 special chain randomizer."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 87,
    label: "chain_randomizer_87",
    kind: "randomizer",
    confidence: "high",
    status: "known",
    notes: "Frequent zero-target randomizer in chainsaw-like sequences."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 1,
    label: "rush",
    kind: "scored_deterministic",
    confidence: "high",
    status: "known",
    scoringCategory: "movement_risk",
    notes:
      "UI-008/009 identify successful and failed Rush separately from Dodge and self-damage; replay 1-4-0-0 numeric D6 scope only."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 5,
    label: "deterministic_check_5_provisional",
    kind: "excluded_deterministic",
    confidence: "low",
    status: "unknown",
    notes: "Low-frequency deterministic check chain without stable semantics."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 6,
    label: "deterministic_check_6_provisional",
    kind: "excluded_deterministic",
    confidence: "low",
    status: "unknown",
    notes:
      "Low-frequency deterministic check observed in special-action chains."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 7,
    label: "catch",
    kind: "scored_deterministic",
    confidence: "high",
    status: "known",
    scoringCategory: "ball_handling",
    notes:
      "UI-014/093/097 identify Catch, distinct from Pick up. Natural-one and natural-six examples corroborate effective Difficulty; reroll variants remain separately gated."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 31,
    label: "deterministic_check_31_provisional",
    kind: "excluded_deterministic",
    confidence: "low",
    status: "unknown",
    notes: "Single observation deterministic check; semantics not stable."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 33,
    label: "deterministic_check_33_provisional",
    kind: "excluded_deterministic",
    confidence: "medium",
    status: "ambiguous",
    notes:
      "Repeated deterministic check with stable 2+ threshold but unclear rule meaning."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 41,
    label: "deterministic_check_41_provisional",
    kind: "excluded_deterministic",
    confidence: "low",
    status: "unknown",
    notes: "Single observation with heavy modifiers; insufficient evidence."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 43,
    label: "deterministic_check_43_provisional",
    kind: "excluded_deterministic",
    confidence: "low",
    status: "unknown",
    notes: "Single observation deterministic check; semantics unclear."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 45,
    label: "deterministic_check_45_provisional",
    kind: "excluded_deterministic",
    confidence: "medium",
    status: "ambiguous",
    notes:
      "Deterministic 2+ check that often precedes rollType 10 chain checks."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 67,
    label: "deterministic_check_67_provisional",
    kind: "excluded_deterministic",
    confidence: "medium",
    status: "ambiguous",
    notes: "Deterministic 2+ setup check immediately followed by rollType 10."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 73,
    label: "deterministic_check_73_provisional",
    kind: "excluded_deterministic",
    confidence: "medium",
    status: "ambiguous",
    notes:
      "Deterministic special-skill chain check with stable failure patterns."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 74,
    label: "deterministic_check_74_provisional",
    kind: "excluded_deterministic",
    confidence: "low",
    status: "unknown",
    notes: "Single observation deterministic check within low-frequency chain."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 88,
    label: "deterministic_check_88_provisional",
    kind: "excluded_deterministic",
    confidence: "medium",
    status: "ambiguous",
    notes: "Deterministic threshold check in bomb/special-action chain."
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

  return contractMap.get(contractKey(sourceTag, rollType as number));
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
    contract.kind === "excluded_deterministic"
  );
}

export function listObservedRollTypeContracts(): RollTypeContract[] {
  return OBSERVED_ROLL_TYPE_CONTRACTS.map((contract) => ({ ...contract }));
}
