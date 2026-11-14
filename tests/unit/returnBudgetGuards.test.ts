import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { readActivationBudget } from "@/domain/replay/activationBudget";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { treatmentReturnXml } from "../helpers/treatmentReturn";
import { regenerationReturnXml } from "../helpers/regenerationReturn";
import type { ReplayEvent } from "@/domain/replay/types";

const kinds = { 3: "blitz", 4: "pass", 5: "handoff", 6: "foul" } as const;
const causes = [
  ["treatment", treatmentReturnXml],
  ["recovery", regenerationReturnXml]
] as const;
const parsed = () => parseReplayXml(treatmentReturnXml({ action: 4 }));
const pair = () => {
  const r = parsed(),
    events = r.turns.flatMap((t) => t.events);
  const use = events.find((e) => e.sourceTag === "ResultUseAction")!;
  return {
    use,
    step: events.find((e) => e.sourceIndex === use.sourceIndex! - 1)!,
    version: r.replayVersion
  };
};

describe("declared budgets require their own typed ordered source", () => {
  it("joins every raw declaration, including State2, without filtering by an executed action", () => {
    const facts = JSON.parse(
      readFileSync("tests/fixtures/evidence/bb3-action-budgets.json", "utf8")
    );
    const counts: Record<string, number> = {},
      states = new Set<number>();
    for (const f of facts.files) {
      const r = parseReplayXml(
        decodeReplayInput(readFileSync(`demo-replays/${f.file}`, "utf8")).xml,
        { omitRawReplaySteps: true }
      );
      const events = r.turns.flatMap((t) => t.events);
      const actual = events.filter(
        (e) =>
          e.sourceTag === "ResultUseAction" &&
          [3, 4, 5, 6].includes(Number(e.payload?.Action))
      );
      expect(actual).toHaveLength(f.budgetDeclarations.length);
      for (const raw of f.budgetDeclarations) {
        const use = actual.find(
          (e) => JSON.stringify(e.locator) === JSON.stringify(raw.locator)
        )!;
        expect(use, `${f.file} ${JSON.stringify(raw.locator)}`).toBeDefined();
        const step = events.find(
          (e) => e.sourceIndex === use.sourceIndex! - 1
        )!;
        const code = Number(raw.message.Action[0]) as keyof typeof kinds;
        const readCell = (c: { X: string[]; Y: string[] }) => ({
          x: Number(c.X[0]),
          y: Number(c.Y[0])
        });
        expect(readActivationBudget(use, step, r.replayVersion)).toEqual({
          actionCode: code,
          kind: kinds[code],
          headerState: Number(raw.step.State[0]),
          headerTargetId: Number(raw.step.TargetId[0]),
          headerCellFrom: readCell(raw.step.CellFrom[0]),
          headerCellTo: readCell(raw.step.CellTo[0])
        });
        counts[code] = (counts[code] ?? 0) + 1;
        states.add(Number(raw.step.State[0]));
      }
    }
    expect(counts).toEqual({ 3: 269, 4: 10, 5: 11, 6: 52 });
    expect([...states].sort()).toEqual([1, 2, 3]);
  });
  it.each([1, 2, 3])(
    "keeps State%s literal, without deriving odds from Probability100",
    (state) => {
      const { use, step, version } = pair();
      step.payload!.State = state;
      step.payload!.Probability = 100;
      expect(readActivationBudget(use, step, version)).toMatchObject({
        kind: "pass",
        headerState: state
      });
    }
  );
  const guards: [string, (e: ReplayEvent, h: ReplayEvent) => void][] = [
    [
      "unknown action",
      (e) => {
        e.payload!.Action = 7;
      }
    ],
    [
      "future action",
      (e) => {
        e.payload!.Action = 15;
      }
    ],
    [
      "unknown state",
      (_, h) => {
        h.payload!.State = 4;
      }
    ],
    [
      "missing state",
      (_, h) => {
        delete h.payload!.State;
      }
    ],
    [
      "nested dice",
      (e) => {
        e.payload!.Dice = { Die: { Value: 6 } };
      }
    ],
    [
      "unknown header field",
      (_, h) => {
        h.payload!.Unknown = 0;
      }
    ],
    [
      "evaluation",
      (_, h) => {
        h.payload!.IsEvaluation = 1;
      }
    ],
    [
      "skill action",
      (_, h) => {
        h.payload!.Skill = 44;
      }
    ],
    [
      "invalid probability",
      (_, h) => {
        h.payload!.Probability = 101;
      }
    ],
    [
      "invalid body team",
      (e) => {
        e.payload!.TeamId = 2;
      }
    ],
    [
      "invalid header team",
      (_, h) => {
        h.payload!.TeamId = -1;
      }
    ],
    [
      "missing actor",
      (_, h) => {
        delete h.payload!.PlayerId;
      }
    ],
    [
      "negative target",
      (_, h) => {
        h.payload!.TargetId = -2;
      }
    ],
    [
      "derived actor conflict",
      (e) => {
        e.stepActorId = "7";
      }
    ],
    [
      "header actor conflict",
      (_, h) => {
        h.playerId = "7";
      }
    ],
    [
      "derived target conflict",
      (e) => {
        e.stepTargetId = "7";
      }
    ],
    [
      "source ID conflict",
      (e) => {
        e.id = "source-999";
      }
    ],
    [
      "nonadjacent header",
      (_, h) => {
        h.sourceIndex!--;
      }
    ],
    [
      "wrong source tag",
      (e) => {
        e.sourceTag = "ResultRoll";
      }
    ],
    [
      "other sequence",
      (e) => {
        e.sequenceId = "other";
      }
    ],
    [
      "other action",
      (e) => {
        e.actionId = "other";
      }
    ],
    [
      "later step",
      (e) => {
        e.locator!.stepIndex = 1;
      }
    ],
    [
      "later message",
      (e) => {
        e.locator!.messageIndex = 1;
      }
    ],
    [
      "header message",
      (_, h) => {
        h.locator!.messageIndex = 0;
      }
    ],
    [
      "missing frame",
      (_, h) => {
        delete h.locator!.replayStep;
      }
    ],
    [
      "other child",
      (e) => {
        e.locator!.childIndex!++;
      }
    ],
    [
      "out of pitch",
      (_, h) => {
        h.payload!.CellTo = { X: 26, Y: 5 };
      }
    ],
    [
      "attribution conflict",
      (e) => {
        e.attributionConflict = true;
      }
    ]
  ];
  it.each(guards)("withholds %s", (_, mutate) => {
    const { use, step, version } = pair();
    mutate(use, step);
    expect(readActivationBudget(use, step, version)).toBeUndefined();
  });
  it("does not mutate the input or borrow a header from another version", () => {
    const { use, step, version } = pair(),
      before = structuredClone({ use, step });
    expect(readActivationBudget(use, undefined, version)).toBeUndefined();
    expect(readActivationBudget(use, step, "1-5-0-0")).toBeUndefined();
    expect(readActivationBudget(use, step, version)).toBeDefined();
    expect({ use, step }).toEqual(before);
  });
});

