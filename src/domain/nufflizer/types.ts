import type { z } from "zod";
import type {
  LuckEventTypeSchema,
  LuckMomentTagSchema,
  LuckScoringStatusSchema,
  LuckEventMetadataSchema,
  LuckEventSchema,
  LuckTeamAggregateSchema,
  LuckVerdictSchema,
  LuckReportSchema
} from "./reportSchema";

export type LuckEventType = z.infer<typeof LuckEventTypeSchema>;
export type LuckMomentTag = z.infer<typeof LuckMomentTagSchema>;
export type LuckScoringStatus = z.infer<typeof LuckScoringStatusSchema>;
export type LuckEventMetadata = z.infer<typeof LuckEventMetadataSchema>;
export type LuckEvent = z.infer<typeof LuckEventSchema>;
export type LuckTeamAggregate = z.infer<typeof LuckTeamAggregateSchema>;
export type LuckVerdict = z.infer<typeof LuckVerdictSchema>;
export type LuckReport = z.infer<typeof LuckReportSchema>;
