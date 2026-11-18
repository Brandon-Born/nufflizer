import { readdirSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { scoreThrough } from "@/domain/replay/scoreContinuity";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";

function source(file: string) {
  const replay = parseReplayXml(
    decodeReplayInput(readFileSync(`demo-replays/${file}.bbr`, "utf8")).xml
  );
  const raw = new Map(
    replay.turns.flatMap((turn) =>
      turn.events.map((row) => [row.sourceIndex!, row] as const)
    )
  );
  const checkpoints = replay.boardCheckpoints!;
  return {
    replay,
    raw,
    checkpoints,
    score: (through: number) =>
      scoreThrough(checkpoints, raw, through, ["0", "1"])
  };
}

it("keeps the three demo5 touchdowns on their own confirmed boards", () => {
  const { score, replay } = source("demo5");
  expect(score(795)?.scores).toEqual([0, 0]);
  expect(score(803)).toBeUndefined();
  expect(score(811)?.scores).toEqual([1, 0]);
  expect(score(1890)).toBeUndefined();
  expect(score(3970)).toEqual({
    scores: [2, 0],
    touchdowns: [
      {
        sourceIndex: 803,
        scorerId: 10,
        roster: 0,
        confirmedCheckpointAfter: 811,
        observedScore: 1
      },
      {
        sourceIndex: 1890,
        scorerId: 9,
        roster: 0,
        confirmedCheckpointAfter: 1898,
        observedScore: 2
      }
    ]
  });
  expect(score(4007)?.scores).toEqual([2, 1]);
  const report = LuckReportSchema.parse(analyzeReplayLuck(replay));
  const late = report.events.find(
    (e) => e.metadata.sourceId === "source-3997"
  )!;
  expect(late.metadata.scoringAttemptScore?.scores).toEqual([2, 0]);
  expect(late.contextualImpact).toBeUndefined();
  const proof = late.metadata.scoringAttemptScore!;
  proof.touchdowns[0]!.confirmedCheckpointAfter++;
  expect(LuckReportSchema.safeParse(report).success).toBe(false);
});

it.each(["retained die", "unsupported move", "wrong counter"])(
  "withholds demo5 score continuity for a %s",
  (change) => {
    const { raw, score, checkpoints } = source("demo5");
    if (change === "retained die") raw.get(799)!.payload!.NewRoll = 0;
    if (change === "unsupported move") raw.get(1876)!.payload!.Moved = 0;
    if (change === "wrong counter") {
      checkpoints.find(
        (row) => row.afterSourceIndex === 811
      )!.board!.teams[0]!.touchdowns = 2;
    }
    expect(score(3970)).toBeUndefined();
  }
);

it.each([
  {
    file: "demo1",
    index: 5271,
    score: [0, 0],
    rerolls: 2,
    upper: 4 / 3,
    goal: 5275,
    confirmed: 5287
  },
  {
    file: "demo5",
    index: 3997,
    score: [2, 0],
    rerolls: 1,
    upper: 2 / 3,
    goal: 4001,
    confirmed: 4007
  }
])("bounds $file's final-turn touchdown on its first die", (example) => {
  const report = LuckReportSchema.parse(
    analyzeReplayLuck(source(example.file).replay)
  );
  const rush = report.events.find(
    (event) => event.metadata.sourceIndex === example.index
  )!;
  expect(rush.metadata.scoringAttemptScore?.scores).toEqual(example.score);
  expect(rush.contextualImpact).toBeUndefined();
  expect(rush.delta).toBeCloseTo(1 / 6, 12);
  const bound = rush.contextualBounds;
  expect(bound).toMatchObject({
    policy: "final_turn_scoring_rush_envelope",
    successChance: 5 / 6,
    observedTeamRerolls: example.rerolls,
    lower: 0,
    upper: example.upper,
    confirmedGoal: {
      sourceIndex: example.goal,
      confirmedCheckpointAfter: example.confirmed
    }
  });
  if (bound?.policy !== "final_turn_scoring_rush_envelope")
    throw new Error("Expected a scoring range");
  bound.confirmedGoal.confirmedCheckpointAfter++;
  expect(LuckReportSchema.safeParse(report).success).toBe(false);
});

it.each([
  "zero rerolls",
  "missing rerolls",
  "contradictory scoreboard",
  "unrecognized die"
])("withholds the final-turn range with %s", (change) => {
  const { replay, raw, checkpoints } = source("demo5");
  const before = checkpoints.find((cp) => cp.afterSourceIndex === 3970)!.board!;
  if (change === "zero rerolls") before.teams[1]!.rerolls = 0;
  if (change === "missing rerolls") before.teams[1]!.rerolls = null;
  if (change === "contradictory scoreboard")
    checkpoints.find(
      (cp) => cp.afterSourceIndex === 4007
    )!.board!.teams[1]!.touchdowns = 2;
  if (change === "unrecognized die") raw.get(3997)!.payload!.NewRoll = 0;
  const rush = analyzeReplayLuck(replay).events.find(
    (event) => event.metadata.sourceIndex === 3997
  );
  expect(rush?.contextualBounds?.policy).not.toBe(
    "final_turn_scoring_rush_envelope"
  );
});

it("reconciles demo7's left end-zone goals and demo8's pre-goal pickup", () => {
  const demo7 = source("demo7");
  expect(demo7.raw.get(1010)!.payload!.Cell).toEqual({ Y: "12" });
  expect(demo7.score(4255)?.scores).toEqual([0, 2]);
  const demo8 = source("demo8");
  expect(demo8.score(739)?.scores).toEqual([1, 0]);
  demo8.raw.get(707)!.payload!.Outcome = 0;
  expect(demo8.score(739)).toBeUndefined();
});

it("reconciles the handoff catch and committed pickup at their confirming checkpoints", () => {
  const demo6 = source("demo6");
  expect(demo6.score(1868)?.scores).toEqual([0, 0]);
  expect(demo6.score(1878)).toBeUndefined();
  expect(demo6.score(1879)).toEqual({
    scores: [0, 1],
    touchdowns: [
      {
        sourceIndex: 1877,
        scorerId: 41,
        roster: 1,
        confirmedCheckpointAfter: 1879,
        observedScore: 1
      }
    ]
  });
  const demo10 = source("demo10");
  expect(demo10.score(2607)?.scores).toEqual([0, 1]);
  expect(demo10.score(2622)).toBeUndefined();
  const tied = demo10.score(2623);
  expect(tied?.scores).toEqual([1, 1]);
  expect(tied?.touchdowns.at(-1)).toEqual({
    sourceIndex: 2612,
    scorerId: 3,
    roster: 0,
    confirmedCheckpointAfter: 2623,
    observedScore: 1
  });
});

it.each([
  ["a different handoff target", 1872, "stepTargetId", "40"],
  ["an unsuccessful transfer", 1873, "sourceTag", "ResultNoRollFailure"],
  ["a different catcher's action", 1875, "actionId", "other-action"]
] as const)("withholds the handoff goal after %s", (_, index, key, value) => {
  const demo6 = source("demo6");
  Object.assign(demo6.raw.get(index)!, { [key]: value });
  expect(demo6.score(1879)).toBeUndefined();
});

it.each([
  ["a declined retry", 2609, { Used: 0 }],
  ["the other team's reroll", 2609, { GamerId: 1 }],
  ["a different pickup square", 2608, { CellTo: { X: 25, Y: 8 } }],
  ["a retained die", 2610, { NewRoll: 0 }],
  ["a different threshold", 2610, { Requirement: 4, Difficulty: 4 }]
] as const)("withholds the pickup goal after %s", (_, index, fields) => {
  const demo10 = source("demo10");
  Object.assign(demo10.raw.get(index)!.payload!, fields);
  expect(demo10.score(2623)).toBeUndefined();
});

it("reconciles every touchdown in the twelve public replays", () => {
  const files = readdirSync("demo-replays").filter((file) =>
    file.endsWith(".bbr")
  );
  expect(files).toHaveLength(12);
  let total = 0;
  for (const file of files) {
    const { raw, checkpoints, score } = source(file.slice(0, -4));
    for (const [index, event] of raw) {
      if (event.sourceTag !== "EventTouchdown") continue;
      const confirmed = checkpoints.find((cp) => cp.afterSourceIndex > index)!;
      expect(
        score(confirmed.afterSourceIndex)?.touchdowns.at(-1),
        file
      ).toMatchObject({
        sourceIndex: index,
        scorerId: Number(event.payload?.PlayerId),
        confirmedCheckpointAfter: confirmed.afterSourceIndex
      });
      total++;
    }
  }
  expect(total).toBe(23);
}, 45000);
