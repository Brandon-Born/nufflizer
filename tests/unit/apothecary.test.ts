import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { playbackFragment } from "../helpers/playback";

const usage = "QuestionApothecaryCasualtyUsage";
const choice = "QuestionApothecaryCasualtyChoice";
const result = "ResultApothecary";

describe("Apothecary evidence (NUF-011/013/014/018)", () => {
  it("retains an original and a replacement through real readiness and timer records", () => {
    const report = analyzeNufflizerInput(
      readFileSync("demo-replays/demo3.bbr", "utf8")
    );
    // Standalone stdlib extraction, independent of the app's report model.
    const outcomes = report.events.filter((e) => e.metadata.apothecary);
    expect(
      outcomes.find((e) => e.metadata.locator?.replayStep === 129)
    ).toMatchObject({
      playerId: "11",
      teamId: "0",
      metadata: {
        apothecary: {
          applied: "original",
          appliedCasualty: 7,
          resourceSpent: 0
        }
      }
    });
    const replacement = outcomes.find(
      (e) => e.metadata.locator?.replayStep === 244
    )!;
    expect(replacement).toMatchObject({
      playerId: "45",
      teamId: "1",
      metadata: {
        apothecary: {
          applied: "replacement",
          appliedCasualty: 0,
          resourceSpent: 1
        }
      }
    });
    expect(
      report.events.find(
        (e) =>
          e.metadata.sourceId ===
          replacement.metadata.apothecary?.originalSourceId
      )
    ).toMatchObject({
      metadata: { dice: [10], outcomeCode: 3, isRollCandidate: true }
    });
    expect(
      report.events.find(
        (e) =>
          e.metadata.sourceId ===
          replacement.metadata.apothecary?.replacementSourceId
      )
    ).toMatchObject({
      metadata: { dice: [2], outcomeCode: 0, isRollCandidate: true }
    });
  });
  it.each([
    ["002", "UI-060", [8], [47], "0", "8", 0, [8], 2, [1], 0, "replacement"],
    [
      "021",
      "UI-065",
      [10],
      [48],
      "1",
      "48",
      1,
      [13, 6],
      9,
      [15],
      10,
      "original"
    ],
    ["021", "UI-066", [2], [43], "0", "2", 0, [16], 10, [10], 3, "replacement"]
  ] as const)(
    "retains %s %s casualty dice and the applied coach choice",
    (
      source,
      id,
      home,
      away,
      team,
      player,
      gamerId,
      original,
      originalOutcome,
      replacement,
      replacementOutcome,
      applied
    ) => {
      const replay = playbackFragment(source, id, [...home], [...away]);
      const report = LuckReportSchema.parse(analyzeReplayLuck(replay));
      const records = report.events.filter((e) =>
        [usage, choice, result].includes(e.metadata.sourceTag)
      );
      expect(records).toHaveLength(3);
      const [a, b, c] = records;
      expect(a).toMatchObject({
        teamId: team,
        playerId: player,
        probabilitySuccess: null,
        metadata: {
          sourceTag: usage,
          dice: original,
          outcomeCode: originalOutcome,
          isRollCandidate: true,
          rollType: 12
        }
      });
      expect(b).toMatchObject({
        teamId: team,
        playerId: player,
        probabilitySuccess: null,
        metadata: {
          sourceTag: choice,
          dice: replacement,
          outcomeCode: replacementOutcome,
          isRollCandidate: true,
          rollType: 12
        }
      });
      expect(c).toMatchObject({
        teamId: team,
        playerId: player,
        probabilitySuccess: null,
        metadata: {
          sourceTag: result,
          isRollCandidate: false,
          apothecary: {
            originalSourceId: a!.metadata.sourceId,
            replacementSourceId: b!.metadata.sourceId,
            gamerId,
            resourceSpent: 1,
            applied,
            appliedCasualty:
              applied === "original" ? originalOutcome : replacementOutcome
          }
        }
      });
      expect(records.every((e) => e.weightedDelta === 0)).toBe(true);
    }
  );

  it("counts UI-064's treated Stunty injury once and records no fresh replacement", () => {
    const report = LuckReportSchema.parse(
      analyzeReplayLuck(playbackFragment("001", "UI-064", [], [38]))
    );
    const injury = report.events.find((e) => e.metadata.sourceTag === usage)!;
    expect(injury).toMatchObject({
      teamId: "1",
      metadata: { dice: [5, 4], rollType: 11, isRollCandidate: true }
    });
    expect(
      report.events.find((e) => e.metadata.sourceTag === choice)
    ).toBeUndefined();
    expect(
      report.events.find((e) => e.metadata.sourceTag === result)
    ).toMatchObject({
      metadata: {
        isRollCandidate: false,
        apothecary: {
          originalSourceId: injury.metadata.sourceId,
          resourceSpent: 1,
          applied: "injury_treatment"
        }
      }
    });
  });

  it("keeps both rolls visible but withholds the decision when the chooser disagrees", () => {
    const replay = playbackFragment("002", "UI-060", [8], [47]);
    const decision = replay.turns
      .flatMap((t) => t.events)
      .find((e) => e.sourceTag === choice)!;
    decision.payload!.GamerId = 1;
    const records = analyzeReplayLuck(replay).events.filter((e) =>
      [usage, choice, result].includes(e.metadata.sourceTag)
    );
    expect(records.filter((e) => e.metadata.isRollCandidate)).toHaveLength(2);
    expect(
      records.find((e) => e.metadata.sourceTag === result)?.metadata.apothecary
    ).toBeUndefined();
  });

  it("counts a matching direct original only once", () => {
    const replay = playbackFragment("002", "UI-060", [8], [47]);
    const turn = replay.turns.find((t) =>
      t.events.some((e) => e.sourceTag === usage)
    )!;
    const at = turn.events.findIndex((e) => e.sourceTag === usage);
    const original = turn.events[at]!;
    turn.events.splice(at, 0, {
      ...original,
      id: "direct-original",
      sourceTag: "ResultCasualtyRoll",
      type: "casualty",
      rollType: 12,
      payload: original.payload!.RollInfos as Record<string, unknown>
    });
    const report = LuckReportSchema.parse(analyzeReplayLuck(replay));
    const casualties = report.events.filter(
      (e) => e.metadata.rollType === 12 && e.metadata.isRollCandidate
    );
    expect(casualties.map((e) => e.metadata.sourceTag)).toEqual([
      "ResultCasualtyRoll",
      choice
    ]);
    expect(
      report.events.find((e) => e.metadata.sourceTag === result)?.metadata
        .apothecary?.applied
    ).toBe("replacement");
  });
});
