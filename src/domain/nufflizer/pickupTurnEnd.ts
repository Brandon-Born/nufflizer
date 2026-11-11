import type { ReplayModel } from "@/domain/replay/types";
import type { PreRollEvidence } from "@/domain/replay/reconstructContext";
import type { BounceCatchReaction } from "./catchPossession";
import type { LuckEvent } from "./types";

type PickupTurnEnd = NonNullable<LuckEvent["metadata"]["pickupTurnEnd"]>;

// Actual aftermath only. A friendly successful catch does not undo the
// recorded turnover. No hypothetical no-reroll policy is derived from it.
export function findPickupTurnEnds(
  replay: ReplayModel,
  reactions: ReadonlyMap<string, BounceCatchReaction>,
  contexts: ReadonlyMap<string, PreRollEvidence>
) {
  const result = new Map<string, PickupTurnEnd>();
  for (const turn of replay.turns)
    for (let i = 0; i < turn.events.length - 1; i++) {
      const caught = turn.events[i]!,
        end = turn.events[i + 1]!;
      const reaction = reactions.get(caught.id ?? "");
      const p = end.payload;
      if (
        !reaction ||
        !caught.id ||
        !end.id ||
        end.sourceTag !== "EventEndTurn" ||
        end.reasonCode !== 2 ||
        String(p?.Reason) !== "2" ||
        !p ||
        Object.keys(p).some(
          (k) => !["Reason", "NextPlayingGamer"].includes(k)
        ) ||
        (p.NextPlayingGamer !== undefined &&
          !["0", "1"].includes(String(p.NextPlayingGamer))) ||
        caught.sourceIndex === undefined ||
        end.sourceIndex !== caught.sourceIndex + 1 ||
        caught.locator?.replayStep === undefined ||
        caught.locator.childIndex === undefined ||
        end.locator?.replayStep !== caught.locator.replayStep ||
        end.locator.childIndex !== caught.locator.childIndex + 1 ||
        replay.boardCheckpoints?.some(
          (c) =>
            c.afterSourceIndex >= caught.sourceIndex! &&
            c.afterSourceIndex < end.sourceIndex!
        )
      )
        continue;
      result.set(reaction.pickupSourceId, {
        catchSourceId: caught.id,
        endSourceId: end.id,
        ordinaryMoves: contexts.get(reaction.pickupSourceId)
          ?.pickupMoveAvailability
      });
    }
  return result;
}

export function attachPickupTurnEnds(
  proofs: ReadonlyMap<string, PickupTurnEnd>,
  sources: ReadonlyMap<string, LuckEvent>
) {
  for (const [source, proof] of proofs) {
    const pickup = sources.get(source),
      caught = sources.get(proof.catchSourceId),
      end = sources.get(proof.endSourceId);
    if (
      !pickup ||
      caught?.metadata.bounceCatchReaction?.pickupSourceId !== source ||
      end?.metadata.sourceTag !== "EventEndTurn" ||
      end.scoringStatus !== "excluded"
    )
      continue;
    pickup.metadata.pickupTurnEnd = proof;
    end.metadata.turnEndReason = 2;
    end.label = "Recorded turn ended after failed pickup";
    end.statusReason =
      "observed: turn-end reason 2; deterministic aftermath, no additional luck score";
  }
}
