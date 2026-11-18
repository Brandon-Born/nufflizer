import { DICE_MODEL_VERSION } from "./constants";
import { contextComponent } from "./contextComponents";
import type { LuckEvent, LuckEventType, LuckReport } from "./types";

export const ARMOR_REVIEW_NOTICE =
  "Armor luck is under review: later modifier choices can bias the current calculation. Armor estimates and combined dice totals are not reliable and are withheld from the reading summary and key moments. Original calculations remain in the diagnostic evidence and JSON; NUF-036 is unresolved.";

export function isArmorUnderReview(
  event: LuckEvent,
  modelVersion?: string
): boolean {
  return (
    event.type === "armor_break" &&
    event.scoringStatus === "scored" &&
    modelVersion !== DICE_MODEL_VERSION
  );
}

export function hasArmorUnderReview(report: {
  events: LuckReport["events"];
  modelVersion?: string;
}): boolean {
  return report.events.some((event) =>
    isArmorUnderReview(event, report.modelVersion)
  );
}

export const READER_CATEGORIES: { type: LuckEventType; label: string }[] = [
  { type: "block", label: "Blocks" },
  { type: "armor_break", label: "Armor" },
  { type: "injury", label: "Injury & recovery" },
  { type: "dodge", label: "Dodges" },
  { type: "ball_handling", label: "Ball handling" },
  { type: "movement_risk", label: "Rushes & movement" },
  { type: "activation_check", label: "Activation checks" },
  { type: "argue_call", label: "Referee calls" },
  { type: "unknown", label: "Other dice" }
];

