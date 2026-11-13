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
import {
  findTeamDiceIdentities,
  linkApothecaryDiceCopies
} from "@/domain/nufflizer/diceIdentityLinks";
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
import {
  model,
  rollEvent,
  envelope,
  sequence,
  rollXml,
  encodedMessage
} from "../helpers/replay";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { contextReplayXml } from "../helpers/contextReplay";
import { projectionXml } from "../helpers/playback";
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
const ownershipCohort = JSON.parse(
  readFileSync(
    "tests/fixtures/evidence/bb3-ownership-prior-cohort.json",
    "utf8"
  )
) as {
  files: {
    file: string;
    sourceSha256: string;
    priorProjectionSha256: string;
    sourceIds: string[];
  }[];
};
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
const oldProjection = (r: LuckReport, file: string) => {
  const cohort = ownershipCohort.files.find((c) => c.file === file)!;
  expect(cohort.priorProjectionSha256).toBe(
    prior.files.find((c) => c.file === file)!.sha256
  );
  expect(cohort.sourceSha256).toBe(
    census.files.find((c) => c.file === file)!.sourceSha256
  );
  const ids = new Set(cohort.sourceIds),
    events = r.events.filter((e) => ids.has(e.metadata.sourceId!));
  expect(events).toHaveLength(ids.size);
  expect(events.every((e) => e.scoringStatus === "scored")).toBe(true);
  const teams = structuredClone(r.teams);
  for (const t of teams) {
    t.luckScore = 0;
    t.impactCount = 0;
    t.impactScore = 0;
    t.impactByType = { dodge: 0, ball_handling: 0 };
    for (const k of Object.keys(t.categoryScores))
      t.categoryScores[k as keyof typeof t.categoryScores] = 0;
  }
  const category = {
    block: "block",
    armor_break: "armorBreak",
    injury: "injury",
    dodge: "dodge",
    ball_handling: "ballHandling",
    argue_call: "argueCall",
    movement_risk: "movementRisk"
  } as const;
  for (const e of events) {
    const t = teams.find((t) => t.teamId === e.teamId)!;
    t.luckScore += e.weightedDelta;
    if (e.type !== "unknown")
      t.categoryScores[category[e.type]] += e.weightedDelta;
    if (
      e.contextualImpact &&
      (e.type === "dodge" || e.type === "ball_handling")
    ) {
      t.impactCount++;
      t.impactScore += e.contextualImpact.contribution;
      t.impactByType[e.type] += e.contextualImpact.contribution;
    }
  }
  return {
    // This hash predates modifier and block-ball receipts. Preserve every
    // original cohort's fields and totals. Newly attributed outcomes have their
    // own independently decoded role/dice references; no hash is reset.
    events: events.map((e) => ({
      ...e,
      metadata: Object.fromEntries(
        Object.entries(e.metadata).filter(
          ([key]) =>
            ![
              "fixedNumericModifiers",
              "blockBallRelease",
              "ownership"
            ].includes(key)
        )
      )
    })),
    contextComponents: r.contextComponents,
    verdict: {
      ...r.verdict,
      scoreGap: Math.abs(teams[0].luckScore - teams[1].luckScore)
    },
    teams: teams.map((t) =>
      Object.fromEntries(
        Object.entries(t).filter(
          ([k]) => !["eventCount", "excludedCount", "coverage"].includes(k)
        )
      )
    )
  };
};
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
      const rows = r.diceRecords
        .filter((d) => d.parentKind === "event")
        .map((d) => [
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
      expect(
        digest(JSON.stringify(oldProjection(reports.get(c.file)!, c.file)))
      ).toBe(c.sha256);
    }
  );
  it("audits 5112 fields, 74 previously hidden outer draws and nine no-roll placeholders", () => {
    expect(
      [...reports.values()].reduce(
        (n, r) =>
          n + r.diceRecords.filter((d) => d.parentKind === "event").length,
        0
      )
    ).toBe(5112);
    expect(census.files.reduce((n, f) => n + f.nested.length, 0)).toBe(74);
    const records = [...reports.values()].flatMap((r) => r.diceRecords);
    expect(records.filter((d) => d.disposition === "nonrandom")).toHaveLength(
      9
    );
    expect(records.filter((d) => d.disposition === "unresolved")).toHaveLength(
      0
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

const historyCensus = JSON.parse(readFileSync(fixture, "utf8")) as {
  files: {
    file: string;
    snapshotFieldCount: number;
    snapshotRecordsSha256: string;
    snapshotLinksSha256: string;
    snapshotMatchedCount: number;
    emptyLastFieldCount: number;
  }[];
};
const identities = JSON.parse(
  readFileSync("tests/fixtures/evidence/bb3-dice-identities.json", "utf8")
) as {
  cases: {
    id: string;
    sourceFile: string;
    sha256: string;
    kind: string;
    subjectId: number;
    ownerId: string;
    originalDie: number;
    finalDie: number | null;
    question: {
      replayStep: number;
      childIndex: number;
      stepIndex: number;
      messageIndex: number;
    };
    choice: {
      replayStep: number;
      childIndex: number;
      stepIndex: number;
      messageIndex: number;
    };
    rawRecords: {
      step: Parameters<typeof projectionXml>[0];
      messages: Parameters<typeof projectionXml>[0][];
    }[];
  }[];
};
type IdentityCase = (typeof identities.cases)[number];
function identityFragment(c: IdentityCase) {
  const team = (id: string, player: number) =>
    `<TeamState><Data><TeamId>${id}</TeamId></Data><ListPitchPlayers><PlayerState><Id>${player}</Id></PlayerState></ListPitchPlayers></TeamState>`;
  const rows = c.rawRecords
    .map(
      (f) =>
        `<StepResult><Step><MessageData>${encodedMessage(projectionXml(f.step))}</MessageData></Step><Results>${f.messages.map((m) => `<StringMessage><MessageData>${encodedMessage(projectionXml(m))}</MessageData></StringMessage>`).join("")}</Results></StepResult>`
    )
    .join("");
  // Synthetic owner scaffolding is separate from the original source/hash join.
  return parseReplayXml(
    envelope(
      `<NotificationGameJoined><InitialBoardState><ListTeams>${team(c.ownerId, c.subjectId)}${team(c.ownerId === "0" ? "1" : "0", 90000)}</ListTeams></InitialBoardState></NotificationGameJoined><EventExecuteSequence><Sequence>${rows}</Sequence></EventExecuteSequence>`
    )
  );
}
const weather = (a = 2, b = 3) =>
  `<EventWeatherRoll><Dice><Die><Value>${a}</Value></Die><Die><Value>${b}</Value></Die></Dice></EventWeatherRoll>`;
const lastWeather = (a = 2, b = 3) =>
  `<LastWeatherRoll><Die><Value>${a}</Value></Die><Die><Value>${b}</Value></Die></LastWeatherRoll>`;
const unknownDice = `<Dice><Die><DieType>0</DieType><Value>3</Value></Die></Dice>`;
const sourceRow = (d: LuckReport["diceRecords"][number]) => [
  d.locator?.replayStep ?? null,
  d.locator?.childIndex ?? null,
  d.locator?.stepIndex ?? null,
  d.locator?.messageIndex ?? null,
  d.parentSourceTag,
  d.path,
  d.rollType ?? null,
  d.dice.map((v) => [v.value, v.dieType])
];
describe("snapshot dice cannot disappear behind board projection", () => {
  it.each(historyCensus.files)(
    "independently reconciles every $file snapshot to its latest actual emission",
    (c) => {
      const r = reports.get(c.file)!,
        ds = r.diceRecords.filter((d) => d.parentKind === "snapshot"),
        byId = new Map(r.diceRecords.map((d) => [d.id, d]));
      expect(ds).toHaveLength(c.snapshotFieldCount);
      expect(ds.filter((d) => d.disposition === "summary")).toHaveLength(
        c.snapshotMatchedCount
      );
      expect(
        digest(
          ds
            .map((d) => JSON.stringify(sourceRow(d)))
            .sort()
            .join("\n")
        )
      ).toBe(c.snapshotRecordsSha256);
      const links = ds.map((d) => [
        sourceRow(d),
        d.aliasOf ? sourceRow(byId.get(d.aliasOf)!).slice(0, 6) : null
      ]);
      expect(
        digest(
          links
            .map((v) => JSON.stringify(v))
            .sort()
            .join("\n")
        )
      ).toBe(c.snapshotLinksSha256);
      expect(
        r.coverage.diceRecords.eventRecordCount +
          r.coverage.diceRecords.snapshotRecordCount
      ).toBe(r.diceRecords.length);
    }
  );
  it("retains100 unknown snapshot groups beside one supported roll and invalidates playable-state trust", () => {
    const xml = envelope(
        `<ReplayStep>${sequence([rollXml(7, 6, 2)])}<BoardState>${Array.from({ length: 100 }, (_, i) => `<Unknown${i}>${unknownDice}</Unknown${i}>`).join("")}</BoardState></ReplayStep>`
      ),
      p = parseReplayXml(xml, { omitRawReplaySteps: true }),
      r = LuckReportSchema.parse(analyzeReplayLuck(p));
    expect(r.coverage.rollCandidates).toMatchObject({
      scoredCount: 1,
      excludedCount: 100,
      scoredRate: 1 / 101
    });
    expect(r.coverage.diceRecords).toMatchObject({
      eventRecordCount: 1,
      snapshotRecordCount: 100,
      unresolvedCount: 100,
      scoredRate: 1 / 101
    });
    expect(p.boardCheckpoints!.at(-1)!.board!.issues).toContain(
      "unresolved_snapshot_dice"
    );
    expect(
      r.coverage.rollFamilies.find((f) => f.sourceTag === "BoardState")
        ?.unattributedCount
    ).toBe(100);
    expect(r.verdict.luckierTeam).toBe("unknown");
  });
  it("withholds an earlier contextual point estimate after an unknown snapshot randomizer", () => {
    const xml = contextReplayXml(),
      changed = xml.replace(
        "</BoardState>",
        `<Unrecognized>${unknownDice}</Unrecognized></BoardState>`
      ),
      base = analyzeNufflizerInput(xml),
      r = analyzeNufflizerInput(changed);
    expect(base.events.filter((e) => e.contextualImpact)).toHaveLength(1);
    expect(r.events.filter((e) => e.contextualImpact)).toHaveLength(0);
    expect(r.teams[0].impactCount).toBe(0);
    expect(r.coverage.diceRecords.unresolvedCount).toBe(1);
  });
  it.each([false, true])(
    "keeps repeated sibling paths exact with numeric-reference fallback %s",
    (references) => {
      const dice = references
        ? unknownDice.replace("3</Value>", "&#51;</Value>")
        : unknownDice;
      const xml = envelope(
        `<ReplayStep><BoardState><Group><Item/><Item>${dice}</Item><Item><Nested>${dice}</Nested></Item></Group></BoardState></ReplayStep>`
      );
      const full = parseReplayXml(xml),
        projected = parseReplayXml(xml, { omitRawReplaySteps: true });
      expect(projected.boardCheckpoints![0]!.dicePayload).toEqual(
        full.boardCheckpoints![0]!.dicePayload
      );
      expect(
        inventoryDiceRecords(projected).records.map((d) => d.path)
      ).toEqual([
        ["Group", "Item", 1, "Dice"],
        ["Group", "Item", 2, "Nested", "Dice"]
      ]);
    }
  );
  it("does not inflate opportunities with repeated weather snapshots or deduplicate independent equal rolls", () => {
    const xml = envelope(
        `<ReplayStep>${weather()}${Array.from({ length: 50 }, () => `<BoardState>${lastWeather()}</BoardState>`).join("")}${weather()}<BoardState>${lastWeather()}</BoardState></ReplayStep>`
      ),
      r = analyzeNufflizerInput(xml);
    expect(r.coverage.rollCandidates.excludedCount).toBe(2);
    expect(r.coverage.diceRecords).toMatchObject({
      eventRecordCount: 2,
      snapshotRecordCount: 51,
      unscoredCount: 2,
      summaryCount: 51,
      unresolvedCount: 0
    });
    const last = r.diceRecords.at(-1)!,
      target = r.diceRecords.find((d) => d.id === last.aliasOf)!;
    expect(target.locator!.childIndex).toBe(51);
  });
  it("cannot link an older or future matching weather value instead of the latest preceding emission", () => {
    const r = analyzeNufflizerInput(
      envelope(
        `<ReplayStep>${weather(1, 2)}${weather(4, 5)}<BoardState>${lastWeather(1, 2)}</BoardState>${weather(1, 2)}</ReplayStep>`
      )
    );
    const s = r.diceRecords.find((d) => d.parentKind === "snapshot")!;
    expect(s.disposition).toBe("unresolved");
    expect(s.aliasOf).toBeUndefined();
    expect(r.coverage.rollCandidates.excludedCount).toBe(4);
  });
  it("keeps a snapshot before any named emission unresolved, including an unknown replay version", () => {
    for (const v of ["1-4-0-0", "future-version"]) {
      const p = parseReplayXml(
        envelope(
          `<ReplayStep><BoardState>${lastWeather()}</BoardState>${weather()}</ReplayStep>`
        )
      );
      p.replayVersion = v;
      const r = LuckReportSchema.parse(analyzeReplayLuck(p));
      expect(
        r.diceRecords.find((d) => d.parentKind === "snapshot")?.disposition
      ).toBe("unresolved");
    }
  });
  it("retains initial snapshot dice without adding or renumbering raw gameplay events", () => {
    const base = envelope(sequence([rollXml()])),
      initial = base.replace(
        "<ReplayVersion>",
        `<NotificationGameJoined><InitialBoardState><Unknown>${unknownDice}</Unknown></InitialBoardState></NotificationGameJoined><ReplayVersion>`
      ),
      a = parseReplayXml(base),
      b = parseReplayXml(initial);
    expect(b.turns.flatMap((t) => t.events).map((e) => e.id)).toEqual(
      a.turns.flatMap((t) => t.events).map((e) => e.id)
    );
    const r = LuckReportSchema.parse(analyzeReplayLuck(b));
    expect(r.diceRecords[0]).toMatchObject({
      parentKind: "snapshot",
      parentSourceTag: "InitialBoardState",
      parentSourceIndex: 0,
      disposition: "unresolved"
    });
  });
  it.each([
    "older_alias",
    "unknown_path",
    "parent_count",
    "parent_kind",
    "covered",
    "missing"
  ])("rejects forged snapshot %s", (kind) => {
    const r = analyzeNufflizerInput(
        envelope(
          `<ReplayStep>${weather(1, 2)}${weather(1, 2)}<BoardState>${lastWeather(1, 2)}</BoardState></ReplayStep>`
        )
      ),
      s = r.diceRecords.at(-1)!;
    if (kind === "older_alias") s.aliasOf = r.diceRecords[0]!.id;
    if (kind === "unknown_path") s.path = ["Unknown", "Die"];
    if (kind === "parent_count") r.coverage.diceParentCount++;
    if (kind === "parent_kind") s.parentKind = "event";
    if (kind === "covered") s.disposition = "covered_roll";
    if (kind === "missing") r.diceRecords.pop();
    resummarize(r);
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
});
describe("independent casualty-copy and retained accuracy identity witnesses", () => {
  it("reproduces the independent identity extractor exactly", () => {
    const temp = mkdtempSync(join(tmpdir(), "dice-identities-"));
    try {
      const out = join(temp, "cases.json"),
        r = spawnSync(
          "python3",
          ["scripts/extract-dice-identity-evidence.py", "--output", out],
          { encoding: "utf8" }
        );
      expect(r.status, r.stderr).toBe(0);
      expect(readFileSync(out, "utf8")).toBe(
        readFileSync("tests/fixtures/evidence/bb3-dice-identities.json", "utf8")
      );
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  }, 30000);
  it.each(identities.cases)(
    "joins $id without accepting a treatment, value or odds policy",
    (c) => {
      expect(digest(readFileSync(`demo-replays/${c.sourceFile}`))).toBe(
        c.sha256
      );
      const r = reports.get(c.sourceFile)!,
        p =
          c.kind === "casualty_copy"
            ? ["OriginalRoll", "Dice"]
            : ["RollInfos", "Dice"],
        location = c.kind === "casualty_copy" ? c.choice : c.question;
      const d = r.diceRecords.find(
        (d) =>
          JSON.stringify(d.path) === JSON.stringify(p) &&
          JSON.stringify(d.locator) === JSON.stringify(location)
      )!;
      expect(d).toBeDefined();
      expect(d.dice[0]!.value).toBe(c.originalDie);
      if (c.kind === "casualty_copy") {
        expect(d.disposition).toBe("summary");
        expect(
          r.events.filter(
            (e) =>
              e.metadata.apothecary &&
              e.metadata.sourceIndex === d.parentSourceIndex
          )
        ).toHaveLength(0);
      } else {
        expect(d.disposition).toBe("unscored_roll");
        const e = r.events.find(
          (e) => e.metadata.teamDiceIdentity?.originalRecordId === d.id
        )!;
        expect(e.metadata.teamDiceIdentity).toMatchObject({
          teamUsed: false,
          replacementRolled: false,
          originalDie: 1,
          finalDie: 1
        });
        expect(e).toMatchObject({
          scoringStatus: "excluded",
          probabilitySuccess: null,
          actualSuccess: false
        });
      }
      const fragment = LuckReportSchema.parse(
        analyzeReplayLuck(identityFragment(c))
      );
      expect(fragment.coverage.diceRecords.unresolvedCount).toBe(0);
    }
  );
  it.each(["die", "source", "gamer", "actor", "cell", "unknown", "clock"])(
    "rejects a contradictory casualty-copy %s",
    (kind) => {
      const p = identityFragment(identities.cases[0]!),
        es = p.turns.flatMap((t) => t.events),
        q = es.find((e) => e.sourceTag === "QuestionApothecaryCasualtyUsage")!,
        c = es.find((e) => e.sourceTag === "QuestionApothecaryCasualtyChoice")!,
        step = es.find((e) => e.type === "step" && e.actionId === c.actionId)!;
      const copy = c.payload!.OriginalRoll as {
        Source: number;
        Dice: { Die: { Value: number } };
      };
      if (kind === "die") copy.Dice.Die.Value = 8;
      if (kind === "source") copy.Source = 9;
      if (kind === "gamer") c.payload!.GamerId = 1;
      if (kind === "actor") c.attributionConflict = true;
      if (kind === "cell") delete step.payload!.CellFrom;
      if (kind === "unknown") {
        step.sourceTag = "EventUnknownMutation";
        step.type = "unknown";
      }
      if (kind === "clock") {
        const cp = structuredClone(p.boardCheckpoints![0]!);
        cp.afterSourceIndex = q.sourceIndex!;
        cp.board!.periodCode = 999;
        p.boardCheckpoints!.push(cp);
      }
      const links = new Map();
      linkApothecaryDiceCopies(p, links);
      expect(links.get(c.id!)).toBeUndefined();
    }
  );
  it.each([
    "fresh",
    "final_cell",
    "from",
    "target",
    "threshold",
    "unknown_field",
    "state"
  ])("rejects a contradictory retained accuracy %s", (kind) => {
    const p = identityFragment(identities.cases[2]!),
      proof = findTeamDiceIdentities(p).find(
        (p) =>
          (p.question.payload?.RollInfos as { RollType?: number })?.RollType ===
          45
      )!;
    expect(proof).toBeDefined();
    const es = p.turns.flatMap((t) => t.events),
      step = es.find(
        (e) => e.type === "step" && e.actionId === proof.final.actionId
      )!;
    if (kind === "fresh") proof.final.payload!.NewRoll = 1;
    if (kind === "final_cell") step.payload!.FinalCell = { X: 0, Y: 0 };
    if (kind === "from") step.payload!.CellFrom = { X: 0, Y: 0 };
    if (kind === "target") proof.final.stepTargetId = "999";
    if (kind === "threshold") proof.final.payload!.Difficulty = 3;
    if (kind === "unknown_field") step.payload!.NewPolicy = 1;
    if (kind === "state") step.payload!.State = 2;
    expect(
      findTeamDiceIdentities(p).some(
        (p) =>
          (p.question.payload?.RollInfos as { RollType?: number })?.RollType ===
          45
      )
    ).toBe(false);
  });
});

describe("unrecognized XML containers and malformed control fields", () => {
  it.each([false, true])(
    "counts100 unknown root groups before support with whitespace %s",
    (pretty) => {
      let xml = envelope(
        `<ReplayStep>${sequence([rollXml(7, 6, 2)])}</ReplayStep><Unrecognized>${Array.from({ length: 100 }, () => `<Field>${unknownDice}</Field>`).join("")}</Unrecognized>`
      );
      if (pretty) xml = xml.replaceAll("><", ">\n<");
      const r = analyzeNufflizerInput(xml);
      expect(r.coverage.rollCandidates).toMatchObject({
        scoredCount: 1,
        excludedCount: 100,
        scoredRate: 1 / 101
      });
      expect(r.coverage.diceRecords.unresolvedCount).toBe(100);
      expect(
        r.diceRecords.find((d) => d.parentSourceTag === "Field")?.locator
          ?.xmlPath
      ).toEqual(["Replay", "Unrecognized", "Field", 0]);
      expect(
        r.events
          .filter((e) => e.metadata.diceEvidenceId)
          .every(
            (e) =>
              e.teamId === "unresolved" &&
              e.probabilitySuccess === null &&
              e.actualSuccess === null
          )
      ).toBe(true);
    }
  );
  it("does not promote a complete-looking check from an unknown source namespace", () => {
    const xml = envelope(
        `<UnknownCheck><RollType>7</RollType><TeamId>0</TeamId><PlayerId>42</PlayerId><Status>1</Status><NewRoll>1</NewRoll><Difficulty>2</Difficulty><Outcome>1</Outcome><Dice><Die><Value>6</Value><DieType>0</DieType></Die></Dice></UnknownCheck>`
      ),
      r = analyzeNufflizerInput(xml);
    expect(r.coverage.rollCandidates).toMatchObject({
      scoredCount: 0,
      excludedCount: 1
    });
    expect(r.diceRecords[0]?.disposition).toBe("unresolved");
    expect(r.verdict.status).toBe("insufficient_evidence");
  });
  it.each(["Replay", "MatchReplay"])(
    "treats only the exact scalar customization field as configuration under %s",
    (root) => {
      const known = envelope(
          `<Rosters><TeamRoster><Customization><Dice>opaque-asset</Dice></Customization></TeamRoster></Rosters>`,
          root
        ),
        nested = known.replace(
          "opaque-asset",
          "<Die><Value>6</Value><DieType>0</DieType></Die>"
        );
      expect(analyzeNufflizerInput(known).diceRecords).toHaveLength(0);
      expect(
        analyzeNufflizerInput(nested).coverage.diceRecords.unresolvedCount
      ).toBe(1);
      expect(
        analyzeNufflizerInput(
          envelope(
            `<Unknown><Customization><Dice>opaque-asset</Dice></Customization></Unknown>`,
            root
          )
        ).coverage.diceRecords.malformedCount
      ).toBe(1);
    }
  );
  it("retains end-state dice outside the playable checkpoint stream", () => {
    const xml = envelope(
        `<ReplayStep>${weather()}</ReplayStep><EndGame><BoardState>${lastWeather()}</BoardState></EndGame>`
      ),
      p = parseReplayXml(xml),
      r = LuckReportSchema.parse(analyzeReplayLuck(p));
    expect(p.boardCheckpoints).toHaveLength(0);
    expect(p.endDiceSnapshots).toHaveLength(1);
    expect(r.diceRecords.at(-1)).toMatchObject({
      parentKind: "snapshot",
      disposition: "summary",
      locator: { xmlPath: ["Replay", "EndGame", "BoardState"] }
    });
    expect(r.coverage.rollCandidates.excludedCount).toBe(1);
  });
  it.each(["carrier", "sequence", "controller", "atomic_die"])(
    "rejects hidden structured dice in a known %s instead of reporting full support",
    (kind) => {
      const hidden = `<Hidden>${unknownDice}</Hidden>`;
      let extra = `<Carrier>${hidden}</Carrier>`;
      if (kind === "sequence")
        extra = `<EventExecuteSequence>${hidden}</EventExecuteSequence>`;
      if (kind === "controller")
        extra = `<EventActiveGamerChanged><NewActiveGamer>0</NewActiveGamer>${hidden}</EventActiveGamerChanged>`;
      if (kind === "atomic_die")
        extra = sequence([
          rollXml(7, 6, 2).replace("</Die>", `${hidden}</Die>`)
        ]);
      expect(() =>
        analyzeNufflizerInput(
          envelope(
            `<ReplayStep>${sequence([rollXml(7, 6, 2)])}${extra}</ReplayStep>`
          )
        )
      ).toThrow(/Carrier|encoded|controller|control|atomic/);
    }
  );
  it("keeps a rare malformed/unknown family visible without making a comparative verdict", () => {
    const p = model([
        rollEvent({ id: "source-1", sourceIndex: 1 }),
        rollEvent({
          id: "source-2",
          sourceIndex: 2,
          type: "unknown",
          sourceTag: "EventUnknown",
          payload: { Nested: { Dice: { Die: die("invalid") } } }
        })
      ]),
      r = LuckReportSchema.parse(analyzeReplayLuck(p)),
      f = r.coverage.rollFamilies.find((f) => f.sourceTag === "EventUnknown")!;
    expect(f).toMatchObject({
      malformedCount: 1,
      unresolvedIdentityCount: 1,
      unattributedCount: 1
    });
    expect(r.verdict.luckierTeam).toBe("unknown");
    f.malformedCount = 0;
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
});

describe("snapshot field order and control-message boundaries", () => {
  it("does not treat property ordering within a typed die as an unknown state mutation", () => {
    const first = `<EventWeatherRoll><Dice><Die><DieType>0</DieType><Value>2</Value></Die><Die><DieType>0</DieType><Value>3</Value></Die></Dice></EventWeatherRoll>`,
      last = `<LastWeatherRoll><Die><Value>2</Value><DieType>0</DieType></Die><Die><Value>3</Value><DieType>0</DieType></Die></LastWeatherRoll>`,
      p = parseReplayXml(
        envelope(
          `<ReplayStep>${first}<BoardState>${last}</BoardState></ReplayStep>`
        )
      );
    expect(p.boardCheckpoints![0]!.board!.issues).not.toContain(
      "unresolved_snapshot_dice"
    );
    expect(
      LuckReportSchema.parse(analyzeReplayLuck(p)).coverage.diceRecords
        .summaryCount
    ).toBe(1);
  });
  it.each([
    "EventGamersAreReady",
    "EventStartActiveTimer",
    "EventPauseActiveTimer",
    "EventActiveTimerChanged",
    "Clock"
  ])("rejects a malformed %s containing hidden dice", (tag) => {
    expect(() =>
      analyzeNufflizerInput(
        envelope(
          `<ReplayStep>${sequence([rollXml(7, 6, 2)])}<${tag}>${unknownDice}</${tag}></ReplayStep>`
        )
      )
    ).toThrow(/control/);
  });
});

describe("rare unknowns and checkpoint boundaries", () => {
  it("keeps a rare unknown outcome decisive for abstention at over99% numeric support", () => {
    const p = model([
        ...Array.from({ length: 1000 }, (_, i) =>
          rollEvent({ id: `source-${i + 1}`, sourceIndex: i + 1 })
        ),
        rollEvent({
          id: "source-1001",
          sourceIndex: 1001,
          type: "unknown",
          sourceTag: "EventUnverifiedCriticalOutcome",
          payload: { Nested: { Dice: faces(6) } }
        })
      ]),
      r = LuckReportSchema.parse(analyzeReplayLuck(p));
    expect(r.coverage.rollCandidates.scoredRate).toBeGreaterThan(0.99);
    expect(r.verdict).toMatchObject({
      status: "partial_analysis",
      luckierTeam: "unknown"
    });
    expect(r.coverage.diceRecords.unresolvedCount).toBe(1);
  });
  it("retains incidental nested snapshot dice without promoting that wrapper to a playable checkpoint", () => {
    const p = parseReplayXml(
      envelope(
        `<ReplayStep><NotAnObservation><BoardState><Unknown>${unknownDice}</Unknown></BoardState></NotAnObservation></ReplayStep>`
      )
    );
    expect(p.boardCheckpoints).toHaveLength(0);
    const r = LuckReportSchema.parse(analyzeReplayLuck(p));
    expect(r.coverage.diceRecords.unresolvedCount).toBe(1);
    expect(r.diceRecords[0]!.locator?.xmlPath).toEqual([
      "Replay",
      "ReplayStep",
      "NotAnObservation",
      "BoardState",
      "Unknown"
    ]);
  });
});

describe("incomplete named emissions cannot reuse an older snapshot anchor", () => {
  it.each([
    "<EventWeatherRoll/>",
    `<EventWeatherRoll><Dice><Die><Value>4</Value></Die></Dice><Dice><Die><Value>5</Value></Die></Dice></EventWeatherRoll>`
  ])("invalidates the old anchor after %s", (incomplete) => {
    const r = analyzeNufflizerInput(
        envelope(
          `<ReplayStep>${weather()}${incomplete}<BoardState>${lastWeather()}</BoardState></ReplayStep>`
        )
      ),
      s = r.diceRecords.find((d) => d.parentKind === "snapshot")!;
    expect(s.disposition).toBe("unresolved");
    expect(s.aliasOf).toBeUndefined();
    expect(
      r.coverage.rollFamilies.find((f) => f.sourceTag === "BoardState")
        ?.unresolvedIdentityCount
    ).toBe(1);
  });
});
