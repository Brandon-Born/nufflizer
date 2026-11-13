import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { playbackFragment } from "../helpers/playback";
import { gatedDodgePolicy } from "../helpers/gatedDodgePolicy";
import { lonerDriveXml } from "../helpers/lonerDrive";
import {
  createOwnershipTimeline,
  applyCurrentOwnership
} from "@/domain/replay/ownershipTimeline";
import {
  findRerollResources,
  validReportedRerollResources
} from "@/domain/nufflizer/rerollResources";
import { explainRerollResource } from "@/domain/nufflizer/presentation";

type Projection = { [key: string]: (string | Projection)[] };
type Locator = {
  replayStep: number;
  childIndex: number;
  stepIndex: number;
  messageIndex: number;
};
type Row = {
  locator: Locator;
  step: Record<string, Projection>;
  payload: Record<string, Projection>;
};
const evidence = JSON.parse(
  readFileSync("tests/fixtures/evidence/bb3-reroll-resources.json", "utf8")
) as {
  files: {
    file: string;
    sha256: string;
    decisions: {
      choice: Row;
      precedingQuestion: Row;
      interveningTags: string[];
    }[];
  }[];
};
const key = (l: Partial<Locator> | undefined) =>
  JSON.stringify([l?.replayStep, l?.childIndex, l?.stepIndex, l?.messageIndex]);
const n = (p: Projection, k: string) =>
  p[k] === undefined ? null : Number(p[k]![0]);

