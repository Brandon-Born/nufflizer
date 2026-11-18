import { ownerAt, type OwnershipTimeline } from "./ownershipTimeline";
import type { ReplayEvent } from "./types";

type Fields = Record<string, unknown>;
const exact = (actual: Fields | undefined, expected: Fields) =>
  !!actual &&
  Object.keys(actual).length === Object.keys(expected).length &&
  Object.entries(expected).every(([key, value]) => actual[key] === value);
const atRoot = (event: ReplayEvent, replayStep: number, childIndex: number) =>
  event.locator?.replayStep === replayStep &&
  event.locator.childIndex === childIndex &&
  event.locator.stepIndex === undefined &&
  event.locator.messageIndex === undefined &&
  !event.attributionConflict &&
  !event.executionExclusion;

// A failed argument, repeated offer and recorded decision can preserve the
// other profiles. The ordinary removal reducer still invalidates the ejection.
export function refereeTraitTransitions(
  events: readonly ReplayEvent[],
  owners: OwnershipTimeline
) {
  const scopes = new Set<string>();
  for (const [i, offer] of events.entries()) {
    if (
      offer.sourceTag !== "QuestionBribeUsage" ||
      !offer.playerId ||
      !offer.id
    )
      continue;
    const frame = offer.locator?.replayStep,
      child = offer.locator?.childIndex;
    const playerId = offer.playerId,
      gamerId = offer.payload?.GamerId;
    const offered = {
      PlayerId: playerId,
      GamerId: gamerId,
      Reason: "1",
      BribeAvailable: "1"
    };
    if (
      frame === undefined ||
      child === undefined ||
      !atRoot(offer, frame, child) ||
      typeof gamerId !== "string" ||
      !gamerId ||
      !exact(offer.payload, { ...offered, ArgueAvailable: "1" })
    )
      continue;
    const firstCarrier = events[i + 1],
      argue = events[i + 2],
      again = events[i + 3];
    const secondCarrier = events[i + 4],
      decision = events[i + 5],
      sent = events[i + 6],
      removed = events[i + 7];
    if (
      firstCarrier?.sourceTag !== "Carrier" ||
      !firstCarrier.checkpointCarrier ||
      secondCarrier?.sourceTag !== "Carrier" ||
      !secondCarrier.checkpointCarrier ||
      !argue ||
      !again?.id ||
      !decision?.id ||
      !sent ||
      !removed ||
      [firstCarrier, argue, again, secondCarrier, decision, sent, removed].some(
        (event, index) => event.sourceIndex !== offer.sourceIndex! + index + 1
      ) ||
      argue.sourceTag !== "ResultRoll" ||
      !atRoot(argue, frame + 1, 1) ||
      again.sourceTag !== "QuestionBribeUsage" ||
      !atRoot(again, frame + 1, 2) ||
      !exact(again.payload, offered) ||
      again.playerId !== playerId ||
      decision.sourceTag !== "ResultNoContest" ||
      !atRoot(decision, frame + 2, 1) ||
      !exact(decision.payload, {}) ||
      sent.sourceTag !== "ResultPlayerSentOff" ||
      !atRoot(sent, frame + 2, 2) ||
      !exact(sent.payload, { PlayerId: playerId, Reason: "1" }) ||
      sent.playerId !== playerId ||
      removed.sourceTag !== "ResultPlayerRemoval" ||
      !atRoot(removed, frame + 2, 3) ||
      !exact(removed.payload, {
        PlayerId: playerId,
        Situation: "5",
        Reason: "2",
        Status: "6"
      }) ||
      removed.playerId !== playerId
    )
      continue;
    const { Dice, ...fields } = argue.payload ?? {};
    const dice = Dice as { Die?: { Value?: unknown } } | undefined;
    const face = dice?.Die?.Value;
    const team = ownerAt(owners, playerId, offer);
    if (
      !exact(fields, {
        Requirement: "6",
        Difficulty: "6",
        RollType: "30",
        Modifiers: "",
        Outcome: "2"
      }) ||
      !exact(dice, { Die: dice?.Die }) ||
      !exact(dice?.Die, { Value: face }) ||
      typeof face !== "string" ||
      !/^[2-5]$/.test(face) ||
      team === undefined ||
      [again, sent, removed].some(
        (event) => ownerAt(owners, playerId, event) !== team
      )
    )
      continue;
    scopes.add(offer.id);
    scopes.add(again.id);
    scopes.add(decision.id);
  }
  return scopes;
}
