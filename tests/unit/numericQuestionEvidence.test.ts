import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
type Projection = { [key: string]: (string | Projection)[] };
type Locator = {
  replayStep: number;
  childIndex: number;
  stepIndex: number;
  messageIndex: number;
};
const evidence = JSON.parse(
  readFileSync(
    "tests/fixtures/evidence/bb3-numeric-question-originals.json",
    "utf8"
  )
) as {
  files: {
    file: string;
    sha256: string;
    cases: {
      locator: Locator;
      stepTag: string;
      step: Projection;
      question: Projection;
      initialRoll: Projection;
    }[];
  }[];
};
const key = (l: Partial<Locator> | undefined) =>
  JSON.stringify([l?.replayStep, l?.childIndex, l?.stepIndex, l?.messageIndex]);
const n = (p: Projection, k: string) => Number(p[k]?.[0]);
const newSources: Record<string, string[]> = {
  "demo11.bbr": ["source-4546"],
  "demo4.bbr": ["source-1715"],
  "demo9.bbr": ["source-3154"]
};
describe("independent embedded numeric original source evidence", () => {
  it("reproduces all questions without choosing any later outcome or application admission", () => {
    const run = spawnSync(
      "python3",
      ["scripts/extract-numeric-question-originals.py", "--check"],
      { encoding: "utf8" }
    );
    expect(run.status, run.stderr).toBe(0);
    expect(evidence.files).toHaveLength(12);
    expect(evidence.files.reduce((sum, f) => sum + f.cases.length, 0)).toBe(83);
  });
  it.each(evidence.files)(
    "retains every actual first draw and its prefix in $file",
    (f) => {
      const bytes = readFileSync(`demo-replays/${f.file}`);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(f.sha256);
      const replay = parseReplayXml(decodeReplayInput(bytes.toString()).xml, {
        omitRawReplaySteps: true
      });
      const full = LuckReportSchema.parse(analyzeReplayLuck(replay));
      expect(
        full.events
          .filter((e) => e.metadata.numericOriginal)
          .map((e) => e.metadata.sourceId)
      ).toEqual(newSources[f.file] ?? []);
      const fullByLocator = new Map(
        full.events
          .filter((e) => e.metadata.sourceTag === "QuestionTeamRerollUsage")
          .map((e) => [key(e.metadata.locator), e])
      );
      const rawByLocator = new Map(
        replay.turns
          .flatMap((t) => t.events)
          .filter((e) => e.sourceTag === "QuestionTeamRerollUsage")
          .map((e) => [key(e.locator), e])
      );
      for (const c of f.cases) {
        const q = fullByLocator.get(key(c.locator))!,
          raw = rawByLocator.get(key(c.locator))!;
        const roll = c.initialRoll,
          die = (roll.Dice![0] as Projection).Die![0] as Projection;
        const target = n(roll, "Difficulty"),
          face = n(die, "Value"),
          p = (7 - target) / 6;
        expect(c.stepTag).toBe("PlayerStep");
        expect(n(roll, "Status")).toBe(1);
        expect(n(roll, "NewRoll")).toBe(1);
        expect(n(roll, "Outcome")).toBe(0);
        expect(n(die, "DieType")).toBe(0);
        expect(face).toBeLessThan(target);
        if (newSources[f.file]?.includes(q.metadata.sourceId!)) {
          expect(q.metadata.initialRosterName).toBe(
            f.file === "demo9.bbr" ? undefined : "Player 16"
          );
        }
        expect(q.playerId).toBe(String(n(c.step, "PlayerId")));
        expect(q.teamId).toBe(String(n(c.question, "GamerId")));
        const record = full.diceRecords.find(
          (d) =>
            d.parentSourceId === q.metadata.sourceId &&
            JSON.stringify(d.path) === '["RollInfos","Dice"]'
        )!;
        expect(record.disposition).toBe("covered_roll");
        expect(record.dice).toEqual([{ dieType: 0, value: face }]);
        // The hypothetical input ends at the question. No later choice/gate or
        // successful/failing replacement can select admission of this die.
        const limit = raw.sourceIndex!;
        const cut = {
          ...replay,
          turns: replay.turns
            .map((t) => ({
              ...t,
              events: t.events.filter(
                (e) => (e.sourceIndex ?? Infinity) <= limit
              )
            }))
            .filter((t) => t.events.length),
          boardCheckpoints: replay.boardCheckpoints?.filter(
            (cp) => cp.afterSourceIndex < limit
          ),
          endDiceSnapshots: replay.endDiceSnapshots?.filter(
            (cp) => cp.afterSourceIndex < limit
          )
        };
        const before = LuckReportSchema.parse(analyzeReplayLuck(cut));
        const first = before.events.find(
          (e) => e.metadata.sourceId === q.metadata.sourceId
        )!;
        expect(first.scoringStatus).toBe("scored");
        expect(first.metadata.numericOriginal).toEqual({
          gamerId: n(c.question, "GamerId"),
          canUseTeamReroll: n(c.question, "CanUseTeamReroll") === 1,
          canUseProReroll: n(c.question, "CanUseProReroll") === 1
        });
        expect(first.probabilitySuccess).toBeCloseTo(p, 12);
        expect(first.actualSuccess).toBe(false);
        expect(first.delta).toBeCloseTo(-p, 12);
        expect(first.weightedDelta).toBeCloseTo(
          -p * (n(roll, "RollType") === 1 ? 1 : 1.1),
          12
        );
        expect(first.metadata.difficulty).toBe(target);
        expect(first.metadata.requirement).toBe(n(roll, "Requirement"));
        expect(first.metadata.rerollUsed).toBeUndefined();
        expect(first.metadata.preRoll).toBeUndefined();
        expect(first.contextualImpact).toBeUndefined();
        expect(before.verdict.luckierTeam).toBe("unknown");
      }
    },
    90000
  );
});

it("[cli-worker] exports and explains an embedded first die whose later Loner policy is unresolved", () => {
  const run = (format: string) =>
    spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "src/cli/nufflizier.ts",
        "analyze",
        "demo-replays/demo9.bbr",
        "--format",
        format
      ],
      { encoding: "utf8", timeout: 20000, maxBuffer: 4_000_000 }
    );
  const json = run("json");
  expect(json.status, json.stderr).toBe(0);
  const r = LuckReportSchema.parse(JSON.parse(json.stdout)),
    e = r.events.find((e) => e.metadata.sourceId === "source-3154")!;
  expect(e.metadata.numericOriginal).toEqual({
    gamerId: 0,
    canUseTeamReroll: true,
    canUseProReroll: false
  });
  expect(e.playerId).toBe("10");
  expect(e.teamId).toBe("0");
  expect(e.metadata.initialRosterName).toBeUndefined();
  expect(e.probabilitySuccess).toBeCloseTo(2 / 3, 12);
  expect(e.delta).toBeCloseTo(-2 / 3, 12);
  expect(e.weightedDelta).toBeCloseTo(-11 / 15, 12);
  expect(e.metadata.rerollDraws).toBeUndefined();
  expect(r.verdict.luckierTeam).toBe("unknown");
  const text = run("text");
  expect(text.status, text.stderr).toBe(0);
  expect(text.stdout).toContain(
    "Player 10; source source-3154: Only the recorded first attempt is scored here"
  );
  expect(text.stdout).toContain(
    "66.7% success chance and -0.667 dice luck before the category weight"
  );
  expect(text.stdout).toContain("team reroll available and Pro unavailable");
  expect(text.stdout).toContain("do not certify legal eligibility");
}, 30000);
