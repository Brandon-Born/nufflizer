import type { LuckEventType } from "@/domain/nufflizer/types";
import { getRollTypeContract, type RollScoringCategory } from "@/domain/replay/rollTypeContracts";

export type ClassificationContext = {
  sourceTag: string;
  stepType?: number;
  rollType?: number;
  requirement?: number;
  difficulty?: number;
  diceCount: number;
};

export type ClassificationResult =
  | {
      eventType: LuckEventType;
      scored: true;
      rollCandidate: true;
      reason: string;
    }
  | {
      eventType: LuckEventType | null;
      scored: false;
      rollCandidate: boolean;
      reason: string;
    };

function hasTargetThreshold(context: ClassificationContext): boolean {
  const target = context.difficulty ?? context.requirement;
  return Number.isFinite(target) && (target ?? 0) > 0;
}

function mapContractCategory(category: RollScoringCategory | undefined): LuckEventType | null {
  if (
    category === "block" ||
    category === "armor_break" ||
    category === "injury" ||
    category === "argue_call" ||
    category === "movement_risk"
  ) {
    return category;
  }

  return null;
}

export function classifyRollContext(context: ClassificationContext): ClassificationResult {
  if (context.sourceTag === "ResultBlockOutcome") {
    return {
      eventType: "block",
      scored: false,
      rollCandidate: false,
      reason: "excluded: block outcome summary event is non-roll context"
    };
  }

  if (context.sourceTag === "ResultPlayerRemoval" || context.sourceTag === "ResultInjuryRoll" || context.sourceTag === "ResultCasualtyRoll") {
    return {
      eventType: "injury",
      scored: false,
      rollCandidate: false,
      reason: "excluded: injury-chain summary event without deterministic threshold contract"
    };
  }

  const contract = getRollTypeContract(context.sourceTag, context.rollType);

  if (contract?.kind === "summary") {
    return {
      eventType: mapContractCategory(contract.scoringCategory),
      scored: false,
      rollCandidate: false,
      reason: `excluded: ${contract.label} summary event is non-roll scoring context`
    };
  }

  if (context.sourceTag !== "ResultRoll") {
    if (/argue|referee|bribe/i.test(context.sourceTag)) {
      return {
        eventType: "argue_call",
        scored: false,
        rollCandidate: false,
        reason: "excluded: argue-call context missing deterministic ResultRoll contract"
      };
    }

    return {
      eventType: null,
      scored: false,
      rollCandidate: false,
      reason: "excluded: unsupported source tag for deterministic luck scoring"
    };
  }

  if (context.rollType === 42 || context.rollType === 70) {
    if (!hasTargetThreshold(context)) {
      return {
        eventType: "argue_call",
        scored: false,
        rollCandidate: true,
        reason: "excluded: missing target threshold"
      };
    }

    return {
      eventType: "argue_call",
      scored: false,
      rollCandidate: true,
      reason: `excluded: unsupported ResultRoll context for rollType ${context.rollType}`
    };
  }

  if (contract?.kind === "randomizer") {
    return {
      eventType: null,
      scored: false,
      rollCandidate: false,
      reason: "excluded: randomizer roll family without success-threshold semantics"
    };
  }

  if (!hasTargetThreshold(context)) {
    return {
      eventType: mapContractCategory(contract?.scoringCategory),
      scored: false,
      rollCandidate: contract?.kind === "scored_deterministic" || contract?.kind === "excluded_deterministic",
      reason: "excluded: missing target threshold"
    };
  }

  if (contract?.kind === "scored_deterministic") {
    const mappedType = mapContractCategory(contract.scoringCategory);
    if (!mappedType) {
      return {
        eventType: null,
        scored: false,
        rollCandidate: true,
        reason: `excluded: scored contract for ${contract.label} is missing a luck category mapping`
      };
    }

    return {
      eventType: mappedType,
      scored: true,
      rollCandidate: true,
      reason: `scored: ${contract.label}`
    };
  }

  if (contract?.kind === "excluded_deterministic") {
    return {
      eventType: mapContractCategory(contract.scoringCategory),
      scored: false,
      rollCandidate: true,
      reason: `excluded: deterministic roll family pending semantic confirmation (${contract.label})`
    };
  }

  return {
    eventType: null,
    scored: false,
    rollCandidate: false,
    reason: `excluded: unsupported ResultRoll context${context.rollType !== undefined ? ` for rollType ${context.rollType}` : ""}`
  };
}
