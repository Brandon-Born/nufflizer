import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import {
  createOwnershipTimeline,
  applyCurrentOwnership
} from "@/domain/replay/ownershipTimeline";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import type { LuckEvent, LuckReport } from "@/domain/nufflizer/types";
import { ownershipReplayXml } from "../helpers/ownershipReplay";
import { contextReplayXml } from "../helpers/contextReplay";

type Locator = {
  replayStep?: number | null;
  childIndex?: number | null;
  stepIndex?: number;
  messageIndex?: number;
};
const numericGateWitness=JSON.parse(readFileSync("tests/fixtures/evidence/bb3-numeric-gates.json","utf8")) as {files:{file:string;sha256:string;cases:{prefix:{tag:string;locator:Locator;payload?:unknown}[]}[]}[]};
function rawAccessMath(file:string,e:LuckEvent) {
  const f=numericGateWitness.files.find(x=>x.file===file)!;
  const c=f.cases.find(c=>c.prefix.some(x=>x.tag==="ResultRoll"&&key(x.locator,x.tag)===key(e.metadata.locator,e.metadata.sourceTag)));
  expect(c,`gate ${e.metadata.sourceId} needs an independent raw prefix`).toBeDefined();
  const gate=c!.prefix.find(x=>key(x.locator,x.tag)===key(e.metadata.locator,e.metadata.sourceTag))!;
  const q=c!.prefix.find(x=>x.tag==="QuestionTeamRerollUsage")!,skill=c!.prefix.find(x=>x.tag==="ResultSkillUsage")!;
  const o=(x:unknown)=>x as Record<string,unknown[]>;
  const n=(x:unknown,k:string)=>Number(o(x)[k]![0]);
  const initial=o(q.payload).RollInfos![0],die=o(o(gate.payload).Dice![0]).Die![0];
  expect(e.playerId).toBe(String(n(skill.payload,"PlayerId")));expect(e.teamId).toBe(String(n(q.payload,"GamerId")));
  expect(n(skill.payload,"Used")).toBe(1);expect(n(gate.payload,"Status")).toBe(1);expect(n(gate.payload,"NewRoll")).toBe(1);
  expect(e.metadata.rollType).toBe(n(gate.payload,"RollType"));
  const base=(7-n(initial,"Difficulty"))/6,g=(7-n(gate.payload,"Difficulty"))/6,success=n(die,"Value")>=n(gate.payload,"Difficulty");
  expect(n(gate.payload,"Outcome")).toBe(Number(success));
  return {sha256:f.sha256,probability:g,success,delta:base*(Number(success)-g)};
}
type RawCase = {
  locator: Locator;
  sourceTag: string;
  playerId: string;
  role: "actor" | "subject";
  defenderId?: string;
  before: {
    locator: Locator;
    teamIds: (number | null)[];
    participants: {
      playerId: string;
      teamId: string | null;
      members: unknown[];
    }[];
  };
  roll: Record<string, unknown>;
  reference: {
    numerator: number;
    denominator: number;
    actualSuccess: boolean;
    policy: string;
  } | null;
};
const witness = JSON.parse(
  readFileSync("tests/fixtures/evidence/bb3-current-ownership.json", "utf8")
) as {
  files: {
    sourceFile: string;
    sha256: string;
    initialPlayerIds: string[];
    rosters: {
      locator: Locator;
      teamIds: (number | null)[];
      players: [number, string, number | null, number | null, number | null][];
    }[];
    mutations: {
      locator: Locator;
      operation: string;
      playerId: string;
      buyerIdKind: string;
    }[];
    cases: RawCase[];
  }[];
};
const catchResumeWitness=JSON.parse(readFileSync("tests/fixtures/evidence/bb3-catch-resume.json","utf8")) as {
 files:{file:string;sha256:string;cases:{initialRoll:Record<string,string[]>;continuation:{tag:string;locator:Locator;payload:Record<string,unknown>}[]}[]}[]
};
function resumedCatchMath(file:string,e:LuckEvent){
 const f=catchResumeWitness.files.find(f=>f.file===file)!,c=f.cases.find(c=>c.continuation.some(x=>x.tag==="ResultRoll"&&key(x.locator,"ResultRoll")===key(e.metadata.locator,e.metadata.sourceTag)))!;
 expect(c,`resumed Catch ${e.metadata.sourceId} needs its independent raw continuation`).toBeDefined();
 const target=Number(c.initialRoll.Difficulty[0]),p=(7-target)/6;
 const result=c.continuation.find(x=>x.tag==="ResultRoll")!.payload;
 const dice=(result.Dice as {Die:{Value:string[]}[]}[])[0].Die[0];
 const success=Number(Number(dice.Value[0])>=target);
 return {probability:1-(1-p)**2,delta:success-2*p,success:!!success};
}
const questionWitness = JSON.parse(readFileSync("tests/fixtures/evidence/bb3-numeric-question-originals.json","utf8")) as {
  files:{file:string;sha256:string;cases:{locator:Locator;step:Record<string,string[]>;question:Record<string,string[]>;initialRoll:Record<string,string[]>}[]}[]
};
const priorCohort = JSON.parse(
  readFileSync(
    "tests/fixtures/evidence/bb3-ownership-prior-cohort.json",
    "utf8"
  )
) as { files: { file: string; sourceIds: string[] }[] };
const key = (l: Locator | undefined, tag: string) =>
  JSON.stringify([
    l?.replayStep,
    l?.childIndex,
    l?.stepIndex ?? null,
    l?.messageIndex ?? null,
    tag
  ]);
