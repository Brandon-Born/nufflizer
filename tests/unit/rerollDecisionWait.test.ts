import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { parseReplayXml } from "@/domain/replay/parseXml";
import type { ReplayEvent, ReplayModel } from "@/domain/replay/types";
import {
  applyCurrentOwnership,
  createOwnershipTimeline
} from "@/domain/replay/ownershipTimeline";
import { findRerollResources } from "@/domain/nufflizer/rerollResources";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { explainRerollResource } from "@/domain/nufflizer/presentation";

type Case = {
  file: string;
  question: number;
  choice: number;
  actor: string;
  turn: number;
};
const cases: Case[] = [
  { file: "demo6.bbr", question: 965, choice: 971, actor: "51", turn: 3 },
  { file: "demo7.bbr", question: 5442, choice: 5448, actor: "40", turn: 16 }
];
const cached = new Map<string, ReplayModel>();
const reports = new Map<string, ReturnType<typeof analyzeReplayLuck>>();
const evidence = JSON.parse(
  readFileSync("tests/fixtures/evidence/bb3-reroll-resources.json", "utf8")
);
beforeAll(() => {
  for (const c of cases) {
    const source = readFileSync(`demo-replays/${c.file}`),
      raw = evidence.files.find((f: { file: string }) => f.file === c.file);
    expect(createHash("sha256").update(source).digest("hex")).toBe(raw.sha256);
    const r = parseReplayXml(decodeReplayInput(source.toString()).xml, {
      omitRawReplaySteps: true
    });
    reports.set(
      c.file,
      analyzeReplayLuck({
        ...r,
        endDiceSnapshots: [],
        turns: r.turns.map((t) => ({
          ...t,
          events: t.events.filter((e) => e.sourceIndex! <= c.choice)
        })),
        boardCheckpoints: r.boardCheckpoints!.filter(
          (cp) => cp.afterSourceIndex < c.choice
        )
      })
    );
    const es = r.turns.flatMap((t) => t.events),
      q = es.find((e) => e.sourceIndex === c.question)!;
    const header = es.find(
      (e) => e.type === "step" && e.actionId === q.actionId
    )!;
    const selected = es.filter(
      (e) => e.sourceIndex! >= header.sourceIndex! && e.sourceIndex! <= c.choice
    );
    const before = r
      .boardCheckpoints!.filter(
        (cp) => cp.afterSourceIndex < header.sourceIndex!
      )
      .at(-1)!;
    cached.set(c.file, {
      ...r,
      raw: {},
      endDiceSnapshots: [],
      turns: [{ ...r.turns[0]!, events: selected, raw: {} }],
      boardCheckpoints: [
        before,
        ...r.boardCheckpoints!.filter(
          (cp) =>
            cp.afterSourceIndex >= header.sourceIndex! &&
            cp.afterSourceIndex < c.choice
        )
      ]
    });
    const d = raw.decisions.find(
      (d: { precedingQuestion: { locator: { replayStep: number } } }) =>
        d.precedingQuestion.locator.replayStep === q.locator!.replayStep
    );
    expect(
      d.interveningControls.map((x: { projection: unknown }) => x.projection)
    ).toEqual([
      { EventActiveGamerChanged: "" },
      { EventPauseActiveTimer: "" },
      {
        EventActiveTimerChanged: {
          NewTimer: [{ Duration: ["30"], Type: ["2"], Value: ["30"] }],
          IsPaused: ["1"]
        }
      }
    ]);
  }
}, 30000);
const prefix = (c: Case) => structuredClone(cached.get(c.file)!);
const sourceReport = (c: Case) => structuredClone(reports.get(c.file)!);
const events = (r: ReplayModel) => r.turns[0]!.events;
const tag = (r: ReplayModel, name: string) =>
  events(r).find((e) => e.sourceTag === name)!;
const ledger = (r: ReplayModel) => {
  const owners = createOwnershipTimeline(r);
  return findRerollResources(applyCurrentOwnership(r, owners), owners);
};

