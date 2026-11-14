import { describe, it, expect } from "vitest";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { scopedTraitEffectPlayer } from "@/domain/replay/traitTransitions";
import {
  findBlockTraitEvidence,
  findParticipantTraitEvidence
} from "@/domain/replay/traitContinuity";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { createOwnershipTimeline } from "@/domain/replay/ownershipTimeline";
import { mentalNotificationXml } from "../helpers/mentalNotification";
import type { ReplayEvent } from "@/domain/replay/types";

const tags = ["ResultAddPlayerEffect", "ResultEndPlayerEffect"] as const;
function source(tag: (typeof tags)[number]) {
  const replay = parseReplayXml(mentalNotificationXml(tag));
  const events = replay.turns.flatMap((t) => t.events),
    use = events.find((e) => e.sourceTag === tag)!;
  const header = events.find(
    (e) => e.sourceTag === "PlayerStep" && e.actionId === use.actionId
  )!;
  return { replay, use, header };
}
const invalid: [string, (e: ReplayEvent, h: ReplayEvent) => void][] = [
  [
    "unknown provider",
    (e) => {
      (e.payload!.Effect as Record<string, unknown>).ProviderId = 84;
    }
  ],
  [
    "unknown effect",
    (e) => {
      (e.payload!.Effect as Record<string, unknown>).EffectId = 25;
    }
  ],
  [
    "characteristic modifier",
    (e) => {
      (e.payload!.Effect as Record<string, unknown>).CharacModifiers = {
        Value: 1
      };
    }
  ],
  [
    "additional skills",
    (e) => {
      (e.payload!.Effect as Record<string, unknown>).AdditionalSkills = {
        Skill: 30
      };
    }
  ],
  [
    "unknown duration",
    (e) => {
      (e.payload!.Effect as Record<string, unknown>).Durations = {
        DurationsItem: [1, 6]
      };
    }
  ],
  [
    "unknown effect field",
    (e) => {
      (e.payload!.Effect as Record<string, unknown>).Unknown = 0;
    }
  ],
  [
    "missing holder",
    (e) => {
      delete e.payload!.PlayerId;
    }
  ],
  [
    "string holder",
    (e) => {
      e.payload!.PlayerId = "99";
    }
  ],
  [
    "null holder",
    (e) => {
      e.payload!.PlayerId = null;
    }
  ],
  [
    "foreign holder",
    (e) => {
      e.payload!.PlayerId = 7;
    }
  ],
  [
    "unknown notification field",
    (e) => {
      e.payload!.Unknown = 0;
    }
  ],
  [
    "nested dice",
    (e) => {
      e.payload!.Dice = { Die: { Value: 6 } };
    }
  ],
  [
    "unknown header field",
    (_, h) => {
      h.payload!.Unknown = 0;
    }
  ],
  [
    "evaluation",
    (_, h) => {
      h.payload!.IsEvaluation = 1;
    }
  ],
  [
    "skill header",
    (_, h) => {
      h.payload!.Skill = 51;
    }
  ],
  [
    "unknown state",
    (_, h) => {
      h.payload!.State = 4;
    }
  ],
  [
    "missing state",
    (_, h) => {
      delete h.payload!.State;
    }
  ],
  [
    "missing cell",
    (_, h) => {
      delete h.payload!.CellFrom;
    }
  ],
  [
    "outside pitch",
    (_, h) => {
      h.payload!.CellTo = { X: 26, Y: 5 };
    }
  ],
  [
    "invalid probability",
    (_, h) => {
      h.payload!.Probability = 101;
    }
  ],
  [
    "wrong actor",
    (e) => {
      e.stepActorId = "42";
    }
  ],
  [
    "wrong subject",
    (e) => {
      e.playerId = "42";
    }
  ],
  [
    "wrong target",
    (e) => {
      e.stepTargetId = "42";
    }
  ],
  [
    "attribution conflict",
    (e) => {
      e.attributionConflict = true;
    }
  ],
  [
    "other action",
    (e) => {
      e.actionId = "other";
    }
  ],
  [
    "other sequence",
    (e) => {
      e.sequenceId = "other";
    }
  ],
  [
    "wrong header tag",
    (_, h) => {
      h.sourceTag = "DamageStep";
    }
  ],
  [
    "wrong step type",
    (e) => {
      e.stepType = 6;
    }
  ],
  [
    "wrong source ID",
    (e) => {
      e.id = "source-999";
    }
  ],
  [
    "missing source index",
    (e) => {
      delete e.sourceIndex;
    }
  ],
  [
    "wrong message position",
    (e) => {
      e.locator!.messageIndex = 1;
    }
  ],
  [
    "header message",
    (_, h) => {
      h.locator!.messageIndex = 0;
    }
  ],
  [
    "wrong frame",
    (e) => {
      e.locator!.replayStep!++;
    }
  ],
  [
    "wrong child",
    (e) => {
      e.locator!.childIndex!++;
    }
  ],
  [
    "later step",
    (e) => {
      e.locator!.stepIndex = 1;
    }
  ]
];

