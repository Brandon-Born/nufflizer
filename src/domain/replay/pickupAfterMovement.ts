import type { RecordedZoneCheck } from "./zoneD6Check";

export type ObservedPickupAfterMovement = {
  movementSourceId: string;
  originalSourceId: string;
  skillSourceId: string;
  declarationSourceId: string;
  moveOutcomeSourceId: string;
  checkpointAfter: number;
  cell: { x: number; y: number };
  movementRemaining: number | null;
  check: RecordedZoneCheck;
};
