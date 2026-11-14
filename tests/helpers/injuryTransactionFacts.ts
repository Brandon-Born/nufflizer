import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect } from "vitest";
import type { LuckEvent, LuckReport } from "@/domain/nufflizer/types";

type Projection = Record<string, unknown>;
const facts = JSON.parse(
  readFileSync("tests/fixtures/evidence/bb3-injury-transactions.json", "utf8")
) as {
  sourceHashes: Record<string, string>;
  injuries: {
    sourceFile: string;
    locator: LuckEvent["metadata"]["locator"];
    subjectId: string;
    header: Projection;
    messages: { tag: string; payload: Projection }[];
    previousStep: {
      header: Projection;
      messages: { tag: string; payload: Projection }[];
    };
    seeds: {
      playerId: string;
      rosterIndex: number;
      dataPlayerId: string;
      playerType: string;
      innate: number[] | null;
      acquired: number[] | null;
    }[];
    reference: {
      delta: string;
      weighted: string;
      counts: number[];
      dice: number[];
      outcome: string;
    };
  }[];
};
const number = (p: Projection, key: string) => {
  expect(Array.isArray(p[key]), key).toBe(true);
  return Number((p[key] as string[])[0]);
};
const rational = (s: string) => {
  const [n, d = "1"] = s.split("/");
  return Number(n) / Number(d);
};

// Supplements historical source oracles with newly admitted, independently
// decoded prefixes. No production eligibility or probability helper is used.
export function assertTransactionInjury(
  file: string,
  e: LuckEvent,
  report: LuckReport
) {
  const c = facts.injuries.find(
    (c) =>
      c.sourceFile === file &&
      JSON.stringify(c.locator) === JSON.stringify(e.metadata.locator)
  );
  if (!c) return false;
  expect(
    createHash("sha256")
      .update(readFileSync(`demo-replays/${file}`))
      .digest("hex")
  ).toBe(facts.sourceHashes[file]);
  expect(e.playerId).toBe(c.subjectId);
  expect(number(c.header, "PlayerId")).toBe(Number(e.playerId));
  expect(number(c.header, "TargetId")).toBe(Number(e.playerId));
  expect(number(c.header, "Source")).toBe(
    e.metadata.injuryObservation!.sourceCode
  );
  expect(e.metadata.dice).toEqual(c.reference.dice);
  expect(e.metadata.injuryObservation?.outcome).toBe(c.reference.outcome);
  expect(e.metadata.injuryTable?.counts).toEqual(c.reference.counts);
  expect(e.delta).toBe(rational(c.reference.delta));
  expect(e.weightedDelta).toBe(rational(c.reference.weighted));
  expect(e.actualSuccess).toBeNull();
  expect(e.probabilitySuccess).toBeNull();
  expect(e.contextualImpact).toBeUndefined();
  const roll = c.messages.find((m) => m.tag === "ResultInjuryRoll")!,
    armor = c.messages.find(
      (m) => m.tag === "ResultRoll" && number(m.payload, "RollType") === 10
    )!;
  expect(number(roll.payload, "Outcome")).toBe(e.metadata.outcomeCode);
  expect(number(roll.payload, "RollType")).toBe(11);
  expect(armor).toBeDefined();
  const score = e.metadata.injuryScoring!,
    cause = score.cause;
  const rawSpp = c.messages.find((m) => m.tag === "ResultGainSpp");
  expect(Boolean(score.sppSourceId)).toBe(Boolean(rawSpp));
  if (rawSpp) {
    const s = report.events.find(
      (s) => s.metadata.sourceId === score.sppSourceId
    )!;
    expect(s.playerId).toBe(String(number(rawSpp.payload, "PlayerId")));
    expect(number(rawSpp.payload, "SppGained")).toBe(2);
    expect(s.scoringStatus).toBe("excluded");
    expect(s.metadata.isRollCandidate).toBe(false);
    expect(s.weightedDelta).toBe(0);
    expect(s.playerId).not.toBe(e.playerId);
    expect(s.teamId).not.toBe(e.teamId);
  }
  if (cause.kind === "block") {
    expect(number(c.previousStep.header, "StepType")).toBe(6);
    const pool = report.events.find(
      (p) => p.metadata.sourceId === cause.poolSourceId
    )!;
    expect(number(c.previousStep.header, "PlayerId")).toBe(
      Number(pool.playerId)
    );
    expect(number(c.previousStep.header, "TargetId")).toBe(Number(e.playerId));
    const final = c.previousStep.messages.find(
      (m) => m.tag === "ResultBlockOutcome"
    )!;
    expect(number(final.payload, "AttackerId")).toBe(Number(pool.playerId));
    expect(number(final.payload, "DefenderId")).toBe(Number(e.playerId));
    const applied = report.events.find(
      (p) => p.metadata.sourceId === cause.appliedOutcomeSourceId
    )!;
    expect(applied.metadata.outcomeCode).toBe(number(final.payload, "Outcome"));
    const proof = cause.attackerTraitEvidence!,
      seed = c.seeds.find((s) => s.playerId === proof.playerId)!;
    expect(seed).toBeDefined();
    expect(proof.rosterIndex).toBe(seed.rosterIndex);
    expect(proof.traits).toEqual({
      dataPlayerId: Number(seed.dataPlayerId),
      playerTypeId: Number(seed.playerType),
      innateSkills: seed.innate,
      acquiredSkills: seed.acquired
    });
  } else {
    expect(number(c.previousStep.header, "StepType")).toBe(1);
    const failure = c.previousStep.messages.find(
      (m) => m.tag === "ResultRoll"
    )!;
    expect(number(failure.payload, "Outcome")).toBe(0);
    expect([1, 2]).toContain(number(failure.payload, "RollType"));
    expect(number(c.previousStep.header, "PlayerId")).toBe(Number(e.playerId));
  }
  return true;
}
