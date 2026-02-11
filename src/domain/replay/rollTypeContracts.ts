export type RollContractKind = "scored_deterministic" | "excluded_deterministic" | "randomizer" | "summary";
export type RollConfidence = "high" | "medium" | "low";
export type RollKnowledgeStatus = "known" | "ambiguous" | "unknown";
export type RollScoringCategory = "block" | "armor_break" | "injury" | "argue_call" | "movement_risk";

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

// Evidence-based contracts from the sanitized demo replay fixture set under demo-replays/.
const OBSERVED_ROLL_TYPE_CONTRACTS: RollTypeContract[] = [
  {
    sourceTag: "ResultBlockRoll",
    rollType: 3,
    label: "block_dice_faces_summary",
    kind: "summary",
    confidence: "high",
    status: "known",
    scoringCategory: "block",
    notes: "Outcome-only block face summary without threshold/dice payload."
  },
  {
    sourceTag: "ResultInjuryRoll",
    rollType: 11,
    label: "injury_chain_2d6_summary",
    kind: "summary",
    confidence: "high",
    status: "known",
    scoringCategory: "injury",
    notes: "Damage chain summary roll emitted after armor-like checks."
  },
  {
    sourceTag: "ResultCasualtyRoll",
    rollType: 12,
    label: "casualty_chain_d6_summary",
    kind: "summary",
    confidence: "high",
    status: "known",
    scoringCategory: "injury",
    notes: "Casualty severity chain summary roll."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 2,
    label: "block_check",
    kind: "scored_deterministic",
    confidence: "high",
    status: "known",
    scoringCategory: "block",
    notes: "Single-die threshold check in block sequences."
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
    label: "armor_modified_check",
    kind: "scored_deterministic",
    confidence: "high",
    status: "known",
    scoringCategory: "armor_break",
    notes: "Single-die armor-like check with stable +2 style modifiers."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 4,
    label: "injury_check",
    kind: "scored_deterministic",
    confidence: "high",
    status: "known",
    scoringCategory: "injury",
    notes: "Single-die injury-like threshold check."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 37,
    label: "injury_variant_check",
    kind: "scored_deterministic",
    confidence: "high",
    status: "known",
    scoringCategory: "injury",
    notes: "Single-die injury-like variant check in damage chains."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 71,
    label: "argue_call_check",
    kind: "scored_deterministic",
    confidence: "high",
    status: "known",
    scoringCategory: "argue_call",
    notes: "Secret-weapon argue-call check with deterministic threshold."
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
    notes: "Paired randomizer event with dieType mix (1 and 0) and no threshold."
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
    label: "movement_risk_check",
    kind: "scored_deterministic",
    confidence: "high",
    status: "known",
    scoringCategory: "movement_risk",
    notes:
      "Single-die 2+ movement-risk check with stable deterministic threshold and outcome semantics across expanded fixtures."
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
    notes: "Low-frequency deterministic check observed in special-action chains."
  },
  {
    sourceTag: "ResultRoll",
    rollType: 7,
    label: "deterministic_check_7_provisional",
    kind: "excluded_deterministic",
    confidence: "medium",
    status: "ambiguous",
    notes: "Deterministic threshold check with mixed step contexts and modifiers."
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
    notes: "Repeated deterministic check with stable 2+ threshold but unclear rule meaning."
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
    notes: "Deterministic 2+ check that often precedes rollType 10 chain checks."
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
    notes: "Deterministic special-skill chain check with stable failure patterns."
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
  OBSERVED_ROLL_TYPE_CONTRACTS.map((contract) => [contractKey(contract.sourceTag, contract.rollType), contract])
);

export function getRollTypeContract(sourceTag: string, rollType: number | undefined): RollTypeContract | undefined {
  if (!Number.isFinite(rollType)) {
    return undefined;
  }

  return contractMap.get(contractKey(sourceTag, rollType as number));
}

export function labelForRollType(sourceTag: string, rollType: number | undefined, fallbackLabel: string): string {
  const contract = getRollTypeContract(sourceTag, rollType);
  return contract?.label ?? fallbackLabel;
}

export function isRollCandidateContract(contract: RollTypeContract | undefined): boolean {
  if (!contract) {
    return false;
  }

  return contract.kind === "scored_deterministic" || contract.kind === "excluded_deterministic";
}

export function listObservedRollTypeContracts(): RollTypeContract[] {
  return OBSERVED_ROLL_TYPE_CONTRACTS.map((contract) => ({ ...contract }));
}