describe.each(tags)("qualified inner mental notification %s", (tag) => {
  it.each(invalid)("retains a barrier for %s", (_, mutate) => {
    const { use, header } = source(tag);
    mutate(use, header);
    expect(scopedTraitEffectPlayer(use, header)).toBeUndefined();
  });
  it("requires its own header and leaves all inputs immutable", () => {
    const { replay, use, header } = source(tag),
      before = structuredClone(replay);
    expect(scopedTraitEffectPlayer(use)).toBeUndefined();
    expect(scopedTraitEffectPlayer(use, header)).toBe("99");
    findBlockTraitEvidence(replay);
    expect(replay).toEqual(before);
  });
  it.each([42, 7])(
    "invalidates holder%s without discarding the other participant or restoring the holder",
    (holder) => {
      const replay = parseReplayXml(mentalNotificationXml(tag, { holder })),
        es = replay.turns.flatMap((t) => t.events),
        pool = es.find((e) => e.sourceTag === "QuestionBlockDice")!;
      expect(findBlockTraitEvidence(replay).size).toBe(0);
      const other = holder === 42 ? "7" : "42";
      expect(
        findParticipantTraitEvidence(
          replay,
          new Map([[pool.id!, other]]),
          createOwnershipTimeline(replay)
        ).get(pool.id!)?.playerId
      ).toBe(other);
      expect(
        findParticipantTraitEvidence(
          replay,
          new Map([[pool.id!, String(holder)]]),
          createOwnershipTimeline(replay)
        ).has(pool.id!)
      ).toBe(false);
      const r = LuckReportSchema.parse(analyzeReplayLuck(replay));
      expect(r.events.find((e) => e.metadata.block)!.scoringStatus).toBe(
        "excluded"
      );
    }
  );
  it("never fills an omitted current tackle-zone observation from the learned-list seed", () => {
    const replay = parseReplayXml(
      mentalNotificationXml(tag, { missingZone: true })
    );
    const r = LuckReportSchema.parse(analyzeReplayLuck(replay)),
      pool = r.events.find((e) => e.metadata.block)!;
    expect(pool.metadata.block!.traitEvidence?.attacker.tackleZone).toBeNull();
    expect(pool.metadata.block!.skillModel).toBeUndefined();
    expect(pool.scoringStatus).toBe("excluded");
    expect(pool.contextualImpact).toBeUndefined();
    expect(pool.weightedDelta).toBe(0);
  });
  it("has zero mean over six fair faces for the unchanged ordinary block policy", () => {
    // Skull / BothDown / Push / Push / Stumble / Down: values -1/0/0/0/1/1.
    const die = [0, 1, 2, 2, 3, 4],
      out = [0, 1, 4, 4, 6, 6],
      expected = [-1, 0, 0, 0, 1, 1];
    let sum = 0;
    for (let i = 0; i < 6; i++) {
      const r = LuckReportSchema.parse(
          analyzeReplayLuck(
            parseReplayXml(
              mentalNotificationXml(tag, { face: die[i], outcome: out[i] })
            )
          )
        ),
        pool = r.events.find((e) => e.metadata.block)!;
      expect(pool.delta).toBeCloseTo(expected[i]! - 1 / 6, 12);
      sum += pool.weightedDelta;
    }
    expect(sum).toBeCloseTo(0, 12);
  });
  it("retains an accepted prefix independently of future unknown effects and final-score edits", () => {
    const before = LuckReportSchema.parse(
      analyzeReplayLuck(parseReplayXml(mentalNotificationXml(tag)))
    );
    const after = LuckReportSchema.parse(
      analyzeReplayLuck(
        parseReplayXml(
          mentalNotificationXml(tag, {
            suffix:
              "<ReplayStep><EventAddEffect><Unknown>99</Unknown></EventAddEffect><BoardState><CurrentPhase>7</CurrentPhase></BoardState><EventMatchEnd/></ReplayStep>"
          })
        )
      )
    );
    expect(after.events.find((e) => e.metadata.block)).toEqual(
      before.events.find((e) => e.metadata.block)
    );
  });
});