describe.each(causes)(
  "%s budget observations preserve return provenance",
  (cause, xml) => {
    const originKey =
      cause === "treatment" ? "treatmentReturn" : "regenerationReturn";
    const markerKey =
      cause === "treatment"
        ? "treatmentReturnActivation"
        : "recoveryReturnActivation";
    const report = () =>
      LuckReportSchema.parse(
        analyzeReplayLuck(parseReplayXml(xml({ action: 4 })))
      );
    it.each([
      "unavailable",
      "stunned",
      "wrong_cell",
      "duplicate_member",
      "foreign_owner",
      "missing_board"
    ])("withholds a declaration after current %s evidence", (field) => {
      const replay = parseReplayXml(xml({ action: 4 })),
        latest = replay.boardCheckpoints!.at(-1)!;
      const player = latest.board!.teams[0]!.players.find((p) => p.id === 42)!;
      if (field === "unavailable") player.canAct = false;
      if (field === "stunned") player.statusCode = 2;
      if (field === "wrong_cell") player.cell.x = 5;
      if (field === "duplicate_member")
        latest.board!.teams[1]!.players.push(structuredClone(player));
      if (field === "foreign_owner") latest.board!.teams[0]!.explicitTeamId = 1;
      if (field === "missing_board")
        latest.status = "unsupported_version";
      const r = LuckReportSchema.parse(analyzeReplayLuck(replay));
      expect(r.events.some((e) => e.metadata[markerKey])).toBe(false);
      const trace = r.events.find((e) => e.metadata[originKey])!.metadata[
        originKey
      ]!;
      expect(trace.status).toBe("observed");
      expect(trace).not.toHaveProperty("activation");
      expect(trace).toHaveProperty("stop");
    });
    it("commits the declaration at its prefix independently of a later roster and clock", () => {
      const prior = report(),
        replay = parseReplayXml(xml({ action: 4, future: "<EventMatchEnd/>" }));
      const later = structuredClone(replay.boardCheckpoints!.at(-1)!);
      later.afterSourceIndex = replay.turns
        .flatMap((t) => t.events)
        .at(-1)!.sourceIndex!;
      later.replayStep!++;
      later.childIndex = 0;
      later.board!.periodCode = 9;
      later.board!.teams[0]!.gameTurn = 99;
      later.board!.teams[0]!.players = [];
      replay.boardCheckpoints!.push(later);
      const after = LuckReportSchema.parse(analyzeReplayLuck(replay));
      expect(
        after.events.find((e) => e.metadata[originKey])!.metadata[originKey]
      ).toEqual(
        prior.events.find((e) => e.metadata[originKey])!.metadata[originKey]
      );
      expect(
        after.events.find((e) => e.metadata[markerKey])!.metadata[markerKey]
      ).toEqual(
        prior.events.find((e) => e.metadata[markerKey])!.metadata[markerKey]
      );
    });
    it("keeps distant header destinations and arbitrary targets as parameters, never movement", () => {
      const replay = parseReplayXml(xml({ action: 4 })),
        input = structuredClone(replay);
      const events = replay.turns.flatMap((t) => t.events),
        use = events.find((e) => e.sourceTag === "ResultUseAction")!,
        header = events.find((e) => e.sourceIndex === use.sourceIndex! - 1)!;
      header.payload!.CellTo = { X: 25, Y: 14 };
      header.payload!.TargetId = 999;
      for (const e of [header, use]) e.targetId = e.stepTargetId = "999";
      const r = LuckReportSchema.parse(analyzeReplayLuck(replay)),
        marker = r.events.find((e) => e.metadata[markerKey])!;
      expect(marker.metadata[markerKey]).toMatchObject({
        budget: { headerTargetId: 999, headerCellTo: { x: 25, y: 14 } },
        before: { cell: { x: 4, y: 5 } }
      });
      expect(marker.metadata.preRoll?.actorCell).toEqual({ x: 4, y: 5 });
      expect(marker.metadata.preRoll?.actorMovementRemaining).toBeUndefined();
      expect(marker.metadata.teamRerollMovement).toBeUndefined();
      expect(marker.contextualImpact).toBeUndefined();
      expect(marker.contextualBounds).toBeUndefined();
      expect(marker.weightedDelta).toBe(0);
      expect(marker.metadata.isRollCandidate).toBe(false);
      expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
      expect(input).not.toEqual(replay);
      const after = structuredClone(replay);
      analyzeReplayLuck(replay);
      expect(replay).toEqual(after);
    });
    it.each([
      "kind",
      "code",
      "missing_budget",
      "legacy_budget",
      "from",
      "target",
      "bounds",
      "state",
      "trace_mismatch",
      "new_roll",
      "probability",
      "weight",
      "owner",
      "source",
      "sequence",
      "before_clock",
      "setup_clock",
      "roster"
    ])("rejects public %s forgery", (field) => {
      const r = report(),
        origin = r.events.find((e) => e.metadata[originKey])!,
        trace = origin.metadata[originKey]!;
      if (trace.status !== "observed" || !trace.activation)
        throw new Error("Missing budget");
      const a = trace.activation,
        use = r.events.find((e) => e.metadata[markerKey])!,
        marker = use.metadata[markerKey]!;
      const both = [a, marker];
      if (field === "kind") for (const p of both) p.budget!.kind = "foul";
      if (field === "code") for (const p of both) p.budget!.actionCode = 3;
      if (field === "missing_budget") for (const p of both) delete p.budget;
      if (field === "legacy_budget") {
        use.metadata.actionCode = 1;
        for (const p of both) p.actionCode = 1;
      }
      if (field === "from")
        for (const p of both) p.budget!.headerCellFrom.x = 5;
      if (field === "target")
        for (const p of both) p.budget!.headerTargetId = 7;
      if (field === "bounds")
        for (const p of both) p.budget!.headerCellTo.y = 15;
      if (field === "state")
        for (const p of both) Object.assign(p.budget!, { headerState: 0 });
      if (field === "trace_mismatch") a.budget!.headerCellTo.x = 8;
      if (field === "new_roll") use.metadata.isRollCandidate = true;
      if (field === "probability") use.probabilitySuccess = 1;
      if (field === "weight") use.explainability.weight = 1;
      if (field === "owner") delete use.metadata.ownership;
      if (field === "source") for (const p of both) p.stepSourceIndex--;
      if (field === "sequence") delete use.metadata.sequenceId;
      if (field === "before_clock")
        for (const p of both) p.before.teamTurn = 99;
      if (field === "setup_clock") trace.setup.periodCode = 99;
      if (field === "roster") for (const p of both) p.before.rosterIndex = 1;
      expect(LuckReportSchema.safeParse(r).success, field).toBe(false);
    });
  }
);
