import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import {
  enumerateUnmodifiedInjury,
  INJURY_OUTCOMES,
  unmodifiedInjuryOutcome
} from "@/domain/nufflizer/injuryTable";
import { explainInjuryTable } from "@/domain/nufflizer/presentation";
import { injuryTableXml } from "../helpers/injuryTable";

const evidence = JSON.parse(
  readFileSync("tests/fixtures/evidence/bb3-injury-tables.json", "utf8")
) as {
  tables: {
    stunty: boolean;
    thickSkull: boolean;
    counts: number[];
    totalOutcomes: number[];
  }[];
  cases: {
    sourceFile: string;
    sha256: string;
    subjectId: string;
    modelSupported: boolean;
    locator: {
      replayStep: number;
      childIndex: number;
      stepIndex: number;
      messageIndex: number;
    };
    seed: { innateSkills: number[]; acquiredSkills: number[] };
    observedSeedLocator: {
      replayStep: number | null;
      childIndex: number | null;
    };
  }[];
};
function report(input = injuryTableXml()) {
  return analyzeNufflizerInput(input);
}
function modeled(r = report()) {
  return r.events.find((e) => e.metadata.injuryTable)!;
}
const corpus = new Map<string, ReturnType<typeof report>>();
function source(file: string) {
  if (!corpus.has(file))
    corpus.set(file, report(readFileSync(`demo-replays/${file}`, "utf8")));
  return corpus.get(file)!;
}
describe("conditional injury tables before treatment and recovery", () => {
  it("reproduces independent numeric source witnesses and triangular rule arithmetic", () => {
    const child = spawnSync(
      "python3",
      ["scripts/extract-injury-table-evidence.py", "--check"],
      { encoding: "utf8" }
    );
    expect(child.status, child.stderr).toBe(0);
  });
  it.each(evidence.tables)(
    "enumerates ordinary/Stunty=$stunty Thick Skull=$thickSkull independently",
    (t) => {
      const actual = enumerateUnmodifiedInjury(t.stunty, t.thickSkull);
      expect(actual.counts).toEqual(t.counts);
      expect(actual.probabilities.reduce((a, b) => a + b, 0)).toBeCloseTo(
        1,
        14
      );
      for (let total = 2; total <= 12; total++)
        expect(unmodifiedInjuryOutcome(total, t.stunty, t.thickSkull)).toBe(
          INJURY_OUTCOMES[t.totalOutcomes[total - 2]!]
        );
      // Exercise the complete parser/ownership/trait/schema path for every face,
      // with an explicitly synthetic current roster and source namespace.
      for (let a = 1; a <= 6; a++)
        for (let b = 1; b <= 6; b++) {
          const outcome = t.totalOutcomes[a + b - 2]!;
          const r = report(
            injuryTableXml({
              skills: [
                ...(t.stunty ? [59] : []),
                ...(t.thickSkull ? [63] : [])
              ],
              dice: [a, b],
              outcome: [0, 2, 3, 4][outcome]
            })
          );
          expect(modeled(r).metadata.injuryTable!.counts).toEqual(t.counts);
          expect(modeled(r).scoringStatus).toBe("excluded");
          expect(modeled(r).probabilitySuccess).toBeNull();
          expect(modeled(r).actualSuccess).toBeNull();
          expect(r.teams.every((team) => team.impactCount === 0)).toBe(true);
          expect(r.verdict.luckierTeam).toBe("unknown");
        }
    }
  );
  it.each(evidence.cases)(
    "joins full source $sourceFile $locator.replayStep without inventing missing traits",
    (c) => {
      expect(
        createHash("sha256")
          .update(readFileSync(`demo-replays/${c.sourceFile}`))
          .digest("hex")
      ).toBe(c.sha256);
      const r = source(c.sourceFile),
        e = r.events.find(
          (e) =>
            JSON.stringify(e.metadata.locator) === JSON.stringify(c.locator)
        )!;
      expect(e, JSON.stringify(c.locator)).toBeDefined();
      expect(e.playerId).toBe(c.subjectId);
      expect(Boolean(e.metadata.injuryTable)).toBe(c.modelSupported);
      if (c.modelSupported) {
        const table = e.metadata.injuryTable!;
        expect(table.traitEvidence.traits.innateSkills).toEqual(
          c.seed.innateSkills
        );
        expect(table.traitEvidence.traits.acquiredSkills).toEqual(
          c.seed.acquiredSkills
        );
        const replay = parseReplayXml(
          decodeReplayInput(
            readFileSync(`demo-replays/${c.sourceFile}`, "utf8")
          ).xml,
          { omitRawReplaySteps: true }
        );
        const cp = replay.boardCheckpoints!.find(
          (cp) =>
            cp.afterSourceIndex === table.traitEvidence.observedCheckpointAfter
        )!;
        expect({
          replayStep: cp.replayStep,
          childIndex: cp.childIndex
        }).toEqual(c.observedSeedLocator);
        expect(table.traitEvidence.currentCheckpointAfter).toBeLessThan(
          e.metadata.injuryObservation!.damageStepSourceIndex
        );
        expect(table.counts).toEqual(
          evidence.tables.find(
            (t) =>
              t.stunty === table.stunty && t.thickSkull === table.thickSkull
          )!.counts
        );
        expect(explainInjuryTable(e)).toContain("before treatment or recovery");
        const qualified = new Set(["demo10.bbr:23", "demo10.bbr:26", "demo10.bbr:32", "demo10.bbr:76", "demo10.bbr:90", "demo5.bbr:29", "demo5.bbr:70", "demo8.bbr:45"]);
        expect(Boolean(e.metadata.injuryScoring)).toBe(qualified.has(`${c.sourceFile}:${c.locator.replayStep}`));
        if(e.metadata.injuryScoring) {
          expect(explainInjuryTable(e)).toContain("categorical dice contribution");
          expect(e.scoringStatus).toBe("scored");
        } else {
          expect(explainInjuryTable(e)).toContain("no luck score is added");
          expect(e.delta).toBe(0);expect(e.weightedDelta).toBe(0);
        }
      }
    }
  );
  it.each([
    "missing-list",
    "unknown-skill",
    "nonempty-effects",
    "prayer",
    "transformation",
    "unknown-transition",
    "wrong-outcome",
    "modified",
    "omitted-modifiers",
    "version",
    "owner",
    "post-damage-checkpoint"
  ])("withholds unsupported %s", (kind) => {
    let input = injuryTableXml();
    if (kind === "missing-list") input = input.replace("<AcquiredSkills/>", "");
    if (kind === "unknown-skill") input = injuryTableXml({ skills: [999] });
    if (kind === "nonempty-effects")
      input = input.replace(
        "<Effects/>",
        "<Effects><Effect><Id>999</Id></Effect></Effects>"
      );
    if (kind === "prayer")
      input = input.replace(
        "<ActivePrayers/>",
        "<ActivePrayers><Prayer>1</Prayer></ActivePrayers>"
      );
    if (kind === "transformation")
      input = input.replace(
        "<TransformedPlayers/>",
        "<TransformedPlayers><Player>42</Player></TransformedPlayers>"
      );
    if (kind === "unknown-transition")
      input = injuryTableXml({
        prefix: "<UnknownRule><PlayerId>42</PlayerId></UnknownRule>"
      });
    if (kind === "wrong-outcome") input = injuryTableXml({ outcome: 0 });
    const replay = parseReplayXml(input);
    const roll = replay.turns
      .flatMap((t) => t.events)
      .find((e) => e.sourceTag === "ResultInjuryRoll")!;
    if (kind === "modified")
      roll.payload!.Modifiers = {
        Modifier: {
          PlayerId: 42,
          Skill: 13,
          Effect: 0,
          Value: 1,
          ModifierType: 0
        }
      };
    if (kind === "omitted-modifiers") delete roll.payload!.Modifiers;
    if (kind === "version") replay.replayVersion = "2-0-0-0";
    if (kind === "owner") roll.actorTeamId = "1";
    if (kind === "post-damage-checkpoint")
      replay.boardCheckpoints![0]!.afterSourceIndex = 1;
    const before = JSON.stringify(replay);
    expect(modeled(analyzeReplayLuck(replay))).toBeUndefined();
    expect(JSON.stringify(replay)).toBe(before);
  });
  it.each([
    "counts",
    "probabilities",
    "stunty",
    "thickSkull",
    "source-order",
    "subject",
    "team",
    "skills",
    "missing-observation",
    "modifier"
  ])("rejects public %s forgery", (kind) => {
    const r = report(),
      e = modeled(r),
      table = e.metadata.injuryTable!;
    if (kind === "counts") table.counts[0]!--;
    if (kind === "probabilities") table.probabilities[0] = 0;
    if (kind === "stunty") table.stunty = true;
    if (kind === "thickSkull") table.thickSkull = true;
    if (kind === "source-order")
      table.traitEvidence.currentCheckpointAfter = e.metadata.sourceIndex!;
    if (kind === "subject") table.traitEvidence.playerId = "7";
    if (kind === "team") table.traitEvidence.teamId = "1";
    if (kind === "skills") table.traitEvidence.traits.innateSkills = null;
    if (kind === "missing-observation") delete e.metadata.injuryObservation;
    if (kind === "modifier") e.metadata.modifiers = [1];
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
  it("swaps the reported owner without changing dice meaning", () => {
    const input = injuryTableXml();
    const swapped = input
      .replaceAll("<TeamId>0</TeamId>", "<TeamId>swap</TeamId>")
      .replaceAll("<TeamId>1</TeamId>", "<TeamId>0</TeamId>")
      .replaceAll("<TeamId>swap</TeamId>", "<TeamId>1</TeamId>");
    const a = modeled(report(input)),
      b = modeled(report(swapped));
    expect(a.teamId).toBe("0");
    expect(b.teamId).toBe("1");
    expect(a.metadata.injuryTable!.counts).toEqual(
      b.metadata.injuryTable!.counts
    );
    expect(a.metadata.injuryTable!.probabilities).toEqual(
      b.metadata.injuryTable!.probabilities
    );
    expect(a.metadata.injuryObservation!.outcome).toBe(
      b.metadata.injuryObservation!.outcome
    );
    expect(b.metadata.injuryTable!.traitEvidence.teamId).toBe("1");
    expect(a.weightedDelta).toBe(0);
    expect(b.weightedDelta).toBe(0);
  });
  it("[cli-worker] prints source-backed categorical injury luck without inventing binary success", () => {
    const child = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "src/cli/nufflizier.ts",
        "analyze",
        "demo-replays/demo8.bbr",
        "--format",
        "text"
      ],
      { encoding: "utf8", timeout: 20000 }
    );
    expect(child.status, child.stderr).toBe(0);
    expect(child.stdout).toContain(
      "source source-249: The recorded injury result for player 9 is Stunned."
    );
    expect(child.stdout).toContain(
      "Stunned 15/36 (41.7%), KO 11/36 (30.6%), Badly Hurt 4/36 (11.1%), Casualty 6/36 (16.7%)"
    );
    expect(child.stdout).toContain("Positive favors the injured player's team");
    expect(child.stdout).toContain("Treatment, recovery and match impact remain separate");
  });
});
