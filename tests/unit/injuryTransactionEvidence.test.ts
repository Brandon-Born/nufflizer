import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { preservesTraitContinuity } from "@/domain/replay/traitTransitions";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { rollEvent } from "../helpers/replay";

type Locator = {
  replayStep: number;
  childIndex: number;
  stepIndex: number;
  messageIndex: number;
};
type RawPlayer = {
  playerId: string;
  rosterIndex: number;
  effectsEmpty: boolean | null;
  teamEffectsEmpty: boolean | null;
  transformationsEmpty: boolean | null;
  raw: { Status?: string[]; CanAct?: string[]; TackleZone?: string[] };
};
type Seed = {
  playerId: string;
  rosterIndex: number;
  prayersEmpty: boolean | null;
  dataPlayerId: string;
  playerType: string;
  innate: number[];
  acquired: number[];
};
const facts = JSON.parse(
  readFileSync("tests/fixtures/evidence/bb3-injury-transactions.json", "utf8")
) as {
  sourceHashes: Record<string, string>;
  pushes: {
    sourceFile: string;
    question: { locator: Locator };
    push: {
      locator: Locator;
      payload: {
        PushedPlayerId: string[];
        CellFrom: { X: string[]; Y: string[] }[];
        CellTo: { X: string[]; Y: string[] }[];
      };
    };
    applied: { locator: Locator; payload: { Follow: string[] } };
  }[];
  skillUses: {
    sourceFile: string;
    locator: Locator;
    skill: number;
    fields: string[];
    payload: Record<string, string[]>;
  }[];
  damageSpp: {
    sourceFile: string;
    locator: Locator;
    payload: { PlayerId: string[]; SppGained: string[] };
  }[];
  injuries: {
    sourceFile: string;
    locator: Locator;
    subjectId: string;
    seeds: Seed[];
    current: {
      locator: { replayStep: number; childIndex: number };
      phase: string;
      effectsEmpty: boolean;
      players: RawPlayer[];
    };
    reference: {
      stunty: boolean;
      thickSkull: boolean;
      counts: number[];
      dice: number[];
      outcome: string;
      delta: string;
      weighted: string;
    };
  }[];
};
const blockFacts = JSON.parse(
  readFileSync("tests/fixtures/evidence/bb3-block-scoring.json", "utf8")
) as {
  files: {
    file: string;
    questions: {
      locator: Locator;
      actor: {
        playerId: number;
        rosterIndex: number;
        seed: {
          locator: {
            kind: string;
            replayStep: number | null;
            childIndex: number | null;
          };
          data: {
            playerId: number;
            playerType: number;
            innate: number[];
            acquired: number[];
          };
        };
      };
      defender: {
        playerId: number;
        rosterIndex: number;
        seed: {
          locator: {
            kind: string;
            replayStep: number | null;
            childIndex: number | null;
          };
          data: {
            playerId: number;
            playerType: number;
            innate: number[];
            acquired: number[];
          };
        };
      };
      reference: {
        scope: string;
        mean: string;
        delta: string;
        weighted: string;
      };
    }[];
  }[];
};
const location = (l: Partial<Locator>) =>
  [l.replayStep, l.childIndex, l.stepIndex, l.messageIndex].join(":");
