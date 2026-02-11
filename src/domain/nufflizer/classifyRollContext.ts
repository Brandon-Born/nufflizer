import type { LuckEventType } from "@/domain/nufflizer/types";

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
      reason: string;
    }
  | {
      eventType: LuckEventType | null;
      scored: false;
      reason: string;
    };

const BALL_HANDLING_STEP_TYPES = new Set([4, 5, 8, 9, 12, 13]);
const DODGE_ROLL_TYPES = new Set([3, 17, 21]);
const BALL_HANDLING_ROLL_TYPES = new Set([11, 12, 13, 14, 15, 25]);

function hasTargetThreshold(context: ClassificationContext): boolean {
  const target = context.difficulty ?? context.requirement;
  return Number.isFinite(target) && (target ?? 0) > 0;
}

export function classifyRollContext(context: ClassificationContext): ClassificationResult {
  if (context.sourceTag === "ResultBlockOutcome") {
    return {
      eventType: "block",
      scored: false,
      reason: "excluded: block outcome summary event is non-roll context"
    };
  }

  if (context.sourceTag === "ResultPlayerRemoval" || context.sourceTag === "ResultInjuryRoll" || context.sourceTag === "ResultCasualtyRoll") {
    return {
      eventType: "injury",
      scored: false,
      reason: "excluded: injury-chain summary event without deterministic threshold contract"
    };
  }

  if (context.sourceTag !== "ResultRoll") {
    if (/argue|referee|bribe/i.test(context.sourceTag)) {
      return {
        eventType: "argue_call",
        scored: false,
        reason: "excluded: argue-call context missing deterministic ResultRoll contract"
      };
    }

    return {
      eventType: null,
      scored: false,
      reason: "excluded: unsupported source tag for deterministic luck scoring"
    };
  }

  if (context.rollType === 42 || context.rollType === 70) {
    if (!hasTargetThreshold(context)) {
      return {
        eventType: "argue_call",
        scored: false,
        reason: "excluded: missing target threshold"
      };
    }

    return {
      eventType: "argue_call",
      scored: false,
      reason: `excluded: unsupported ResultRoll context for rollType ${context.rollType}`
    };
  }

  if (!hasTargetThreshold(context)) {
    return {
      eventType: null,
      scored: false,
      reason: "excluded: missing target threshold"
    };
  }

  if (context.rollType === 1 || context.rollType === 34) {
    return {
      eventType: "armor_break",
      scored: true,
      reason: "scored: ResultRoll armor-break rollType 1/34"
    };
  }

  if (context.rollType === 4 || context.rollType === 31 || context.rollType === 37) {
    return {
      eventType: "injury",
      scored: true,
      reason: "scored: ResultRoll injury rollType 4/31/37"
    };
  }

  if (context.rollType === 2) {
    return {
      eventType: "block",
      scored: true,
      reason: "scored: ResultRoll block rollType 2"
    };
  }

  if (context.rollType === 71) {
    return {
      eventType: "argue_call",
      scored: true,
      reason: "scored: ResultRoll argue-call rollType 71"
    };
  }

  if (context.stepType === 1) {
    if (!DODGE_ROLL_TYPES.has(context.rollType ?? -1)) {
      return {
        eventType: "dodge",
        scored: false,
        reason: "excluded: dodge step without supported roll family"
      };
    }

    return {
      eventType: "dodge",
      scored: true,
      reason: "scored: ResultRoll dodge stepType 1"
    };
  }

  if (context.stepType !== undefined && BALL_HANDLING_STEP_TYPES.has(context.stepType)) {
    if (!BALL_HANDLING_ROLL_TYPES.has(context.rollType ?? -1)) {
      return {
        eventType: "ball_handling",
        scored: false,
        reason: "excluded: ball-handling step without supported roll family"
      };
    }

    return {
      eventType: "ball_handling",
      scored: true,
      reason: `scored: ResultRoll ball-handling stepType ${context.stepType}`
    };
  }

  return {
    eventType: null,
    scored: false,
    reason: `excluded: unsupported ResultRoll context${context.rollType !== undefined ? ` for rollType ${context.rollType}` : ""}`
  };
}
