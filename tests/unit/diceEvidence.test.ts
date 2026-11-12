import { beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  inventoryDiceRecords,
  summarizeDiceRecords,
  reconcileDiceEvidence
} from "@/domain/nufflizer/diceEvidence";
import { findObservedRerollDice } from "@/domain/nufflizer/observedRerollDice";
import { findTeamDiceIdentities } from "@/domain/nufflizer/diceIdentityLinks";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { REPLAY_LIMITS } from "@/domain/replay/limits";
import {
  explainDiceCensus,
  explainObservedDice
} from "@/domain/nufflizer/presentation";
import type { ReplayModel } from "@/domain/replay/types";
import type { LuckReport } from "@/domain/nufflizer/types";
import { model, rollEvent } from "../helpers/replay";
const fixture = "tests/fixtures/evidence/bb3-dice-census.json";
const census = JSON.parse(readFileSync(fixture, "utf8")) as {
  files: {
    file: string;
    sourceSha256: string;
    recordsSha256: string;
    recordCount: number;
    nested: unknown[][];
  }[];
};
const prior = JSON.parse(
  readFileSync("tests/fixtures/evidence/dice-census-prior-scores.json", "utf8")
) as { files: { file: string; sha256: string }[] };
const digest = (v: string | Buffer) =>
  createHash("sha256").update(v).digest("hex");
const reports = new Map<string, LuckReport>();
let starReplay: ReplayModel, passReplay: ReplayModel;
beforeAll(() => {
  for (const c of census.files) {
    const input = readFileSync(`demo-replays/${c.file}`);
    expect(digest(input)).toBe(c.sourceSha256);
    const replay = parseReplayXml(decodeReplayInput(input.toString()).xml, {
      omitRawReplaySteps: true
    });
    reports.set(c.file, LuckReportSchema.parse(analyzeReplayLuck(replay)));
    if (c.file === "demo7.bbr") starReplay = replay;
    if (c.file === "demo4.bbr") passReplay = replay;
  }
}, 60000);
const single = (payload: Record<string, unknown>) =>
  model([
    rollEvent({
      id: "source-1",
      sourceIndex: 1,
      sourceTag: "EventMystery",
      payload
    })
  ]);