const rational = (s: string) => {
  const [a, b = "1"] = s.split("/");
  return Number(a) / Number(b);
};
const parsed = new Map<string, ReturnType<typeof parseReplayXml>>();
const reports = new Map<string, ReturnType<typeof analyzeReplayLuck>>();
const pushFacts = JSON.parse(
  readFileSync("tests/fixtures/evidence/bb3-push-decisions.json", "utf8")
) as {
  files: {
    file: string;
    cases: {
      locator: Locator;
      reference: { kind: string; destinations: number[][] };
    }[];
  }[];
};
function source(file: string) {
  if (!reports.has(file)) {
    const bytes = readFileSync(`demo-replays/${file}`);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      facts.sourceHashes[file]
    );
    const p = parseReplayXml(decodeReplayInput(bytes.toString("utf8")).xml, {
      omitRawReplaySteps: true
    });
    parsed.set(file, p);
    reports.set(file, LuckReportSchema.parse(analyzeReplayLuck(p)));
  }
  return reports.get(file)!;
}
describe("independent injury transaction witnesses", () => {
  it.each(facts.pushes)(
    "joins all ordinary push branches and the recorded choice at $question.locator.replayStep",
    (c) => {
      const r = source(c.sourceFile);
      const q = r.events.find(
        (e) => location(e.metadata.locator!) === location(c.question.locator)
      )!;
      const pool = r.events.find(
        (e) => e.metadata.blockPush?.questionSourceId === q.metadata.sourceId
      )!;
      const m = pool.metadata.blockPush!;
      expect(m.status).toBe("modeled");
      if (m.status !== "modeled") throw new Error("Missing current push model");
      const ref = pushFacts.files
        .find((f) => f.file === c.sourceFile)!
        .cases.find(
          (x) => location(x.locator) === location(c.question.locator)
        )!.reference;
      const pairs = (a: { x: number; y: number }[]) =>
        a.map((c) => [c.x, c.y]).sort();
      expect(ref.kind).toBe("empty");
      expect(pairs(m.destinations)).toEqual(ref.destinations.slice().sort());
      const cell = (v: { X: string[]; Y: string[] }) => ({
        x: Number(v.X[0]),
        y: Number(v.Y[0])
      });
      const pushed = c.push.payload.PushedPlayerId[0],
        from = cell(c.push.payload.CellFrom[0]!),
        to = cell(c.push.payload.CellTo[0]!);
      expect(m.branches).toHaveLength(4);
      expect(m.branches[m.selectedBranch]).toMatchObject({
        follow: c.applied.payload.Follow[0] === "1",
        moves: [{ playerId: pushed, from, to, destination: "pitch" }]
      });
      for (const branch of m.branches) {
        expect(branch.moves).toHaveLength(1);
        expect(branch.moves[0]?.playerId).toBe(pushed);
        expect(pairs(m.destinations)).toContainEqual([
          branch.moves[0]!.to.x,
          branch.moves[0]!.to.y
        ]);
        for (const position of branch.positions) {
          const before = m.players.find((p) => p.id === position.playerId)!;
          const expected =
            position.playerId === pushed
              ? branch.moves[0]!.to
              : position.playerId === pool.metadata.block!.attackerId &&
                  branch.follow
                ? from
                : before.cell;
          expect(position.cell).toEqual(expected);
        }
      }
      const result = r.events.find(
          (e) => location(e.metadata.locator!) === location(c.push.locator)
        )!,
        applied = r.events.find(
          (e) => location(e.metadata.locator!) === location(c.applied.locator)
        )!;
      expect(result.metadata.pushResult).toMatchObject({
        playerId: pushed,
        from,
        to
      });
      expect(applied.metadata.pushAppliedFollow).toBe(true);
      expect(result.scoringStatus).toBe("excluded");
      expect(applied.scoringStatus).toBe("excluded");
      expect(result.metadata.isRollCandidate).toBe(false);
      expect(applied.metadata.isRollCandidate).toBe(false);
      expect(pool.contextualImpact).toBeUndefined();
    }
  );
  it("reproduces raw uses, damage prefixes and exact Fraction references", () => {
    const run = spawnSync(
      "python3",
      ["scripts/extract-injury-transaction-evidence.py", "--check"],
      { encoding: "utf8" }
    );
    expect(run.status, run.stderr).toBe(0);
    expect(facts.skillUses).toHaveLength(80);
    expect(facts.damageSpp).toHaveLength(6);
    expect(facts.injuries).toHaveLength(11);
  });
  it("recognizes all80 actual uses without accepting additional payload fields", () => {
    for (const r of facts.skillUses) {
      expect([...r.fields].sort()).toEqual(["PlayerId", "Skill", "Used"]);
      const payload = Object.fromEntries(
        Object.entries(r.payload).map(([k, v]) => [k, Number(v[0])])
      );
      expect(
        preservesTraitContinuity(
          rollEvent({ sourceTag: "ResultSkillUsage", payload })
        )
      ).toBe(true);
      expect(
        preservesTraitContinuity(
          rollEvent({
            sourceTag: "ResultSkillUsage",
            payload: { ...payload, LearnedSkills: [] }
          })
        )
      ).toBe(false);
    }
  });
  it.each(facts.injuries)(
    "joins $sourceFile/$locator.replayStep to its raw current checkpoint and exact table",
    (c) => {
      const r = source(c.sourceFile),
        e = r.events.find(
          (e) => location(e.metadata.locator!) === location(c.locator)
        )!;
      const table = e.metadata.injuryTable!,
        proof = table.traitEvidence;
      const seed = c.seeds.find((s) => s.playerId === c.subjectId)!;
      expect(seed.prayersEmpty).toBe(true);
      expect(proof).toMatchObject({
        playerId: c.subjectId,
        rosterIndex: seed.rosterIndex,
        observedCheckpointAfter: 0,
        prayersCheckpointAfter: 0,
        traits: {
          dataPlayerId: Number(seed.dataPlayerId),
          playerTypeId: Number(seed.playerType),
          innateSkills: seed.innate,
          acquiredSkills: seed.acquired
        }
      });
      const cp = parsed
        .get(c.sourceFile)!
        .boardCheckpoints!.find(
          (cp) => cp.afterSourceIndex === proof.currentCheckpointAfter
        )!;
      expect({ replayStep: cp.replayStep, childIndex: cp.childIndex }).toEqual(
        c.current.locator
      );
      expect(c.current.effectsEmpty).toBe(true);
      expect(c.current.phase).toBe("5");
      const physical = c.current.players.find(
        (p) => p.playerId === c.subjectId
      )!;
      expect(
        physical.effectsEmpty &&
          physical.teamEffectsEmpty &&
          physical.transformationsEmpty
      ).toBe(true);
      expect(proof.statusCode).toBe(
        physical.raw.Status ? Number(physical.raw.Status[0]) : null
      );
      expect(proof.tackleZone).toBe(
        physical.raw.TackleZone ? physical.raw.TackleZone[0] === "1" : null
      );
      expect(proof.currentCheckpointAfter).toBeLessThan(
        e.metadata.injuryObservation!.damageStepSourceIndex
      );
      expect(table).toMatchObject({
        stunty: c.reference.stunty,
        thickSkull: c.reference.thickSkull,
        counts: c.reference.counts
      });
      expect(e.metadata.dice).toEqual(c.reference.dice);
      expect(e.metadata.injuryObservation?.outcome).toBe(c.reference.outcome);
      if (c.sourceFile === "demo9.bbr" && c.locator.replayStep === 33) {
        // A table alone cannot certify the opposing blocker's modifier policy.
        expect(e.scoringStatus).toBe("excluded");
        expect(e.metadata.injuryScoring).toBeUndefined();
      } else {
        expect(e.scoringStatus).toBe("scored");
        expect(e.delta).toBe(rational(c.reference.delta));
        expect(e.weightedDelta).toBe(rational(c.reference.weighted));
      }
      expect(e.probabilitySuccess).toBeNull();
      expect(e.actualSuccess).toBeNull();
      expect(e.contextualImpact).toBeUndefined();
    }
  );
  it.each(facts.damageSpp)(
    "retains the distinct SPP recipient for $sourceFile/$locator.replayStep",
    (c) => {
      const r = source(c.sourceFile),
        e = r.events.find(
          (e) => location(e.metadata.locator!) === location(c.locator)
        )!;
      expect(e).toMatchObject({
        playerId: c.payload.PlayerId[0],
        type: "unknown",
        scoringStatus: "excluded",
        delta: 0,
        weightedDelta: 0,
        probabilitySuccess: null,
        actualSuccess: null
      });
      expect(e.metadata).toMatchObject({
        sourceTag: "ResultGainSpp",
        isRollCandidate: false,
        recordedSpp: { points: 2 },
        ownership: { role: "actor", playerId: c.payload.PlayerId[0] }
      });
      const injury = r.events.find(
        (r) =>
          r.metadata.sourceId === e.metadata.recordedSpp!.damage!.injurySourceId
      )!;
      expect(injury.playerId).not.toBe(e.playerId);
      expect(injury.teamId).not.toBe(e.teamId);
      expect(injury.metadata.sourceIndex).toBe(e.metadata.sourceIndex! + 1);
      expect(e.metadata.dice).toEqual([]);
    }
  );
  const pools = [
    ["demo6.bbr", "source-240"],
    ...["258", "313", "389", "498", "501", "547", "577", "594", "625"].map(
      (id) => ["demo9.bbr", `source-${id}`]
    )
  ];
  it.each(pools)(
    "joins the newly qualified block %s/%s to its existing independent rational reference",
    (file, id) => {
      const r = source(file!),
        e = r.events.find((e) => e.metadata.sourceId === id)!,
        block = e.metadata.block!;
      const ref = blockFacts.files
        .find((f) => f.file === file)!
        .questions.find(
          (q) => location(q.locator) === location(e.metadata.locator!)
        )!;
      expect(ref.reference.scope).toBe("last_complete_lists_hypothesis");
      expect(e.weightedDelta).toBeCloseTo(rational(ref.reference.weighted), 12);
      expect(e.delta).toBeCloseTo(rational(ref.reference.delta), 12);
      expect(block.skillModel?.expectedValue).toBeCloseTo(
        rational(ref.reference.mean),
        12
      );
      for (const [role, raw] of [
        ["attacker", ref.actor],
        ["defender", ref.defender]
      ] as const) {
        const t = block.traitEvidence![role];
        const cp = parsed
          .get(file!)!
          .boardCheckpoints!.find(
            (cp) => cp.afterSourceIndex === t.observedCheckpointAfter
          )!;
        expect({
          kind: cp.kind,
          replayStep: cp.replayStep,
          childIndex: cp.childIndex
        }).toEqual(raw.seed.locator);
        expect(t).toMatchObject({
          playerId: String(raw.playerId),
          rosterIndex: raw.rosterIndex,
          traits: {
            dataPlayerId: raw.seed.data.playerId,
            playerTypeId: raw.seed.data.playerType,
            innateSkills: raw.seed.data.innate,
            acquiredSkills: raw.seed.data.acquired
          }
        });
      }
      expect(e.actualSuccess).toBeNull();
      expect(e.probabilitySuccess).toBeNull();
    }
  );
});
