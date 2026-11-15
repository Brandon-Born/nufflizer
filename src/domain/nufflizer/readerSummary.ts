import { DICE_MODEL_VERSION } from "./constants";
import type { LuckEvent, LuckEventType, LuckReport } from "./types";

export const ARMOR_REVIEW_NOTICE =
  "Armor luck is under review: later modifier choices can bias the current calculation. Armor estimates and combined dice totals are not reliable and are withheld from the reading summary and key moments. Original calculations remain in the diagnostic evidence and JSON; NUF-036 is unresolved.";

export function isArmorUnderReview(event: LuckEvent, modelVersion?: string): boolean {
  return event.type === "armor_break" && event.scoringStatus === "scored" && modelVersion !== DICE_MODEL_VERSION;
}

export function hasArmorUnderReview(
  report: { events: LuckReport["events"]; modelVersion?: string }
): boolean {
  return report.events.some((event) => isArmorUnderReview(event, report.modelVersion));
}

export const READER_CATEGORIES: { type: LuckEventType; label: string }[] = [
  { type: "block", label: "Blocks" },
  { type: "armor_break", label: "Armor" },
  { type: "injury", label: "Injury & recovery" },
  { type: "dodge", label: "Dodges" },
  { type: "ball_handling", label: "Ball handling" },
  { type: "movement_risk", label: "Rushes & movement" },
  { type: "argue_call", label: "Referee calls" },
  { type: "unknown", label: "Other dice" }
];

export function readerMomentTitle(event: LuckEvent): string {
  if (event.type === "armor_break") return event.actualSuccess ? "Armor held" : "Armor broke";
  const actions: Record<number, string> = {
    1: "Rush",
    2: "Dodge",
    4: "pick-up",
    7: "catch",
    13: "KO recovery",
    46: "Regeneration"
  };
  const action = event.metadata.proGate
    ? "Pro test"
    : event.metadata.lonerGate
      ? "Loner test"
      : (actions[event.metadata.rollType ?? -1] ?? "dice check");
  return `${event.actualSuccess ? "Successful" : "Failed"} ${action}`;
}

// A reading aid, never a match-impact or confidence model. An outcome no more
// likely than its alternative (<= 50%) can be highlighted. Categorical models
// have no binary chance and remain in the category/evidence views.
export function summarizeForReader(report: { events: LuckReport["events"]; modelVersion?: string }) {
  const categories = READER_CATEGORIES.map((category) => ({
    ...category,
    observed: 0,
    scored: 0,
    underReview: 0
  }));
  const byType = new Map(categories.map((c) => [c.type, c]));
  const moments: { event: LuckEvent; outcomeChance: number }[] = [];
  let scored = 0;
  let observed = 0;
  for (const event of report.events) {
    if (event.metadata.isRollCandidate) {
      observed++;
      const category = byType.get(event.type)!;
      category.observed++;
      if (isArmorUnderReview(event, report.modelVersion)) category.underReview++;
      else if (event.scoringStatus === "scored") {
        scored++;
        category.scored++;
      }
    }
    const p = event.probabilitySuccess;
    if (
      event.scoringStatus !== "scored" ||
      isArmorUnderReview(event, report.modelVersion) ||
      event.actualSuccess === null ||
      p === null ||
      p <= 0 ||
      p >= 1
    )
      continue;
    const outcomeChance = event.actualSuccess ? p : 1 - p;
    if (outcomeChance <= 0.5) moments.push({ event, outcomeChance });
  }
  moments.sort(
    (a, b) =>
      a.outcomeChance - b.outcomeChance ||
      (a.event.metadata.sourceIndex ?? 0) - (b.event.metadata.sourceIndex ?? 0)
  );
  return {
    observed,
    scored,
    unscored: observed - scored,
    categories,
    moments: moments.slice(0, 6)
  };
}