function report(options: Parameters<typeof ownershipReplayXml>[0] = {}) {
  return analyzeNufflizerInput(ownershipReplayXml(options));
}
const candidate = (r: LuckReport) =>
  r.events.find((e) => e.metadata.isRollCandidate)!;
const categoricalWitnesses=JSON.parse(readFileSync("tests/fixtures/evidence/bb3-categorical-injuries.json","utf8")) as {cases:{file:string;locator:unknown;sha256:string}[];math:{stunty:boolean;thickSkull:boolean;rows:{total:number;weighted:string}[]}[]};
const sourceCache = new Map<
  string,
  { report: LuckReport; replay: ReturnType<typeof parseReplayXml> }
>();
function source(file: string) {
  if (!sourceCache.has(file)) {
    const replay = parseReplayXml(
      decodeReplayInput(readFileSync(`demo-replays/${file}`, "utf8")).xml
    );
    sourceCache.set(file, {
      replay,
      report: LuckReportSchema.parse(analyzeReplayLuck(replay))
    });
  }
  return sourceCache.get(file)!;
}

describe("source-qualified time-local player ownership", () => {
  it("reproduces independent XML roster, identifier namespace and dice references", () => {
    const p = spawnSync(
      "python3",
      ["scripts/extract-current-ownership.py", "--check"],
      { encoding: "utf8" }
    );
    expect(p.status, p.stderr).toBe(0);
  });
  it.each(witness.files)(
    "reconciles all newly owned outcomes against $sourceFile's raw parent and math",
    (f) => {
      expect(
        createHash("sha256")
          .update(readFileSync(`demo-replays/${f.sourceFile}`))
          .digest("hex")
      ).toBe(f.sha256);
      const { report: r, replay } = source(f.sourceFile),
        rawCases = new Map(
          f.cases.map((c) => [key(c.locator, c.sourceTag), c])
        );
      // Check each public proof against its actual raw snapshot, including
      // initial players renewed after an unknown transition. No future snapshot
      // or most-recent omission substitutes for that positive observation.
      for (const e of r.events.filter((e) => e.scoringStatus === "scored")) {
        const p = e.metadata.ownership!;
        for (const proof of [p, ...(p.defender ? [p.defender] : [])]) {
          if (proof.basis === "explicit_team") continue;
          const cp =
            proof.checkpointAfter === undefined
              ? undefined
              : replay.boardCheckpoints!.find(
                  (cp) => cp.afterSourceIndex === proof.checkpointAfter
                );
          if (proof.checkpointAfter !== undefined) {
            expect(cp, e.metadata.sourceId).toBeDefined();
            expect(cp!.afterSourceIndex).toBeLessThan(e.metadata.sourceIndex!);
          }
          const raw = f.rosters.find(
            (x) =>
              key(x.locator, "") ===
              key(
                cp
                  ? { replayStep: cp.replayStep, childIndex: cp.childIndex }
                  : { replayStep: null, childIndex: null },
                ""
              )
          )!;
          expect(raw, e.metadata.sourceId).toBeDefined();
          const members = raw.players.filter((x) => x[1] === proof.playerId);
          expect(members).toHaveLength(1);
          const team =
            raw.teamIds[members[0][0]] ??
            Number(
              r.teams.find(
                (t) => Number(t.teamId) !== raw.teamIds[1 - members[0][0]]
              )!.teamId
            );
          expect(proof.teamId).toBe(String(team));
          expect(
            members[0][2] === null || members[0][2] === Number(proof.playerId)
          ).toBe(true);
          expect(members[0][3] === null || members[0][3] === team).toBe(true);
        }
        if(e.metadata.injuryScoring) {
          const c=categoricalWitnesses.cases.find(c=>c.file===f.sourceFile && JSON.stringify(c.locator)===JSON.stringify(e.metadata.locator));
          expect(c, `categorical outcome ${e.metadata.sourceId} needs its independent raw damage prefix`).toBeDefined();
          expect(c!.sha256).toBe(f.sha256);expect(p.role).toBe("subject");
          // Exact source, opponent modifier seed and rational tier odds are
          // independently checked by categoricalInjury.test.ts.
          continue;
        }
        if(e.metadata.catchRerollResume){
          const math=resumedCatchMath(f.sourceFile,e);
          expect(p.role).toBe("actor");expect(p.playerId).toBe("41");expect(p.teamId).toBe("1");
          expect(catchResumeWitness.files.find(x=>x.file===f.sourceFile)!.sha256).toBe(f.sha256);
          expect(e.metadata.probabilityPolicy).toBe("two_attempt");expect(e.actualSuccess).toBe(math.success);
          expect(e.probabilitySuccess).toBeCloseTo(math.probability,12);expect(e.delta).toBeCloseTo(math.delta,12);expect(e.weightedDelta).toBeCloseTo(math.delta*1.1,12);
          continue;
        }
        if(e.metadata.numericRetryAccess) {
          const math=rawAccessMath(f.sourceFile,e);expect(math.sha256).toBe(f.sha256);
          expect(p.role).toBe("actor");expect(e.type).toBe("dodge");expect(e.metadata.probabilityPolicy).toBe("gated_retry_access");
          expect(e.actualSuccess).toBe(math.success);expect(e.probabilitySuccess).toBeCloseTo(math.probability,12);
          expect(e.delta).toBeCloseTo(math.delta,12);expect(e.weightedDelta).toBeCloseTo(math.delta*1.1,12);
          continue;
        }
        if(e.metadata.numericOriginal){
          const f2=questionWitness.files.find(x=>x.file===f.sourceFile)!;
          const c=f2.cases.find(x=>key(x.locator,"QuestionTeamRerollUsage")===key(e.metadata.locator,e.metadata.sourceTag));
          expect(c,`embedded first outcome ${e.metadata.sourceId} needs its raw question prefix`).toBeDefined();
          expect(f2.sha256).toBe(f.sha256);expect(p.role).toBe("actor");
          expect(p.playerId).toBe(c!.step.PlayerId[0]);expect(p.teamId).toBe(c!.question.GamerId[0]);
          const probability=(7-Number(c!.initialRoll.Difficulty[0]))/6;
          expect(e.probabilitySuccess).toBeCloseTo(probability,12);expect(e.actualSuccess).toBe(false);
          expect(e.delta).toBeCloseTo(-probability,12);expect(e.weightedDelta).toBeCloseTo(-probability*1.1,12);
          // The separate question-evidence suite checks every physical die and
          // all 83 prefixes. The common roster-proof checks above still apply.
          continue;
        }
        const c = rawCases.get(key(e.metadata.locator, e.metadata.sourceTag!));
        const oldIds = new Set(
          priorCohort.files.find((x) => x.file === f.sourceFile)!.sourceIds
        );
        if (!oldIds.has(e.metadata.sourceId!))
          expect(
            c,
            `new outcome ${e.metadata.sourceId} needs independent role/dice evidence`
          ).toBeDefined();
        if (!c) continue;
        expect(p.role).toBe(c.role);
        expect(p.playerId).toBe(c.playerId);
        const math = c.reference!;
        expect(math, e.metadata.sourceId).not.toBeNull();
        expect(e.metadata.probabilityPolicy).toBe(math.policy);
        expect(e.actualSuccess).toBe(math.actualSuccess);
        const probability = math.numerator / math.denominator;
        expect(e.probabilitySuccess).toBeCloseTo(probability, 12);
        const weight = {
          block: 0.75,
          armor_break: 1,
          injury: 1.5,
          dodge: 1.1,
          ball_handling: 1.1,
          movement_risk: 1
        }[
          e.type as
            | "block"
            | "armor_break"
            | "dodge"
            | "ball_handling"
            | "movement_risk"
        ];
        expect(weight).toBeDefined();
        expect(e.weightedDelta).toBeCloseTo(
          (math.policy === "two_attempt"
            ? Number(math.actualSuccess) - 2 * (7 - Number((c.roll.Difficulty as string[])[0])) / 6
            : Number(math.actualSuccess) - probability) * weight,
          12
        );
        if (e.metadata.block) {
          const value = (c.roll.GamerId as string[] | undefined)?.[0];
          if (e.metadata.block.chooserGamerId !== undefined)
            expect(String(e.metadata.block.chooserTeamId)).toBe(value);
          expect(e.metadata.block.chooserTeamId).toBe(
            e.metadata.block.pool.attackerChooses
              ? p.teamId
              : p.defender!.teamId
          );
        }
      }
      const oldIds = new Set(
        priorCohort.files.find((x) => x.file === f.sourceFile)!.sourceIds
      );
      for (const team of r.teams) {
        const scored = r.events.filter(
          (e) => e.scoringStatus === "scored" && e.teamId === team.teamId
        );
        const oldSum = scored
          .filter((e) => oldIds.has(e.metadata.sourceId!))
          .reduce((sum, e) => sum + e.weightedDelta, 0);
        const added = scored
          .filter((e) => !oldIds.has(e.metadata.sourceId!))
          .reduce((sum, e) => {
            if(e.metadata.injuryScoring){
              const table=e.metadata.injuryTable!;
              const row=categoricalWitnesses.math.find(t=>t.stunty===table.stunty&&t.thickSkull===table.thickSkull)!.rows.find(t=>t.total===e.metadata.dice!.reduce((a,b)=>a+b,0))!;
              const [a,b="1"]=row.weighted.split("/");return sum+Number(a)/Number(b);
            }
            if(e.metadata.catchRerollResume)return sum+resumedCatchMath(f.sourceFile,e).delta*1.1;
            if(e.metadata.numericRetryAccess)return sum+rawAccessMath(f.sourceFile,e).delta*1.1;
            if(e.metadata.numericOriginal){
              const raw=questionWitness.files.find(x=>x.file===f.sourceFile)!.cases.find(x=>key(x.locator,"QuestionTeamRerollUsage")===key(e.metadata.locator,e.metadata.sourceTag))!;
              return sum-(7-Number(raw.initialRoll.Difficulty[0]))/6*1.1;
            }
            const raw = rawCases.get(key(e.metadata.locator, e.metadata.sourceTag!))!;
            const math = raw.reference!;
            const weight =
              e.type === "block"
                ? 0.75
                : e.type === "injury"
                  ? 1.5
                  : ["dodge", "ball_handling"].includes(e.type)
                    ? 1.1
                    : 1;
            return (
              sum +
              (math.policy === "two_attempt"
                ? Number(math.actualSuccess) - 2 * (7 - Number((raw.roll.Difficulty as string[])[0])) / 6
                : Number(math.actualSuccess) - math.numerator / math.denominator) * weight
            );
          }, 0);
        expect(team.luckScore).toBeCloseTo(oldSum + added, 10);
      }
      for (const m of f.mutations) {
        const found = r.events.find(
          (e) =>
            key(e.metadata.locator, e.metadata.sourceTag!) ===
            key(
              m.locator,
              m.operation === "purchase"
                ? "EventBuyMercenary"
                : "EventRemoveMercenary"
            )
        );
        // Buyer identifiers are not roster owners or controller slots.
        expect(found?.metadata.identityMutation).toMatchObject({
          playerId: m.playerId,
          buyerIdKind: m.buyerIdKind
        });
        if (m.buyerIdKind !== "small_numeric")
          expect(found?.metadata.identityMutation?.gamerId).toBeUndefined();
      }
      expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
      expect(r.verdict.luckierTeam).toBe("unknown");
    },
    30000
  );
  it("never mutates parser attribution or physical checkpoints", () => {
    const r = parseReplayXml(ownershipReplayXml({ initialActor: "missing" })),
      before = JSON.stringify(r);
    const timeline = createOwnershipTimeline(r),
      view = applyCurrentOwnership(r, timeline);
    expect(JSON.stringify(r)).toBe(before);
    expect(view.turns).not.toBe(r.turns);
    expect(
      candidate(LuckReportSchema.parse(analyzeReplayLuck(r))).metadata.ownership
    ).toMatchObject({ basis: "current_roster", teamId: "0" });
    expect(JSON.stringify(r)).toBe(before);
  });
  it.each(["numeric", "block", "armor"] as const)(
    "a fresh unnamed member qualifies the %s role without inventing tactical state",
    (kind) => {
      const r = report({
          initialActor: "missing",
          kind,
          currentData: false,
          unknownCells: true
        }),
        e = candidate(r);
      expect(e.scoringStatus).toBe(kind==="block"?"excluded":"scored");
      expect(e.metadata.ownership).toMatchObject({
        role: kind === "armor" ? "subject" : "actor",
        basis: "current_roster",
        teamId: "0",
        playerId: "42"
      });
      expect(e.metadata.initialRosterName).toBeUndefined();
      expect(e.contextualImpact).toBeUndefined();
      expect(e.metadata.preRoll?.actorTraits).toBeUndefined();
    }
  );
  it("rejects a stale opposing block defender after current membership contradicts it", () => {
    const r = report({ kind: "block", defenderTeam: 0 }),
      e = candidate(r);
    expect(e).toMatchObject({
      teamId: "unresolved",
      scoringStatus: "excluded",
      probabilitySuccess: null,
      weightedDelta: 0,
      metadata: {
        ownershipConflict: {
          role: "defender",
          playerId: "7",
          reason: "current_roster_conflict",
          initialTeamId: "1",
          observedTeamId: "0"
        }
      }
    });
    expect(r.coverage.rollCandidates).toMatchObject({
      scoredCount: 0,
      excludedCount: 1
    });
    expect(r.verdict.status).toBe("insufficient_evidence");
  });
  it("does not resurrect initial ownership when a later checkpoint omits conflicting membership", () => {
    const e = candidate(report({ actorTeam: 1, omittedAfterConflict: true }));
    expect(e.scoringStatus).toBe("excluded");
    expect(e.teamId).toBe("unresolved");
    expect(e.metadata.ownershipConflict).toMatchObject({
      role: "actor",
      reason: "current_roster_conflict",
      initialTeamId: "0",
      observedTeamId: "1",
      checkpointAfter: 1
    });
  });
  it.each(["numeric", "block", "armor"] as const)(
    "a confirmed replacement resolves reused identity for %s",
    (kind) => {
      const r = report({
          kind,
          actorTeam: 1,
          initialDefender: 0,
          defenderTeam: 0,
          purchase: "numeric"
        }),
        e = candidate(r);
      expect(e.scoringStatus).toBe("scored");
      expect(e.teamId).toBe("1");
      expect(e.metadata.ownership).toMatchObject({
        basis: "confirmed_recruitment",
        teamId: "1",
        playerTypeId: 9,
        identitySourceId: "source-2",
        checkpointAfter: 2
      });
      expect(e.metadata.initialRosterName).toBeUndefined();
      expect(e.contextualImpact).toBeUndefined();
      if (kind === "block")
        expect(e.metadata.ownership?.defender).toMatchObject({
          playerId: "7",
          teamId: "0"
        });
    }
  );
  it("unknown buyer namespaces leave ownership to the fresh roster and do not leak identifiers", () => {
    const r = report({
      initialActor: "missing",
      actorTeam: 1,
      initialDefender: 0,
      defenderTeam: 0,
      purchase: "opaque",
      candidate: false,
      currentData: false
    });
    expect(candidate(r).metadata.ownership).toMatchObject({
      basis: "current_roster",
      teamId: "1",
      identitySourceId: "source-2"
    });
    expect(
      r.events.find((e) => e.metadata.identityMutation)?.metadata
        .identityMutation
    ).toMatchObject({ buyerIdKind: "uninterpreted", playerId: "42" });
    expect(r.recruitments).toHaveLength(0);
    expect(JSON.stringify(r)).not.toContain("opaque-buyer-identifier");
  });
  it("a future replacement roster cannot resolve an earlier attempt", () => {
    const e = candidate(
      report({ initialActor: "missing", purchase: "numeric", futureOnly: true })
    );
    expect(e.scoringStatus).toBe("excluded");
    expect(e.metadata.ownershipConflict?.reason).toBe("pending_identity");
    expect(e.probabilitySuccess).toBeNull();
  });
  it.each([
    "overlap",
    "wrong-data-id",
    "unknown-mutation",
    "unsupported-version"
  ])("preserves unresolved coverage for %s", (kind) => {
    const options = {
      initialActor:
        kind === "overlap" ? ("overlap" as const) : ("missing" as const),
      wrongDataId: kind === "wrong-data-id",
      unknownAfter: kind === "unknown-mutation"
    };
    if (kind === "unsupported-version")
      expect(() => report({ ...options, version: "future" })).toThrow(
        /Unsupported replay version/
      );
    const replay = parseReplayXml(ownershipReplayXml(options));
    if (kind === "unsupported-version") replay.replayVersion = "future";
    const e = candidate(LuckReportSchema.parse(analyzeReplayLuck(replay)));
    expect(e.scoringStatus).toBe("excluded");
    expect(e.weightedDelta).toBe(0);
    expect(e.metadata.isRollCandidate).toBe(true);
  });
  it.each(["effects", "transformation"])(
    "%s do not turn owned IDs into inherited skill or availability evidence",
    (kind) => {
      const r = report({
          kind: "block",
          unknownEffects: kind === "effects",
          unknownTransformations: kind === "transformation"
        }),
        e = candidate(r);
      expect(e.scoringStatus).toBe("excluded");
      expect(e.metadata.ownership?.role).toBe("actor");
      expect(e.metadata.block?.skillModel).toBeUndefined();
      expect(e.metadata.block?.traitEvidence).toBeUndefined();
      expect(e.contextualImpact).toBeUndefined();
    }
  );
  it("both-down armor belongs to each victim and cannot reward damage to that victim's team", () => {
    const r = report({ kind: "both_down" }),
      armor = r.events.filter((e) => e.metadata.damage);
    expect(
      armor.map((e) => [e.playerId, e.teamId, e.metadata.ownership?.role])
    ).toEqual([
      ["42", "0", "subject"],
      ["7", "1", "subject"]
    ]);
    expect(
      armor.every((e) => e.actualSuccess === false && e.weightedDelta < 0)
    ).toBe(true);
    expect(r.teams[0].luckScore).toBeCloseTo(-1/8 - 21 / 36, 12);
    expect(r.teams[1].luckScore).toBeCloseTo(-21 / 36, 12);
  });
  it("opponent choice is separate from the attacker and recipient-only questions do not confer control", () => {
    const chosen = candidate(report({ kind: "block", defenderChooses: true }));
    expect(chosen.metadata.ownership?.teamId).toBe("0");
    expect(chosen.metadata.block).toMatchObject({
      chooserTeamId: "1",
      chooserGamerId: 1
    });
    const waiting = candidate(
      report({ kind: "block", recipient: 1, canChoose: false })
    );
    expect(waiting.scoringStatus).toBe("scored");
    expect(waiting.metadata.block?.chooserGamerId).toBeUndefined();
    expect(waiting.metadata.block?.chooserTeamId).toBe("0");
    const bad = candidate(
      report({ kind: "block", recipient: 1, canChoose: true })
    );
    expect(bad.scoringStatus).toBe("excluded");
    expect(bad.statusReason).toContain("chooser slot conflicts");
  });
  it("a mismatched reroll slot cannot finance the actor's composite success chance", () => {
    const xml = contextReplayXml().replaceAll(
      "<GamerId>0</GamerId>",
      "<GamerId>1</GamerId>"
    );
    // Encoded source messages must be changed before encoding, so mutate the
    // decoded model while retaining its independently supplied roster facts.
    const replay = parseReplayXml(xml);
    for (const e of replay.turns.flatMap((t) => t.events))
      if (
        ["QuestionTeamRerollUsage", "ResultTeamRerollUsage"].includes(
          e.sourceTag
        )
      )
        e.payload!.GamerId = 1;
    const r = LuckReportSchema.parse(analyzeReplayLuck(replay)),
      e = candidate(r);
    expect(e.scoringStatus).toBe("excluded");
    expect(e.probabilitySuccess).toBeNull();
    expect(e.statusReason).toContain("matching roster owners");
  });
  it("swapping actual roster sides swaps reported perspectives, not outcome meaning", () => {
    const a = report({ kind: "both_down" }),
      b = report({
        kind: "both_down",
        initialActor: 1,
        actorTeam: 1,
        initialDefender: 0,
        defenderTeam: 0
      });
    const rolls = (r: LuckReport) =>
      r.events
        .filter((e) => e.scoringStatus === "scored")
        .map((e) => [
          e.playerId,
          e.teamId,
          e.actualSuccess,
          e.probabilitySuccess,
          e.weightedDelta
        ]);
    expect(rolls(b)).toEqual(
      rolls(a).map(([p, t, ...rest]) => [p, t === "0" ? "1" : "0", ...rest])
    );
    expect(b.teams[1].luckScore).toBe(a.teams[0].luckScore);
    expect(b.teams[0].luckScore).toBe(a.teams[1].luckScore);
  });
  it("swapping display labels cannot change attribution or favorability", () => {
    const xml=ownershipReplayXml({kind:"both_down",names:true});
    const a=analyzeNufflizerInput(xml), b=analyzeNufflizerInput(xml.replace("<name>Home</name>","<name>Away</name>").replace("<name>Away</name></Team></Teams>","<name>Home</name></Team></Teams>"));
    expect(b.teams.map(t=>t.teamName)).toEqual(a.teams.map(t=>t.teamName).reverse());
    const meaning=(r:LuckReport)=>r.events.map(e=>({source:e.metadata.sourceId,player:e.playerId,team:e.teamId,ownership:e.metadata.ownership,damage:e.metadata.damage,block:e.metadata.block,success:e.actualSuccess,chance:e.probabilitySuccess,value:e.weightedDelta}));
    expect(meaning(b)).toEqual(meaning(a));
    expect(b.teams.map(t=>[t.teamId,t.luckScore,t.categoryScores])).toEqual(a.teams.map(t=>[t.teamId,t.luckScore,t.categoryScores]));
  });

  it("unknown transitions invalidate even an initial owner's historical claim until a fresh roster renews it", () => {
    const e = candidate(report({ unknownAfter: true }));
    expect(e.metadata.ownershipConflict).toMatchObject({
      reason: "unverified_transition",
      initialTeamId: "0"
    });
    expect(e.scoringStatus).toBe("excluded");
    const renewed = candidate(
      report({ unknownAfter: true, renewAfterUnknown: true })
    );
    expect(renewed.scoringStatus).toBe("scored");
    expect(renewed.metadata.ownership?.basis).toBe("current_roster");
  });
  it("a small numeric buyer identifier is not a roster-team slot", () => {
    const r = report({
      actorTeam: 1,
      initialDefender: 0,
      defenderTeam: 0,
      purchase: "numeric",
      buyerNumeric: 0
    });
    expect(candidate(r).metadata.ownership).toMatchObject({
      basis: "confirmed_recruitment",
      teamId: "1"
    });
    expect(r.recruitments[0]).toMatchObject({
      gamerId: 0,
      rosterTeamId: "1",
      candidateTeamId: 1
    });
  });
  it.each(["unknown-step", "unknown-layout", "malformed-purchase"])(
    "%s cannot carry a stale roster proof",
    (kind) => {
      const replay = parseReplayXml(ownershipReplayXml());
      const steps = replay.turns.flatMap((t) => t.events),
        step = steps.find((e) => e.sourceTag === "PlayerStep")!;
      if (kind === "unknown-step") step.stepType = 999;
      if (kind === "unknown-layout") step.payload!.UnverifiedMutation = 1;
      if (kind === "malformed-purchase") {
        step.sourceTag = "EventBuyMercenary";
        step.payload = { MercenaryId: "unknown" };
      }
      const e = candidate(LuckReportSchema.parse(analyzeReplayLuck(replay)));
      expect(e.scoringStatus).toBe("excluded");
      expect(e.metadata.ownershipConflict?.reason).toBe(
        "unverified_transition"
      );
    }
  );

  it.each(["unknown-team", "duplicate-team"])(
    "a %s namespace in a current roster is a conflict",
    (kind) => {
      const replay = parseReplayXml(ownershipReplayXml());
      replay.boardCheckpoints!.at(-1)!.board!.teams[0].explicitTeamId =
        kind === "unknown-team" ? 999 : 1;
      const e = candidate(LuckReportSchema.parse(analyzeReplayLuck(replay)));
      expect(e.scoringStatus).toBe("excluded");
      expect(e.metadata.ownershipConflict?.reason).toBe(
        "invalid_current_identity"
      );
    }
  );
  it("a source-confirmed new identity resolves a formerly overlapping ID", () => {
    const e = candidate(
      report({ initialActor: "overlap", purchase: "numeric" })
    );
    expect(e.scoringStatus).toBe("scored");
    expect(e.metadata.ownership).toMatchObject({
      basis: "confirmed_recruitment",
      identitySourceId: "source-2",
      teamId: "0"
    });
  });
  it.each([7, 42])(
    "a recorded removal only invalidates its own player ID (%s)",
    (id) => {
      const xml = ownershipReplayXml().replace(
          "<EventExecuteSequence>",
          `<EventRemoveMercenary><MercenaryId>${id}</MercenaryId></EventRemoveMercenary><EventExecuteSequence>`
        ),
        e = candidate(analyzeNufflizerInput(xml));
      expect(e.scoringStatus).toBe(id === 42 ? "excluded" : "scored");
      if (id === 42)
        expect(e.metadata.ownershipConflict?.reason).toBe("pending_identity");
    }
  );

  it("public receipts cannot erase a pending identity or relabel its owner as initial", () => {
    const r = structuredClone(report({ purchase: "numeric", kind: "block" })),
      e = candidate(r);
    e.metadata.ownership!.basis = "initial_roster";
    delete e.metadata.ownership!.checkpointAfter;
    delete e.metadata.ownership!.identitySourceId;
    delete e.metadata.ownership!.playerTypeId;
    r.keyMoments = r.keyMoments.map((m) =>
      structuredClone(r.events.find((x) => x.id === m.id)!)
    );
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
    const clean = structuredClone(report({ purchase: "numeric" })),
      mutation = clean.events.find((x) => x.metadata.mercenary)!;
    delete mutation.metadata.identityMutation;
    expect(LuckReportSchema.safeParse(clean).success).toBe(false);
  });

  const forged: [string, (e: LuckEvent, r: LuckReport) => void][] = [
    [
      "removed required proof",
      (e) => {
        delete e.metadata.ownership;
      }
    ],
    [
      "different beneficiary",
      (e) => {
        e.metadata.ownership!.teamId = "1";
      }
    ],
    [
      "different subject",
      (e) => {
        e.metadata.ownership!.playerId = "7";
      }
    ],
    [
      "wrong role",
      (e) => {
        e.metadata.ownership!.role = "subject";
      }
    ],
    [
      "future current checkpoint",
      (e) => {
        e.metadata.ownership!.checkpointAfter = e.metadata.sourceIndex!;
      }
    ],
    [
      "initial proof with a current pointer",
      (e) => {
        e.metadata.ownership!.basis = "initial_roster";
      }
    ],
    [
      "invented purchase",
      (e) => {
        e.metadata.ownership!.basis = "confirmed_recruitment";
        e.metadata.ownership!.identitySourceId = "missing";
      }
    ],
    [
      "wrong identity mutation",
      (e) => {
        e.metadata.ownership!.identitySourceId = e.metadata.sourceId;
      }
    ],
    [
      "conflicting defender",
      (e) => {
        e.metadata.ownership!.defender!.teamId = e.teamId;
      }
    ],
    [
      "missing defender",
      (e) => {
        delete e.metadata.ownership!.defender;
      }
    ],
    [
      "chooser mismatch",
      (e) => {
        e.metadata.block!.chooserGamerId = 1;
      }
    ]
  ];
  it.each(forged)(
    "rejects coherent public-report tampering: %s",
    (_, mutate) => {
      const r = structuredClone(
          report({ kind: "block", initialActor: "missing" })
        ),
        e = candidate(r);
      mutate(e, r);
      r.keyMoments = r.keyMoments.map((m) =>
        structuredClone(r.events.find((e) => e.id === m.id)!)
      );
      expect(LuckReportSchema.safeParse(r).success).toBe(false);
    }
  );
});
