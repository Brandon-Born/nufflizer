import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, it, expect } from "vitest";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { preservesTraitContinuity } from "@/domain/replay/traitTransitions";
import { visitCurrentTraits } from "@/domain/replay/traitContinuity";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { mentalNotificationXml } from "../helpers/mentalNotification";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import type { ReplayEvent } from "@/domain/replay/types";

const facts = JSON.parse(
  readFileSync("tests/fixtures/evidence/bb3-ko-continuity.json", "utf8")
);
function koContinuityXml(face = 2, target = 4) {
  const input = mentalNotificationXml("ResultAddPlayerEffect");
  const result = face >= target ? "<Outcome>1</Outcome>" : "";
  const mod =
    target === 3
      ? "<Modifier><ModifierType>20</ModifierType><Value>1</Value></Modifier>"
      : "";
  const ko = `<EventRoll><Requirement>4</Requirement><Difficulty>${target}</Difficulty><RollType>13</RollType><PlayerId>99</PlayerId><Modifiers>${mod}</Modifiers><Dice><Die><Value>${face}</Value></Die></Dice>${result}</EventRoll>`;
  return input.replace(
    /<EventExecuteSequence>[\s\S]*?<\/EventExecuteSequence>/,
    ko
  );
}
describe("direct KO recovery preserves learned traits independently of physical return", () => {
  it("restores demo5 players only after a recorded recovery and a matching on-pitch board", () => {
    const replay = parseReplayXml(
      decodeReplayInput(readFileSync("demo-replays/demo5.bbr", "utf8")).xml,
      { omitRawReplaySteps: true }
    );
    const collect = () => {
      const observations = new Map<number, string[]>();
      visitCurrentTraits(replay, (event, _, ledger) => {
        if (
          [113, 405, 812, 1557, 1899, 1914, 2329, 2345, 2409].includes(
            event.sourceIndex!
          )
        ) {
          observations.set(
            event.sourceIndex!,
            ["6", "45", "46"].filter((id) => ledger.has(id))
          );
          if (event.sourceIndex === 2409 && ledger.has("46"))
            expect(ledger.get("46")).toMatchObject({
              teamId: "1",
              observedCheckpointAfter: 0,
              currentCheckpointAfter: 2406,
              traits: { dataPlayerId: 46, innateSkills: [], acquiredSkills: [] }
            });
        }
      });
      return observations;
    };
    expect([...collect()]).toEqual([
      [113, ["6", "45"]],
      [405, ["45"]],
      [812, ["6", "45"]],
      [1557, ["6"]],
      [1899, ["6"]],
      [1914, ["6", "45"]],
      [2329, ["6", "45"]],
      [2345, ["6", "45", "46"]],
      [2409, ["6", "45", "46"]]
    ]);
    const wake = replay.turns
      .flatMap((turn) => turn.events)
      .find((event) => event.sourceIndex === 805)!;
    wake.payload!.Dice = { Die: { Value: "2" } };
    delete wake.payload!.Outcome;
    expect(collect().get(2409)).toEqual(["45", "46"]);
    wake.payload!.Dice = { Die: { Value: "6" } };
    wake.payload!.Outcome = "1";
    const removed = replay.turns
      .flatMap((turn) => turn.events)
      .find((event) => event.sourceIndex === 1552)!;
    removed.payload!.Reason = 2;
    expect(collect().get(2409)).toEqual(["6", "46"]);
    removed.payload!.Reason = 1;
    const later = replay.boardCheckpoints!.find(
      (cp) => cp.afterSourceIndex === 1898
    )!;
    const returned = later.board!.teams[1]!.players.find(
      (player) => player.id === 45
    )!;
    returned.effectsKnownEmpty = false;
    expect(collect().get(2409)).toEqual(["6", "46"]);
  });

  it("reproduces all77 raw root records and the separate UI-040 witness", () => {
    const p = spawnSync(
      "python3",
      ["scripts/extract-ko-continuity-evidence.py", "--check"],
      { encoding: "utf8" }
    );
    expect(p.status, p.stderr).toBe(0);
    expect(facts.rollTypeCounts).toEqual({ "13": 77 });
    expect(facts.files).toHaveLength(12);
    for (const f of facts.files)
      expect(
        createHash("sha256")
          .update(readFileSync("demo-replays/" + f.file))
          .digest("hex")
      ).toBe(f.sha256);
    const w = facts.witness;
    expect(
      createHash("sha256")
        .update(readFileSync("tests/fixtures/evidence/" + w.fixture))
        .digest("hex")
    ).toBe(w.sha256);
    expect(w.case.id).toBe("UI-040");
    expect(w.case.eventRecords).toHaveLength(2);
    expect(w.case.eventRecords[0].projection.EventRoll).not.toHaveProperty(
      "Outcome"
    );
  });
  it("joins all77 direct shapes before considering their contribution or ownership", () => {
    let n = 0;
    for (const f of facts.files) {
      const p = parseReplayXml(
        decodeReplayInput(readFileSync("demo-replays/" + f.file, "utf8")).xml,
        { omitRawReplaySteps: true }
      );
      for (const raw of f.records) {
        const e = p.turns
          .flatMap((t) => t.events)
          .find(
            (e) =>
              e.sourceTag === "EventRoll" &&
              e.locator?.replayStep === raw.locator.replayStep &&
              e.locator?.childIndex === raw.locator.childIndex
          )!;
        expect(e.payload).toEqual(raw.payload);
        expect(preservesTraitContinuity(e)).toBe(true);
        n++;
      }
    }
    expect(n).toBe(77);
  });
  it.each([
    [2, 4],
    [5, 4],
    [2, 3],
    [3, 3]
  ])(
    "preserves the unchanged block table after face%s / target%s without a full Data refresh",
    (face, target) => {
      const r = analyzeNufflizerInput(koContinuityXml(face, target)),
        pool = r.events.find((e) => e.metadata.block)!;
      expect(
        pool.metadata.block!.traitEvidence?.attacker.observedCheckpointAfter
      ).toBe(0);
      expect(pool).toMatchObject({
        scoringStatus: "scored",
        delta: 5 / 6,
        weightedDelta: 5 / 8
      });
      expect(pool.metadata.block!.skillModel!.expectedValue).toBeCloseTo(
        1 / 6,
        12
      );
      expect(pool.contextualImpact).toBeUndefined();
      expect(r.verdict.luckierTeam).toBe("unknown");
      // Omitted root TeamId still cannot certify ownership/probability of the KO die.
      expect(
        r.events.find((e) => e.metadata.sourceTag === "EventRoll")!
          .scoringStatus
      ).toBe("excluded");
    }
  );
  const invalid: [string, (e: ReplayEvent) => void][] = [
    [
      "unknown root field",
      (e) => {
        e.payload!.Unknown = 0;
      }
    ],
    [
      "different roll",
      (e) => {
        e.payload!.RollType = "34";
      }
    ],
    [
      "different derived roll",
      (e) => {
        e.rollType = 34;
      }
    ],
    [
      "numeric root scalars",
      (e) => {
        e.payload!.Requirement = 4;
      }
    ],
    [
      "missing difficulty",
      (e) => {
        delete e.payload!.Difficulty;
      }
    ],
    [
      "unknown target",
      (e) => {
        e.payload!.Difficulty = "2";
      }
    ],
    [
      "unexplained modifier",
      (e) => {
        e.payload!.Modifiers = { Modifier: { ModifierType: "21", Value: "1" } };
      }
    ],
    [
      "missing holder",
      (e) => {
        delete e.payload!.PlayerId;
      }
    ],
    [
      "unsafe holder",
      (e) => {
        e.payload!.PlayerId = "9007199254740992";
      }
    ],
    [
      "mismatched holder",
      (e) => {
        e.playerId = "42";
      }
    ],
    [
      "unknown team namespace",
      (e) => {
        e.payload!.TeamId = "2";
      }
    ],
    [
      "die type",
      (e) => {
        e.payload!.Dice = { Die: { Value: "2", DieType: "0" } };
      }
    ],
    [
      "two dice",
      (e) => {
        e.payload!.Dice = { Die: [{ Value: "2" }, { Value: "3" }] };
      }
    ],
    [
      "invalid face",
      (e) => {
        e.payload!.Dice = { Die: { Value: "7" } };
      }
    ],
    [
      "numeric face",
      (e) => {
        e.payload!.Dice = { Die: { Value: 2 } };
      }
    ],
    [
      "explicit zero outcome",
      (e) => {
        e.payload!.Outcome = "0";
      }
    ],
    [
      "contradictory outcome",
      (e) => {
        e.payload!.Outcome = "1";
      }
    ],
    [
      "new-roll flag",
      (e) => {
        e.payload!.NewRoll = "1";
      }
    ],
    [
      "encoded action",
      (e) => {
        e.actionId = "sequence-1-step-0";
      }
    ],
    [
      "step metadata",
      (e) => {
        e.stepTag = "PlayerStep";
      }
    ],
    [
      "inner message locator",
      (e) => {
        e.locator!.messageIndex = 0;
      }
    ],
    [
      "source conflict",
      (e) => {
        e.attributionConflict = true;
      }
    ],
    [
      "wrong source ID",
      (e) => {
        e.id = "source-999";
      }
    ],
    [
      "missing frame",
      (e) => {
        delete e.locator!.replayStep;
      }
    ]
  ];
  it.each(invalid)("keeps a continuity barrier for %s", (_, mutate) => {
    const p = parseReplayXml(koContinuityXml()),
      e = p.turns
        .flatMap((t) => t.events)
        .find((e) => e.sourceTag === "EventRoll")!;
    mutate(e);
    expect(preservesTraitContinuity(e)).toBe(false);
  });
  it("does not use incidental sequence grouping as a legal activation or restore omitted physical state", () => {
    const p = parseReplayXml(koContinuityXml()),
      before = structuredClone(p);
    const e = p.turns
      .flatMap((t) => t.events)
      .find((e) => e.sourceTag === "EventRoll")!;
    expect(e.sequenceId).toBe("sequence-0");
    expect(e.actionId).toBeUndefined();
    expect(preservesTraitContinuity(e)).toBe(true);
    for (const team of p.boardCheckpoints![1]!.board!.teams)
      for (const player of team.players) player.tackleZone = null;
    const r = LuckReportSchema.parse(analyzeReplayLuck(p)),
      pool = r.events.find((e) => e.metadata.block)!;
    expect(pool.metadata.block!.traitEvidence?.attacker.tackleZone).toBeNull();
    expect(pool.metadata.block!.skillModel).toBeUndefined();
    expect(pool.scoringStatus).toBe("excluded");
    const snapshot = structuredClone(p);
    analyzeReplayLuck(p);
    expect(p).toEqual(snapshot);
    expect(p).not.toEqual(before);
  });
  it("requires the existing supported replay version and cannot seed lists from a later partial snapshot", () => {
    const p = parseReplayXml(koContinuityXml());
    p.replayVersion = "1-5-0-0";
    expect(
      analyzeReplayLuck(p).events.find((e) => e.metadata.block)?.metadata.block
        ?.traitEvidence
    ).toBeUndefined();
    const missing = parseReplayXml(koContinuityXml());
    missing.boardCheckpoints!.shift();
    expect(
      analyzeReplayLuck(missing).events.find((e) => e.metadata.block)?.metadata
        .block?.traitEvidence
    ).toBeUndefined();
  });
});