const die = (value: unknown = 1, dieType: unknown = 0) => ({
  Value: value,
  DieType: dieType
});
const faces = (value: unknown = 1) => ({ Die: die(value) });
const resummarize = (r: LuckReport) => {
  r.coverage.diceRecords = summarizeDiceRecords(r.diceRecords);
};
const oldProjection = (r: LuckReport) => ({
  events: r.events.filter((e) => e.scoringStatus === "scored"),
  contextComponents: r.contextComponents,
  verdict: r.verdict,
  teams: r.teams.map((t) =>
    Object.fromEntries(
      Object.entries(t).filter(
        ([k]) => !["eventCount", "excludedCount", "coverage"].includes(k)
      )
    )
  )
});
describe("independent source dice census", () => {
  it("reproduces the frozen stdlib extraction without importing the application", () => {
    const temp = mkdtempSync(join(tmpdir(), "dice-census-"));
    try {
      const out = join(temp, "census.json"),
        r = spawnSync(
          "python3",
          ["scripts/extract-dice-census.py", "--output", out],
          { encoding: "utf8" }
        );
      expect(r.status, r.stderr).toBe(0);
      expect(readFileSync(out, "utf8")).toBe(readFileSync(fixture, "utf8"));
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  }, 30000);
  it.each(census.files)(
    "joins every $file raw locator, field, type and face",
    (c) => {
      const r = reports.get(c.file)!;
      const rows = r.diceRecords.map((d) => [
        d.locator?.replayStep ?? null,
        d.locator?.childIndex ?? null,
        d.locator?.stepIndex ?? null,
        d.locator?.messageIndex ?? null,
        d.parentSourceTag,
        d.path,
        d.rollType ?? null,
        d.dice.map((v) => [v.value, v.dieType])
      ]);
      expect(rows).toHaveLength(c.recordCount);
      expect(
        digest(
          rows
            .map((v) => JSON.stringify(v))
            .sort()
            .join("\n")
        )
      ).toBe(c.recordsSha256);
      for (const raw of c.nested) {
        const record = r.diceRecords.find(
          (d) =>
            JSON.stringify([
              d.locator?.replayStep,
              d.locator?.childIndex,
              d.locator?.stepIndex ?? null,
              d.locator?.messageIndex ?? null,
              d.parentSourceTag,
              d.path,
              d.rollType ?? null,
              d.dice.map((v) => [v.value, v.dieType])
            ]) === JSON.stringify(raw)
        );
        expect(record?.disposition).toBe("unscored_roll");
        const event = r.events.find((e) => e.id === record!.eventId)!;
        expect(event).toMatchObject({
          scoringStatus: "excluded",
          actualSuccess: null,
          probabilitySuccess: null,
          delta: 0,
          weightedDelta: 0
        });
      }
    }
  );
  it.each(prior.files)(
    "preserves all prior scored events, context components and team values in $file",
    (c) => {
      expect(digest(JSON.stringify(oldProjection(reports.get(c.file)!)))).toBe(
        c.sha256
      );
    }
  );
  it("audits 5112 fields, 74 previously hidden outer draws and nine no-roll placeholders", () => {
    expect(
      [...reports.values()].reduce((n, r) => n + r.diceRecords.length, 0)
    ).toBe(5112);
    expect(census.files.reduce((n, f) => n + f.nested.length, 0)).toBe(74);
    const records = [...reports.values()].flatMap((r) => r.diceRecords);
    expect(records.filter((d) => d.disposition === "nonrandom")).toHaveLength(
      9
    );
    expect(records.filter((d) => d.disposition === "unresolved")).toHaveLength(
      3
    );
    expect(
      [...reports.values()]
        .flatMap((r) => r.events)
        .filter(
          (e) =>
            e.contextualBounds || e.possessionBounds || e.catchPossessionBounds
        )
    ).toHaveLength(27);
  });
});
describe("untrusted dice field boundaries and honest denominator", () => {
  it("counts one supported roll plus100 unknown nested fields conservatively", () => {
    const replay = model([
      rollEvent({ id: "source-1", sourceIndex: 1 }),
      ...Array.from({ length: 100 }, (_, i) =>
        rollEvent({
          id: `source-${i + 2}`,
          sourceIndex: i + 2,
          sourceTag: "EventMystery",
          type: "unknown",
          payload: { Nested: { Dice: faces() } }
        })
      )
    ]);
    const r = LuckReportSchema.parse(analyzeReplayLuck(replay));
    expect(r.coverage.rollCandidates).toMatchObject({
      scoredCount: 1,
      excludedCount: 100
    });
    expect(r.coverage.diceRecords).toMatchObject({
      coveredCount: 1,
      unresolvedCount: 100
    });
    expect(r.coverage.rollCandidates.scoredRate).toBe(1 / 101);
    expect(
      r.coverage.rollFamilies.some(
        (f) => f.teamId === "unresolved" && f.unattributedCount === 100
      )
    ).toBe(true);
  });
  it("retains root and repeated Dice containers separately, including malformed and missing fields", () => {
    const p = single({
        Dice: [{ Die: [die(2), die(5)] }, { Die: die(4) }],
        Nested: { Die: die("bad") },
        Other: { Dice: { Die: { Value: 3 } } }
      }),
      before = JSON.stringify(p),
      { records } = inventoryDiceRecords(p);
    expect(records.map((r) => r.path)).toEqual([
      ["Dice", 0],
      ["Dice", 1],
      ["Nested", "Die"],
      ["Other", "Dice"]
    ]);
    expect(records.map((r) => r.quality)).toEqual([
      "complete",
      "complete",
      "malformed",
      "incomplete"
    ]);
    expect(records[2]!.dice[0]!.value).toBeNull();
    expect(JSON.stringify(p)).toBe(before);
  });
  it.each([0, 7, -1, 1.5, "not-a-number", null])(
    "retains invalid D6 %s as malformed rather than zero success",
    (v) => {
      const r = analyzeReplayLuck(single({ Dice: { Die: die(v) } }));
      expect(r.diceRecords[0]!.quality).toBe("malformed");
      expect(r.diceRecords[0]!.disposition).toBe("unresolved");
      expect(
        r.events.find((e) => e.id === r.diceRecords[0]!.eventId)?.actualSuccess
      ).toBeNull();
      expect(LuckReportSchema.safeParse(r).success).toBe(true);
    }
  );
  it("does not deduplicate equal faces from independent events", () => {
    const r = analyzeReplayLuck(
      model(
        [1, 2].map((i) =>
          rollEvent({
            id: `source-${i}`,
            sourceIndex: i,
            payload: {
              Status: 1,
              NewRoll: 1,
              Difficulty: 2,
              Outcome: 1,
              Dice: faces(6)
            }
          })
        )
      )
    );
    expect(r.diceRecords).toHaveLength(2);
    expect(
      r.diceRecords.every((d) => d.disposition === "covered_roll" && !d.aliasOf)
    ).toBe(true);
  });
  it.each(["group", "depth", "field", "records", "work"])(
    "retains the existing %s work bound",
    (kind) => {
      let p = single({ Dice: faces() });
      if (kind === "group")
        p = single({ Dice: { Die: Array.from({ length: 7 }, () => die()) } });
      if (kind === "depth") {
        let n: Record<string, unknown> = { Dice: faces() };
        for (let i = 0; i < REPLAY_LIMITS.xmlDepth * 2; i++) n = { Nested: n };
        p = single(n);
      }
      if (kind === "field")
        p = single({ ["X".repeat(129)]: { Dice: faces() } });
      if (kind === "records")
        p = single({
          Rows: Array.from({ length: REPLAY_LIMITS.events + 1 }, () => ({
            Dice: faces()
          }))
        });
      if (kind === "work")
        p = single({
          Rows: Array.from({ length: REPLAY_LIMITS.xmlNodes + 1 }, () => 0)
        });
      expect(() => inventoryDiceRecords(p)).toThrow(/limit|exceeds/);
    }
  );
  it("rejects event expansion past the unchanged shared cap", () => {
    const p = single({ Nested: { Dice: faces() } });
    p.turns[0]!.events = Array.from(
      { length: REPLAY_LIMITS.events },
      (_, i) => ({
        ...p.turns[0]!.events[0]!,
        id: `source-${i + 1}`,
        sourceIndex: i + 1
      })
    );
    const base = analyzeReplayLuck(model([rollEvent()])).events[0]!;
    const es = p.turns[0]!.events.map((_, i) => ({
      ...base,
      id: `event-${i}`
    }));
    expect(() =>
      reconcileDiceEvidence(
        p,
        es,
        new Map(p.turns[0]!.events.map((e, i) => [e, es[i]!])),
        new Map()
      )
    ).toThrow(/limit/);
  });
});
describe("source-linked reroll dice identity without new odds", () => {
  it("preserves eight star decisions, including a used6→6 fresh draw, and one Pass reroll", () => {
    const ps = findObservedRerollDice(starReplay);
    expect(ps).toHaveLength(8);
    expect(ps.filter((p) => p.used)).toHaveLength(3);
    const same = ps.find((p) => p.question.sourceIndex === 4798)!;
    expect(same).toMatchObject({ used: true, originalDie: 6, finalDie: 6 });
    expect(same.final.payload?.NewRoll).toBe(0);
    const r = reports.get("demo7.bbr")!,
      f = r.events.find(
        (e) => e.metadata.observedReroll?.questionSourceId === same.question.id
      )!;
    expect(f).toMatchObject({
      teamId: "1",
      scoringStatus: "excluded",
      actualSuccess: null,
      probabilitySuccess: null
    });
    const d = r.diceRecords.find((d) => d.parentSourceId === same.final.id)!;
    expect(d.disposition).toBe("unscored_roll");
    expect(d.aliasOf).toBeUndefined();
    expect(explainObservedDice(f)).toContain(
      "new draw even if its face matches"
    );
    expect(findObservedRerollDice(passReplay)).toHaveLength(1);
    expect(findObservedRerollDice(passReplay)[0]).toMatchObject({
      ruleId: 47,
      originalDie: 1,
      finalDie: 5,
      used: true
    });
  });
  it.each(["choice", "owner", "die", "clock", "unknown", "rule", "flags"])(
    "does not link a contradicted star %s",
    (kind) => {
      const p = structuredClone(starReplay),
        proof = findObservedRerollDice(p).find(
          (q) => q.question.sourceIndex === 4798
        )!,
        es = p.turns.flatMap((t) => t.events);
      if (kind === "choice") proof.choice.payload!.Used = 2;
      if (kind === "owner")
        ((proof.question.actorTeamId = "0"),
          (proof.question.actorTeamSource = "explicit"));
      if (kind === "die")
        (proof.final.payload!.Dice as { Die: { Value: number } }).Die.Value = 7;
      if (kind === "rule") proof.question.payload!.StarSpecialRule = 999;
      if (kind === "flags") proof.final.payload!.Status = 2;
      if (kind === "clock") {
        const cp = structuredClone(
          p
            .boardCheckpoints!.filter(
              (c) => c.afterSourceIndex < proof.question.sourceIndex!
            )
            .at(-1)!
        );
        cp.afterSourceIndex = proof.question.sourceIndex! + 1;
        cp.board!.periodCode = 999;
        p.boardCheckpoints!.push(cp);
        p.boardCheckpoints!.sort(
          (a, b) => a.afterSourceIndex - b.afterSourceIndex
        );
      }
      if (kind === "unknown") {
        const e = es.find(
          (e) =>
            e.sourceIndex! > proof.question.sourceIndex! &&
            e.sourceIndex! < proof.choice.sourceIndex!
        )!;
        e.checkpointCarrier = false;
        e.sourceTag = "EventUnknownMutation";
      }
      expect(
        findObservedRerollDice(p).some((q) => q.question.sourceIndex === 4798)
      ).toBe(false);
    }
  );
  it("is prefix-stable and does not mutate observed replay state", () => {
    const before = JSON.stringify(starReplay),
      ps = findObservedRerollDice(starReplay),
      last = ps[0]!.final.sourceIndex!,
      p = structuredClone(starReplay);
    for (const t of p.turns)
      t.events = t.events.filter((e) => e.sourceIndex! <= last);
    p.boardCheckpoints = p.boardCheckpoints?.filter(
      (c) => c.afterSourceIndex < last
    );
    expect(findObservedRerollDice(p)[0]).toMatchObject({
      originalDie: ps[0]!.originalDie,
      finalDie: ps[0]!.finalDie,
      used: false
    });
    expect(JSON.stringify(starReplay)).toBe(before);
  });
  it("keeps unsupported family/gate identities unscored and missing roles unresolved", () => {
    const r = reports.get("demo11.bbr")!,
      e = r.events.find((e) => e.metadata.teamDiceIdentity)!;
    expect(e.metadata.teamDiceIdentity).toMatchObject({
      teamUsed: false,
      replacementRolled: false,
      gateSkillId: 50,
      gatePassed: false
    });
    expect(e.probabilitySuccess).toBeNull();
    expect(explainDiceCensus(r.coverage.diceRecords)).toContain(
      "not individual dice"
    );
    expect(findTeamDiceIdentities(starReplay).length).toBeGreaterThan(0);
  });
});
describe("public dice contract rejects forged evidence", () => {
  it.each([
    "missing",
    "duplicate",
    "order",
    "count",
    "alias",
    "cycle",
    "face",
    "cross_namespace",
    "covered",
    "placeholder",
    "quality"
  ])("rejects %s field forgery", (kind) => {
    const r = structuredClone(reports.get("demo7.bbr")!);
    const d = r.diceRecords.find((d) => d.disposition === "summary")!;
    if (kind === "missing") r.diceRecords.splice(0, 1);
    if (kind === "duplicate") r.diceRecords.push(structuredClone(d));
    if (kind === "order") r.diceRecords.reverse();
    if (kind === "count") r.coverage.diceRecords.summaryCount++;
    if (kind === "alias") d.aliasOf = "missing";
    if (kind === "cycle") d.aliasOf = d.id;
    if (kind === "face") d.dice[0]!.value = 99;
    if (kind === "cross_namespace") d.parentSourceTag = "EventUnknown";
    if (kind === "covered") {
      const n = r.diceRecords.find((d) => d.disposition === "unscored_roll")!;
      n.disposition = "covered_roll";
    }
    if (kind === "placeholder")
      r.diceRecords.find((d) => d.disposition === "nonrandom")!.dice[0]!.value =
        1;
    if (kind === "quality") {
      d.quality = "malformed";
    }
    if (kind !== "count") resummarize(r);
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
  it.each(["rule", "original", "choice", "terminal", "orphan", "gate"])(
    "rejects %s reroll proof forgery",
    (kind) => {
      const r = structuredClone(
          reports.get(kind === "gate" ? "demo11.bbr" : "demo7.bbr")!
        ),
        e = r.events.find((e) =>
          kind === "gate"
            ? e.metadata.teamDiceIdentity
            : e.metadata.observedReroll
        )!;
      if (kind === "gate") e.metadata.teamDiceIdentity!.gatePassed = true;
      else {
        const p = e.metadata.observedReroll!;
        if (kind === "rule") p.ruleId = 47;
        if (kind === "original") p.originalRecordId = "missing";
        if (kind === "choice") p.decisionSourceId = p.questionSourceId;
        if (kind === "terminal") p.finalDie = 99;
        if (kind === "orphan") delete e.metadata.observedReroll;
      }
      expect(LuckReportSchema.safeParse(r).success).toBe(false);
    }
  );
});