export function readerMomentTitle(event: LuckEvent): string {
  if (event.type === "armor_break")
    return event.actualSuccess ? "Armor held" : "Armor broke";
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

function readerContext(event: LuckEvent) {
  const impact = event.contextualImpact;
  if (
    impact?.policy === "committed_team_scoring_rush" ||
    impact?.policy === "ordinary_no_retry_scoring_rush"
  ) {
    const { success, failure } = impact.successors;
    return {
      kind: "touchdown" as const,
      text: event.actualSuccess
        ? `The Rush scored immediately, making it ${success.ownScore}–${success.opponentScore} from this team's perspective.`
        : `Success would have scored immediately, making it ${success.ownScore}–${success.opponentScore} from this team's perspective. The fall left the score ${failure.ownScore}–${failure.opponentScore}.`
    };
  }
  const pickup = event.metadata.preRoll?.pickupSuccessors;
  if ((event.possessionBounds || impact?.policy === "exact_pickup_possession") && pickup) {
    const marked = pickup.branches.filter(
      (branch) => branch.kind === "empty" && branch.marking === "marked"
    ).length;
    const occupied = pickup.branches.filter(
      (branch) => branch.kind === "occupied"
    ).length;
    const outside = pickup.branches.filter(
      (branch) => branch.kind === "out_of_bounds"
    ).length;
    const ballRisk = [
      marked ? `${marked} under opposing tackle zones` : null,
      occupied ? `${occupied} occupied` : null,
      outside ? `${outside} off the pitch` : null
    ].filter(Boolean);
    return {
      kind: "possession" as const,
      text:
        (event.actualSuccess
          ? "The pickup secured the ball. Failure would have sent it bouncing."
          : "The missed pickup left the ball bouncing.") +
        (impact?.policy === "exact_pickup_possession" && ballRisk.length === 0
          ? " All eight first bounces would leave the ball loose in an unmarked square."
          : ballRisk.length
          ? ` Eight first-bounce squares were possible, including ${ballRisk.join(", ")}.`
          : " The next possession depends on where it lands.")
    };
  }
  if (event.catchPossessionBounds) {
    return {
      kind: "possession" as const,
      text: event.actualSuccess
        ? "The catcher secured the ball after it bounced from a missed pickup."
        : "The ball reached this player after a missed pickup. A successful catch would have secured it. Where the ball went after the miss is outside this estimate."
    };
  }
  const moves = event.contextualBounds;
  if (moves?.policy === "final_turn_scoring_rush_envelope") {
    const score = event.metadata.scoringAttemptScore;
    if (!score) return;
    const { scores, ownRoster } = score;
    const own = scores[ownRoster], opposing = scores[1 - ownRoster]!;
    return {
      kind: "touchdown" as const,
      text: `The first Rush die scored immediately in this team's final regulation turn. The score went from ${own}–${opposing} to ${own + 1}–${opposing}. How play might have continued after a miss is uncertain.`
    };
  }
  const available =
    impact && "availableMoves" in impact.components
      ? impact.components.availableMoves
      : undefined;
  const minimum = moves?.minimumMoves ?? available;
  const maximum = moves?.maximumMoves ?? available;
  if (minimum === undefined || maximum === undefined) return;
  const count =
    minimum === maximum ? String(minimum) : `${minimum} to ${maximum}`;
  return {
    kind: event.type === "dodge" ? ("dodge" as const) : ("movement" as const),
    text:
      (event.actualSuccess
        ? "Success kept the turn going."
        : "Failure ended the turn.") +
      ` The estimate counts ${count} other teammates who could make an ordinary move after success.`
  };
}

type ReaderContextMoment = NonNullable<ReturnType<typeof contextComponent>> & {
  event: LuckEvent;
  text: string;
};

function contextMagnitude(moment: ReaderContextMoment) {
  return Math.max(Math.abs(moment.bounds.lower), Math.abs(moment.bounds.upper));
}

// A reading aid, never a match-impact or confidence model. An outcome no more
// likely than its alternative (<= 50%) can be highlighted. Categorical models
// have no binary chance and remain in the category/evidence views.
export function summarizeForReader(report: {
  events: LuckReport["events"];
  modelVersion?: string;
}) {
  const categories = READER_CATEGORIES.map((category) => ({
    ...category,
    observed: 0,
    scored: 0,
    underReview: 0
  }));
  const byType = new Map(categories.map((c) => [c.type, c]));
  const moments: { event: LuckEvent; outcomeChance: number }[] = [];
  const contextByKind = new Map<
    NonNullable<ReturnType<typeof readerContext>>["kind"],
    ReaderContextMoment
  >();
  let scored = 0;
  let observed = 0;
  for (const event of report.events) {
    const underReview = isArmorUnderReview(event, report.modelVersion);
    if (event.metadata.isRollCandidate) {
      observed++;
      const category = byType.get(event.type)!;
      category.observed++;
      if (underReview) category.underReview++;
      else if (event.scoringStatus === "scored") {
        scored++;
        category.scored++;
      }
    }
    if (
      !underReview &&
      event.actualSuccess !== null &&
      (event.contextualImpact ||
        event.contextualBounds ||
        event.possessionBounds ||
        event.catchPossessionBounds)
    ) {
      const component = contextComponent(event);
      const context = component && readerContext(event);
      if (component && context) {
        const moment = { event, text: context.text, ...component };
        const current = contextByKind.get(context.kind);
        if (
          !current ||
          contextMagnitude(moment) > contextMagnitude(current) ||
          (contextMagnitude(moment) === contextMagnitude(current) &&
            (event.metadata.sourceIndex ?? Infinity) <
              (current.event.metadata.sourceIndex ?? Infinity))
        ) {
          contextByKind.set(context.kind, moment);
        }
      }
    }
    const p = event.probabilitySuccess;
    if (
      event.scoringStatus !== "scored" ||
      underReview ||
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
    contextMoments: [
      contextByKind.get("touchdown"),
      contextByKind.get("possession"),
      contextByKind.get("dodge") ?? contextByKind.get("movement")
    ].filter((moment) => moment !== undefined),
    moments: moments.slice(0, 6)
  };
}
