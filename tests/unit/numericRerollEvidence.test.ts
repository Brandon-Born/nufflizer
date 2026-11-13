import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
type Projection = { [key: string]: (string | Projection)[] };
type Locator = {
  replayStep: number;
  childIndex: number;
  stepIndex: number;
  messageIndex: number;
};
type Receipt = {
  locator: Locator;
  tag: string;
  payload: Projection;
  step: Projection;
};
type Case = {
  kind: "team" | "skill";
  initial: Receipt;
  initialRoll: Projection;
  choice: Receipt;
  replacement: Receipt;
};
const evidence = JSON.parse(
  readFileSync("tests/fixtures/evidence/bb3-numeric-reroll-scores.json", "utf8")
) as {
  files: {
    file: string;
    sha256: string;
    questionCount: number;
    emittedNumericPrefixes: number;
    cases: Case[];
  }[];
};
const n = (p: Projection, k: string) => Number(p[k]?.[0]);
const key = (l: Partial<Locator> | undefined) =>
  JSON.stringify([l?.replayStep, l?.childIndex, l?.stepIndex, l?.messageIndex]);
function face(p: Projection) {
  const dice = p.Dice![0] as Projection,
    die = dice.Die![0] as Projection;
  expect(dice.Die).toHaveLength(1);
  expect(n(die, "DieType")).toBe(0);
  return n(die, "Value");
}
describe("independent public numeric-reroll draw evidence", () => {
  it("reproduces every raw prefix without importing application maps or selecting later fallout", () => {
    const result = spawnSync(
      "python3",
      ["scripts/extract-numeric-reroll-score-evidence.py", "--check"],
      { encoding: "utf8" }
    );
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(evidence.files).toHaveLength(12);
    expect(evidence.files.reduce((n, f) => n + f.questionCount, 0)).toBe(124);
    expect(
      evidence.files.reduce((n, f) => n + f.emittedNumericPrefixes, 0)
    ).toBe(0);
    const cases = evidence.files.flatMap((f) => f.cases);
    expect(cases.filter((c) => c.kind === "team")).toHaveLength(57);
    expect(cases.filter((c) => c.kind === "skill")).toHaveLength(53);
  });
  it.each(evidence.files)(
    "joins every actual first/replacement die and choice in $file",
    (f) => {
      const bytes = readFileSync(`demo-replays/${f.file}`);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(f.sha256);
      const r = LuckReportSchema.parse(
          analyzeReplayLuck(
            parseReplayXml(decodeReplayInput(bytes.toString("utf8")).xml, {
              omitRawReplaySteps: true
            })
          )
        ),
        byLocator = new Map(r.events.map((e) => [key(e.metadata.locator), e]));
      const actual = r.events.filter((e) => e.metadata.rerollDraws);
      expect(actual).toHaveLength(f.cases.length);
      for (const c of f.cases) {
        const e = byLocator.get(key(c.replacement.locator))!,
          first = byLocator.get(key(c.initial.locator))!,
          choice = byLocator.get(key(c.choice.locator))!;
        expect(e).toBeDefined();
        expect(first).toBeDefined();
        expect(choice).toBeDefined();
        const initialFace = face(c.initialRoll),
          replacementFace = face(c.replacement.payload),
          target = n(c.initialRoll, "Difficulty"),
          p = (7 - target) / 6,
          success = Number(replacementFace >= target),
          delta = -p + success - p;
        expect(n(c.initialRoll, "Status")).toBe(1);
        expect(n(c.initialRoll, "NewRoll")).toBe(1);
        expect(n(c.initialRoll, "Outcome")).toBe(0);
        expect(initialFace).toBeLessThan(target);
        expect(n(c.replacement.payload, "Status")).toBe(2);
        expect(n(c.replacement.payload, "NewRoll")).toBe(1);
        expect(n(c.replacement.payload, "Outcome")).toBe(success);
        expect(e.metadata.rerollDraws).toEqual({
          initialSourceId: first.metadata.sourceId,
          initialFace,
          baseSuccessChance: p,
          initialDelta: -p,
          replacementDelta: success - p
        });
        expect(e.metadata.rerollResource).toBe(c.kind);
        expect(e.metadata.rerollDecisionId).toBe(choice.metadata.sourceId);
        expect(e.metadata.originalDice).toEqual({
          Die: { DieType: 0, Value: initialFace }
        });
        expect(e.metadata.dice).toEqual([replacementFace]);
        expect(e.metadata.difficulty).toBe(target);
        expect(e.metadata.rollType).toBe(n(c.initialRoll, "RollType"));
        expect(e.playerId).toBe(String(n(c.initial.step, "PlayerId")));
        expect(e.delta).toBeCloseTo(delta, 12);
        const weight = n(c.initialRoll, "RollType") === 1 ? 1 : 1.1;
        expect(e.explainability.weight).toBe(weight);
        expect(e.weightedDelta).toBeCloseTo(delta * weight, 12);
        expect(e.probabilitySuccess).toBeCloseTo(
          (36 - (target - 1) ** 2) / 36,
          12
        );
        expect(e.actualSuccess).toBe(success === 1);
        expect(n(c.choice.payload, "Used")).toBe(1);
        expect(e.metadata.teamRerollsSpent).toBe(c.kind === "team" ? 1 : 0);
        if (c.kind === "team") {
          expect(c.initial.tag).toBe("QuestionTeamRerollUsage");
          expect(n(c.initial.payload, "CanUseTeamReroll")).toBe(1);
          expect(first.metadata.rerollOffer).toMatchObject({
            gamerId: n(c.initial.payload, "GamerId"),
            canUseTeamReroll: true,
            decisionSourceId: choice.metadata.sourceId
          });
          expect(choice.metadata.teamRerollDecision).toEqual({
            gamerId: n(c.choice.payload, "GamerId"),
            used: true
          });
        } else {
          expect(c.initial.tag).toBe("ResultRoll");
          expect(first.metadata.mergedRerollAnchorId).toBe(e.metadata.sourceId);
          expect(choice.metadata.skillUsage).toEqual({
            skillId: n(c.choice.payload, "Skill"),
            used: true
          });
        }
        expect(first.scoringStatus).toBe("excluded");
        expect(choice.scoringStatus).toBe("excluded");
        expect(first.weightedDelta).toBe(0);
        expect(choice.weightedDelta).toBe(0);
      }
      expect(r.verdict.luckierTeam).toBe("unknown");
    }
  );
});