describe.each(cases)("recorded controller/timer menu in $file", (c) => {
  it("links the choice prefix without a replacement, known controller or eligibility claim", () => {
    const r = prefix(c),
      l = ledger(r),
      d = l.decisions[0]!;
    expect(l).toMatchObject({
      decisionCount: 1,
      recordedUsedCount: 1,
      linkedCount: 1,
      unresolvedCount: 0,
      byTeam: [
        { teamId: "0", used: 0, notUsed: 0 },
        { teamId: "1", used: 1, notUsed: 0 }
      ]
    });
    expect(d).toMatchObject({
      questionSourceId: `source-${c.question}`,
      decisionSourceId: `source-${c.choice}`,
      namespace: { actorPlayerId: c.actor, rosterIndex: 1 },
      clock: { teamTurn: c.turn },
      decisionWait: {
        activeGamerSourceId: `source-${c.question + 2}`,
        pauseSourceId: `source-${c.question + 3}`,
        timerSourceId: `source-${c.question + 4}`,
        resumedStepSourceId: `source-${c.question + 5}`,
        controller: null
      }
    });
    const report = sourceReport(c),
      v = LuckReportSchema.safeParse(report);
    expect(v.success, JSON.stringify(v.error?.issues)).toBe(true);
    const choice = report.events.find(
      (e) => e.metadata.sourceId === d.decisionSourceId
    )!;
    const explanation = explainRerollResource(
      choice,
      new Map(
        report.rerollResources.decisions.map((d) => [d.decisionEventId, d])
      ),
      new Map(report.events.map((e) => [e.metadata.sourceId!, e]))
    )!;
    expect(explanation).toContain("controller remains unknown");
    expect(explanation).toContain(`for ${choice.teamName}.`);
    expect(explanation).toContain(
      "This decision adds no random outcome or luck score"
    );
    expect(choice).toMatchObject({
      scoringStatus: "excluded",
      delta: 0,
      weightedDelta: 0,
      probabilitySuccess: null
    });
    for (const key of [
      "activeGamerSourceId",
      "pauseSourceId",
      "timerSourceId",
      "resumedStepSourceId"
    ] as const)
      expect(
        report.events.some((e) => e.metadata.sourceId === d.decisionWait![key])
      ).toBe(true);
    expect(report.verdict.luckierTeam).toBe("unknown");
  });
  it.each([1, 2, 3, 4, 5, 6])(
    "does not select the resource link using the original face %s",
    (face) => {
      const r = prefix(c),
        p = tag(r, "QuestionTeamRerollUsage").payload!.RollInfos as Record<
          string,
          unknown
        >;
      p.Dice = { Die: { DieType: 0, Value: face } };
      p.Outcome = Number(face >= Number(p.Difficulty));
      expect(ledger(r).linkedCount).toBe(1);
    }
  );
  const mutations: [string, (r: ReplayModel) => void][] = [
    [
      "unknown controller field",
      (r) => {
        tag(r, "EventActiveGamerChanged").payload!.NewActiveGamer = "1";
      }
    ],
    [
      "unknown pause field",
      (r) => {
        tag(r, "EventPauseActiveTimer").payload!.Unknown = "1";
      }
    ],
    [
      "unknown timer field",
      (r) => {
        tag(r, "EventActiveTimerChanged").payload!.Unknown = "1";
      }
    ],
    [
      "unpaused timer",
      (r) => {
        tag(r, "EventActiveTimerChanged").payload!.IsPaused = "0";
      }
    ],
    [
      "other timer type",
      (r) => {
        (
          tag(r, "EventActiveTimerChanged").payload!.NewTimer as Record<
            string,
            unknown
          >
        ).Type = "1";
      }
    ],
    [
      "unknown timer member",
      (r) => {
        (
          tag(r, "EventActiveTimerChanged").payload!.NewTimer as Record<
            string,
            unknown
          >
        ).Unknown = "1";
      }
    ],
    [
      "missing pause",
      (r) => {
        r.turns[0]!.events = events(r).filter(
          (e) => e.sourceTag !== "EventPauseActiveTimer"
        );
      }
    ],
    [
      "reordered controls",
      (r) => {
        const es = events(r),
          i = es.findIndex((e) => e.sourceTag === "EventPauseActiveTimer");
        [es[i], es[i + 1]] = [es[i + 1]!, es[i]!];
      }
    ],
    [
      "missing control index",
      (r) => {
        delete tag(r, "EventActiveTimerChanged").sourceIndex;
      }
    ],
    [
      "reused control index",
      (r) => {
        tag(r, "EventActiveTimerChanged").sourceIndex = tag(
          r,
          "EventPauseActiveTimer"
        ).sourceIndex;
      }
    ],
    [
      "missing control id",
      (r) => {
        delete tag(r, "EventActiveGamerChanged").id;
      }
    ],
    [
      "other outer frame",
      (r) => {
        tag(r, "EventPauseActiveTimer").locator!.replayStep!++;
      }
    ],
    [
      "other nested control",
      (r) => {
        tag(r, "EventPauseActiveTimer").locator!.stepIndex = 0;
      }
    ],
    [
      "non-first response",
      (r) => {
        tag(r, "ResultTeamRerollUsage").locator!.messageIndex = 1;
      }
    ],
    [
      "other choice gamer",
      (r) => {
        tag(r, "ResultTeamRerollUsage").payload!.GamerId = 0;
      }
    ],
    [
      "other choice actor",
      (r) => {
        tag(r, "ResultTeamRerollUsage").playerId = "1";
      }
    ],
    [
      "other resumed header",
      (r) => {
        events(r)
          .filter((e) => e.type === "step")
          .at(-1)!.payload!.Skill = 999;
      }
    ],
    [
      "missing header origin",
      (r) => {
        delete events(r)
          .filter((e) => e.type === "step")
          .at(-1)!.payload!.CellFrom;
      }
    ],
    [
      "off-pitch destination",
      (r) => {
        events(r)
          .filter((e) => e.type === "step")
          .at(-1)!.payload!.CellTo = { X: -1, Y: -1 };
      }
    ],
    [
      "unknown resumed field",
      (r) => {
        events(r)
          .filter((e) => e.type === "step")
          .at(-1)!.payload!.Unknown = 1;
      }
    ],
    [
      "inconsistent header actor",
      (r) => {
        events(r)
          .filter((e) => e.type === "step")
          .at(-1)!.payload!.PlayerId = 1;
      }
    ],
    [
      "unknown intervening event",
      (r) => {
        const es = events(r),
          i = es.findIndex((e) => e.sourceTag === "EventPauseActiveTimer");
        es.splice(i, 0, { ...es[i]!, sourceTag: "UnknownControl" });
      }
    ],
    [
      "extra snapshot after wait starts",
      (r) => {
        const cp = structuredClone(r.boardCheckpoints!.at(-1)!);
        cp.afterSourceIndex = c.question + 2;
        r.boardCheckpoints!.push(cp);
      }
    ],
    [
      "phase changed and restored",
      (r) => {
        const cp = structuredClone(r.boardCheckpoints!.at(-1)!),
          restore = structuredClone(cp);
        cp.board!.phaseCode = 6;
        cp.afterSourceIndex = c.question;
        restore.afterSourceIndex = c.question + 1;
        r.boardCheckpoints!.push(cp, restore);
      }
    ],
    [
      "invalid checkpoint",
      (r) => {
        r.boardCheckpoints!.at(-1)!.board = null;
      }
    ],
    [
      "unsupported version",
      (r) => {
        r.replayVersion = "future";
      }
    ]
  ];
  it.each(mutations)("keeps %s unresolved", (_name, mutate) => {
    const r = prefix(c);
    mutate(r);
    const l = ledger(r);
    expect(l).toMatchObject({
      decisionCount: 1,
      recordedUsedCount: 1,
      linkedCount: 0,
      unresolvedCount: 1
    });
    expect(l.decisions[0]).toMatchObject({
      teamId: null,
      decisionWait: null,
      clock: null,
      namespace: null
    });
  });
  it("rejects removing the wait uncertainty receipt", () => {
    const report = sourceReport(c);
    report.rerollResources.decisions.find(
      (d) => d.decisionSourceId === `source-${c.choice}`
    )!.decisionWait = null;
    expect(LuckReportSchema.safeParse(report).success).toBe(false);
  });
  it.each(["timerSourceId", "pauseSourceId", "resumedStepSourceId"] as const)(
    "rejects a forged %s receipt",
    (key) => {
      const report = sourceReport(c);
      expect(LuckReportSchema.safeParse(report).success).toBe(true);
      report.rerollResources.decisions.find(
        (d) => d.decisionSourceId === `source-${c.choice}`
      )!.decisionWait![key] = `source-${c.question}`;
      expect(LuckReportSchema.safeParse(report).success).toBe(false);
    }
  );
});
