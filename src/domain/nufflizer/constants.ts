import type { LuckEventType } from "@/domain/nufflizer/types";

export const DICE_MODEL_VERSION = "dice-only-25";
export const REPORT_SCHEMA_VERSION = "2.51";

export const LUCK_CATEGORY_WEIGHTS: Record<LuckEventType, number> = {
  unknown: 0,
  block: 0.75,
  armor_break: 1.0,
  injury: 1.5,
  dodge: 1.1,
  ball_handling: 1.1,
  argue_call: 0.9,
  movement_risk: 1.0
};