describe("recorded reroll resource transactions", () => {
  it("independently inventories every choice, not only supported action policies", () => {
    const r = spawnSync(
      "python3",
      ["scripts/extract-reroll-resource-evidence.py", "--check"],
      { encoding: "utf8" }
    );
    expect(r.status, r.stderr).toBe(0);
    expect(evidence.files).toHaveLength(12);
    const all = evidence.files.flatMap((f) => f.decisions);
    expect(all).toHaveLength(173);
    expect(
      all.filter(
        (d) => n(d.choice.payload.ResultTeamRerollUsage!, "Used") === 1
      )
    ).toHaveLength(118);
    expect(
      all.filter((d) => d.precedingQuestion.payload.QuestionBlockDice)
    ).toHaveLength(49);
  });
  it.each(evidence.files)(
    "joins every raw decision and team total in $file",
    (f) => {
      const bytes = readFileSync(`demo-replays/${f.file}`);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(f.sha256);
      const replay = parseReplayXml(
        decodeReplayInput(bytes.toString("utf8")).xml,
        { omitRawReplaySteps: true }
      );
      const report = analyzeReplayLuck(replay);
      const validation = LuckReportSchema.safeParse(report);
      expect(
        validation.success,
        JSON.stringify(validation.error?.issues.slice(0, 3))
      ).toBe(true);
      const byLocator = new Map(
        report.events.map((e) => [key(e.metadata.locator), e])
      );
      const sources = new Map(
        report.events.map((e) => [e.metadata.sourceId!, e])
      );
      const ledger = report.rerollResources;
      expect(ledger.decisionCount).toBe(f.decisions.length);
      const unqualified = (raw: (typeof f.decisions)[number]) =>
        !!raw.choice.step.ThrowTeamMateStep;
      expect(ledger.unresolvedCount).toBe(
        f.decisions.filter(unqualified).length
      );
      const counts = new Map([
        ["0", { used: 0, notUsed: 0 }],
        ["1", { used: 0, notUsed: 0 }]
      ]);
      for (const raw of f.decisions) {
        const choice = byLocator.get(key(raw.choice.locator))!;
        const q = byLocator.get(key(raw.precedingQuestion.locator))!;
        const p = raw.choice.payload.ResultTeamRerollUsage!;
        const gamer = n(p, "GamerId")!,
          used = n(p, "Used") === 1;
        expect(choice.metadata.recordedRerollChoice).toEqual({
          gamerId: gamer,
          used,
          validFields: true
        });
        const d = ledger.decisions.find(
          (d) => d.decisionSourceId === choice.metadata.sourceId
        )!;
        expect(d).toMatchObject(
          unqualified(raw)
            ? {
                questionSourceId: q.metadata.sourceId,
                teamId: null,
                status: "unresolved",
                reason: "source_or_owner_conflict",
                clock: null
              }
            : {
                questionSourceId: q.metadata.sourceId,
                teamId: String(gamer),
                status: "linked",
                reason: "matching_offer"
              }
        );
        expect(
          sources.get(d.questionSourceId!)?.metadata.recordedRerollOffer
        ).toMatchObject({ gamerId: gamer });
        const total = counts.get(String(gamer))!;
        if (!unqualified(raw)) {
          if (used) total.used++;
          else total.notUsed++;
        }
        expect(choice).toMatchObject({
          scoringStatus: "excluded",
          delta: 0,
          weightedDelta: 0,
          probabilitySuccess: null
        });
      }
      for (const t of ledger.byTeam)
        expect(t).toEqual({ teamId: t.teamId, ...counts.get(t.teamId) });
      expect(report.verdict.luckierTeam).toBe("unknown");
    }
  );
  it("retains both UI087 choices: the second offer targets failed Pro, not Chainsaw", () => {
    const r = analyzeReplayLuck(playbackFragment("008", "UI-087", [11], [48]));
    const check = LuckReportSchema.safeParse(r);
    expect(check.success, JSON.stringify(check.error?.issues.slice(0, 4))).toBe(
      true
    );
    expect(r.rerollResources).toMatchObject({
      decisionCount: 2,
      linkedCount: 2,
      unresolvedCount: 0,
      byTeam: [
        { teamId: "0", used: 0, notUsed: 0 },
        { teamId: "1", used: 0, notUsed: 2 }
      ]
    });
    const sources = new Map(r.events.map((e) => [e.metadata.sourceId!, e]));
    const offers = r.rerollResources.decisions.map(
      (d) => sources.get(d.questionSourceId!)!.metadata.recordedRerollOffer
    );
    expect(offers).toEqual([
      {
        kind: "numeric",
        gamerId: 1,
        teamAvailable: true,
        proAvailable: true,
        rollType: 67
      },
      {
        kind: "numeric",
        gamerId: 1,
        teamAvailable: true,
        proAvailable: false,
        rollType: 15
      }
    ]);
  });
  it("does not spend twice when a raw decision is repeated without another offer", () => {
    const replay = gatedDodgePolicy();
    const es = replay.turns[0]!.events;
    const choice = es.find((e) => e.sourceTag === "ResultTeamRerollUsage")!;
    const duplicate = structuredClone(choice);
    duplicate.id = "source-duplicate-choice";
    duplicate.sourceIndex = 100;
    es.push(duplicate);
    const r = analyzeReplayLuck(replay);
    expect(r.rerollResources).toMatchObject({
      decisionCount: 2,
      linkedCount: 1,
      unresolvedCount: 1
    });
    expect(r.rerollResources.byTeam[0]).toEqual({
      teamId: "0",
      used: 1,
      notUsed: 0
    });
    expect(r.rerollResources.decisions[1]).toMatchObject({
      status: "unresolved",
      reason: "missing_offer",
      teamId: null
    });
  });
  it.each(["id", "sourceIndex"] as const)(
    "retains a choice with missing %s by its report event, without inventing a source",
    (field) => {
      const replay = gatedDodgePolicy();
      const choice = replay.turns[0]!.events.find(
        (e) => e.sourceTag === "ResultTeamRerollUsage"
      )!;
      delete choice[field];
      const r = analyzeReplayLuck(replay),
        v = LuckReportSchema.safeParse(r);
      expect(v.success, JSON.stringify(v.error?.issues)).toBe(true);
      expect(r.rerollResources).toMatchObject({
        decisionCount: 1,
        recordedUsedCount: 1,
        linkedCount: 0,
        unresolvedCount: 1,
        byTeam: [
          { teamId: "0", used: 0, notUsed: 0 },
          { teamId: "1", used: 0, notUsed: 0 }
        ]
      });
      const d = r.rerollResources.decisions[0]!,
        e = r.events.find((e) => e.id === d.decisionEventId)!;
      expect(d).toMatchObject({
        status: "unresolved",
        reason: "unindexed_source",
        teamId: null,
        namespace: null,
        clock: null
      });
      expect(e.metadata.recordedRerollChoice).toEqual({
        gamerId: 0,
        used: true,
        validFields: true
      });
      const first = r.events.find((e) => e.metadata.sourceId === "source-2")!;
      expect(first.scoringStatus).toBe("scored");
      expect(first.delta).toBeCloseTo(-2 / 3, 12);
      expect(
        r.events.some(
          (e) => e.metadata.lonerGate || e.metadata.teamDiceIdentity
        )
      ).toBe(false);
      if (field === "id") expect(d.decisionSourceId).toBeNull();
      else expect(d.sourceIndex).toBeNull();
    }
  );
  it.each([
    [
      "invalid Used",
      (r: ReturnType<typeof gatedDodgePolicy>) => {
        r.turns[0]!.events[3]!.payload!.Used = 2;
      }
    ],
    [
      "missing gamer",
      (r: ReturnType<typeof gatedDodgePolicy>) => {
        delete r.turns[0]!.events[3]!.payload!.GamerId;
      }
    ],
    [
      "unavailable team use",
      (r: ReturnType<typeof gatedDodgePolicy>) => {
        r.turns[0]!.events[1]!.payload!.CanUseTeamReroll = 0;
      }
    ],
    [
      "unknown Pro flag",
      (r: ReturnType<typeof gatedDodgePolicy>) => {
        delete r.turns[0]!.events[1]!.payload!.CanUseProReroll;
      }
    ],
    [
      "other gamer",
      (r: ReturnType<typeof gatedDodgePolicy>) => {
        r.turns[0]!.events[3]!.payload!.GamerId = 1;
      }
    ],
    [
      "other actor",
      (r: ReturnType<typeof gatedDodgePolicy>) => {
        r.turns[0]!.events[3]!.playerId = "11";
      }
    ],
    [
      "other target",
      (r: ReturnType<typeof gatedDodgePolicy>) => {
        r.turns[0]!.events[3]!.targetId = "11";
      }
    ],
    [
      "other step",
      (r: ReturnType<typeof gatedDodgePolicy>) => {
        r.turns[0]!.events[3]!.stepType = 6;
      }
    ],
    [
      "evaluation",
      (r: ReturnType<typeof gatedDodgePolicy>) => {
        r.turns[0]!.events[2]!.payload!.IsEvaluation = 1;
      }
    ],
    [
      "unknown choice field",
      (r: ReturnType<typeof gatedDodgePolicy>) => {
        r.turns[0]!.events[3]!.payload!.Unknown = 1;
      }
    ],
    [
      "unsupported version",
      (r: ReturnType<typeof gatedDodgePolicy>) => {
        r.replayVersion = "future";
      }
    ],
    [
      "unknown intervening control",
      (r: ReturnType<typeof gatedDodgePolicy>) => {
        const es = r.turns[0]!.events;
        es.splice(2, 0, {
          type: "unknown",
          sourceTag: "UnknownControl",
          id: "barrier",
          sourceIndex: 2
        });
      }
    ]
  ] as const)(
    "retains %s as unresolved without manufacturing a linked spend",
    (_name, mutate) => {
      const replay = gatedDodgePolicy();
      mutate(replay);
      const owners = createOwnershipTimeline(replay);
      const l = findRerollResources(
        applyCurrentOwnership(replay, owners),
        owners
      );
      expect(l).toMatchObject({
        decisionCount: 1,
        linkedCount: 0,
        unresolvedCount: 1,
        byTeam: [
          { teamId: "0", used: 0, notUsed: 0 },
          { teamId: "1", used: 0, notUsed: 0 }
        ]
      });
    }
  );
  it("qualifies the choice at its own prefix, independently of a later gate or replacement", () => {
    for (const face of [1, 2, 3, 4, 5, 6]) {
      const replay = gatedDodgePolicy(3, 1, face, face);
      replay.turns[0]!.events = replay.turns[0]!.events.slice(0, 4);
      const owners = createOwnershipTimeline(replay);
      expect(
        findRerollResources(applyCurrentOwnership(replay, owners), owners)
      ).toMatchObject({
        linkedCount: 1,
        byTeam: [
          { teamId: "0", used: 1, notUsed: 0 },
          { teamId: "1", used: 0, notUsed: 0 }
        ]
      });
    }
  });
  it("does not describe an unavailable unused team reroll as a decline", () => {
    const r = analyzeReplayLuck(gatedDodgePolicy(3, 1, 2, 6, true, "pro", 3));
    const sources = new Map(r.events.map((e) => [e.metadata.sourceId!, e]));
    const d = r.rerollResources.decisions[0]!;
    const line = explainRerollResource(
      sources.get(d.decisionSourceId!)!,
      new Map([[d.decisionEventId, d]]),
      sources
    )!;
    expect(line).toContain("team reroll unavailable, Pro available");
    expect(line).toContain("A team reroll was not used");
    expect(line).not.toMatch(/declined/);
  });
  it.each([
    [
      "missing choice",
      (r: ReturnType<typeof analyzeReplayLuck>) => {
        r.rerollResources.decisions = [];
        r.rerollResources.decisionCount = 0;
        r.rerollResources.linkedCount = 0;
        r.rerollResources.byTeam[0]!.used = 0;
      }
    ],
    [
      "duplicate choice",
      (r: ReturnType<typeof analyzeReplayLuck>) => {
        r.rerollResources.decisions.push(
          structuredClone(r.rerollResources.decisions[0]!)
        );
        r.rerollResources.decisionCount++;
        r.rerollResources.linkedCount++;
        r.rerollResources.byTeam[0]!.used++;
      }
    ],
    [
      "wrong total",
      (r: ReturnType<typeof analyzeReplayLuck>) => {
        r.rerollResources.byTeam[0]!.used++;
      }
    ],
    [
      "wrong namespace",
      (r: ReturnType<typeof analyzeReplayLuck>) => {
        r.rerollResources.byTeam.reverse();
      }
    ],
    [
      "wrong index",
      (r: ReturnType<typeof analyzeReplayLuck>) => {
        r.rerollResources.decisions[0]!.sourceIndex =
          r.rerollResources.decisions[0]!.sourceIndex! + 1;
      }
    ],
    [
      "wrong event reference",
      (r: ReturnType<typeof analyzeReplayLuck>) => {
        r.rerollResources.decisions[0]!.decisionEventId = "missing-event";
      }
    ],
    [
      "wrong question",
      (r: ReturnType<typeof analyzeReplayLuck>) => {
        r.rerollResources.decisions[0]!.questionSourceId = "source-6";
      }
    ],
    [
      "wrong owner",
      (r: ReturnType<typeof analyzeReplayLuck>) => {
        r.rerollResources.decisions[0]!.teamId = "1";
      }
    ],
    [
      "changed choice",
      (r: ReturnType<typeof analyzeReplayLuck>) => {
        r.events.find(
          (e) => e.metadata.recordedRerollChoice
        )!.metadata.recordedRerollChoice!.used = false;
      }
    ],
    [
      "changed team flag",
      (r: ReturnType<typeof analyzeReplayLuck>) => {
        r.events.find(
          (e) => e.metadata.recordedRerollOffer
        )!.metadata.recordedRerollOffer!.teamAvailable = false;
      }
    ],
    [
      "changed Pro flag",
      (r: ReturnType<typeof analyzeReplayLuck>) => {
        r.events.find(
          (e) => e.metadata.recordedRerollOffer
        )!.metadata.recordedRerollOffer!.proAvailable = true;
      }
    ],
    [
      "changed gamer",
      (r: ReturnType<typeof analyzeReplayLuck>) => {
        r.events.find(
          (e) => e.metadata.recordedRerollOffer
        )!.metadata.recordedRerollOffer!.gamerId = 1;
      }
    ],
    [
      "invalid fields",
      (r: ReturnType<typeof analyzeReplayLuck>) => {
        r.events.find(
          (e) => e.metadata.recordedRerollChoice
        )!.metadata.recordedRerollChoice!.validFields = false;
      }
    ],
    [
      "false unresolved",
      (r: ReturnType<typeof analyzeReplayLuck>) => {
        r.rerollResources.decisions[0]!.status = "unresolved";
      }
    ]
  ] as const)(
    "rejects public resource receipt forgery: %s",
    (_name, mutate) => {
      const r = analyzeReplayLuck(gatedDodgePolicy());
      expect(LuckReportSchema.safeParse(r).success).toBe(true);
      mutate(r);
      expect(LuckReportSchema.safeParse(r).success).toBe(false);
    }
  );
  it("rejects a counter claiming an after-snapshot that includes a later choice", () => {
    const bytes = readFileSync("demo-replays/demo1.bbr", "utf8");
    const r = analyzeReplayLuck(
      parseReplayXml(decodeReplayInput(bytes).xml, { omitRawReplaySteps: true })
    );
    const decisions = r.rerollResources.decisions,
      sources = new Map(r.events.map((e) => [e.metadata.sourceId!, e]));
    const i = decisions.findIndex(
      (d, i) =>
        !!sources.get(d.decisionSourceId!)?.metadata.teamRerollCounter?.after &&
        i < decisions.length - 1
    );
    expect(i).toBeGreaterThanOrEqual(0);
    const counter = sources.get(decisions[i]!.decisionSourceId!)!.metadata
      .teamRerollCounter!;
    counter.after!.checkpointAfter = decisions[i + 1]!.sourceIndex!;
    expect(
      validReportedRerollResources(
        r.rerollResources,
        r.events,
        r.teams.map((t) => t.teamId)
      )
    ).toBe(false);
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
  it.each([
    "slot_swap",
    "clock_restore",
    "invalid_checkpoint",
    "overlapping_actor"
  ])(
    "keeps %s out of resource ownership despite matching dice/flags",
    (kind) => {
      const replay = parseReplayXml(
        lonerDriveXml(
          "numeric_rush_spent",
          "tests/fixtures/evidence/bb3-reroll-counters.json"
        )
      );
      const initialOwners = createOwnershipTimeline(replay);
      const baseline = findRerollResources(
        applyCurrentOwnership(replay, initialOwners),
        initialOwners
      );
      expect(baseline.linkedCount).toBe(1);
      const d = baseline.decisions[0]!,
        es = replay.turns.flatMap((t) => t.events),
        q = es.find((e) => e.id === d.questionSourceId)!,
        c = es.find((e) => e.id === d.decisionSourceId)!;
      if (kind === "slot_swap")
        for (const cp of replay.boardCheckpoints!) {
          if (cp.board) {
            cp.board.teams.forEach((t) => {
              t.rosterIndex = 1 - t.rosterIndex;
            });
          }
        }
      else if (kind === "overlapping_actor")
        for (const cp of replay.boardCheckpoints!) {
          if (cp.board) {
            const owner = cp.board.teams.find((t) =>
              t.players.some((p) => String(p.id) === c.playerId)
            )!;
            const other = cp.board.teams.find((t) => t !== owner)!;
            other.players.push(
              structuredClone(
                owner.players.find((p) => String(p.id) === c.playerId)!
              )
            );
          }
        }
      else {
        const before = replay
          .boardCheckpoints!.filter(
            (cp) => cp.afterSourceIndex < q.sourceIndex!
          )
          .at(-1)!;
        const changed = structuredClone(before),
          restored = structuredClone(before);
        // Source indices have a waiting header/marker gap in this actual prefix.
        changed.afterSourceIndex = q.sourceIndex!;
        restored.afterSourceIndex = c.sourceIndex! - 1;
        if (kind === "clock_restore") changed.board!.periodCode = 2;
        else changed.board = null;
        replay.boardCheckpoints!.push(changed, restored);
        replay.boardCheckpoints!.sort(
          (a, b) => a.afterSourceIndex - b.afterSourceIndex
        );
      }
      const owners = createOwnershipTimeline(replay),
        ledger = findRerollResources(
          applyCurrentOwnership(replay, owners),
          owners
        );
      expect(ledger).toMatchObject({
        decisionCount: 1,
        linkedCount: 0,
        unresolvedCount: 1
      });
    }
  );
});

it.each(["demo1.bbr", "demo11.bbr", "demo6.bbr", "demo7.bbr"])(
  "[cli-worker] exports every %s resource choice independently of top moments",
  (file) => {
    const sample = evidence.files.find((f) => f.file === file)!;
    const run = (format: string) =>
      spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "src/cli/nufflizier.ts",
          "analyze",
          `demo-replays/${file}`,
          "--format",
          format
        ],
        { encoding: "utf8", timeout: 20000, maxBuffer: 4_000_000 }
      );
    const json = run("json");
    expect(json.status, json.stderr).toBe(0);
    const r = LuckReportSchema.parse(JSON.parse(json.stdout));
    expect(r.rerollResources.decisionCount).toBe(sample.decisions.length);
    expect(r.rerollResources.recordedUsedCount).toBe(
      sample.decisions.filter(
        (d) => n(d.choice.payload.ResultTeamRerollUsage!, "Used") === 1
      ).length
    );
    expect(r.rerollResources.unresolvedCount).toBe(
      file === "demo1.bbr" ? 1 : 0
    );
    if (["demo6.bbr", "demo7.bbr"].includes(file))
      expect(
        r.rerollResources.decisions.filter((d) => d.decisionWait)
      ).toHaveLength(1);
    const text = run("text");
    expect(text.status, text.stderr).toBe(0);
    expect(text.stdout).toContain(
      `Recorded team-reroll decisions: ${sample.decisions.length}`
    );
    for (const d of r.rerollResources.decisions)
      expect(text.stdout).toContain(`Source ${d.decisionSourceId}`);
    expect(text.stdout).toContain(
      "This decision adds no random outcome or luck score"
    );
    if (["demo6.bbr", "demo7.bbr"].includes(file))
      expect(text.stdout).toContain("controller remains unknown");
  },
  30000
);
