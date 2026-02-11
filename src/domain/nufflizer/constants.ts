import type { LuckEventType } from "@/domain/nufflizer/types";

export const LUCK_CATEGORY_WEIGHTS: Record<LuckEventType, number> = {
  block: 0.75,
  armor_break: 1.0,
  injury: 1.5,
  dodge: 1.1,
  ball_handling: 1.1,
  argue_call: 0.9,
  movement_risk: 1.0
};

export const ROLL_TYPE_BY_EVENT: Record<LuckEventType, number[]> = {
  block: [2],
  armor_break: [10, 34],
  injury: [4, 37],
  dodge: [],
  ball_handling: [7],
  argue_call: [42, 70, 71],
  movement_risk: [1]
};
