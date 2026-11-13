import { createHash } from "node:crypto";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { parseReplayXml } from "@/domain/replay/parseXml";
import type { ReplayModel } from "@/domain/replay/types";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { explainBlockResolution } from "@/domain/nufflizer/presentation";
import type { LuckReport, LuckEvent } from "@/domain/nufflizer/types";
import {
  blockBallCases,
  blockBallSourceXml,
  blockBallPlaybackXml
} from "../helpers/blockBallRelease";

const report = (xml = blockBallSourceXml()) => analyzeNufflizerInput(xml);
const linked = (r: LuckReport) =>
  r.events.find((e) => e.metadata.blockBallRelease)!;
const raw = (r: ReplayModel) => r.turns.flatMap((t) => t.events);
function context(r: ReplayModel) {
  const initial = analyzeReplayLuck(r),
    pool = linked(initial),
    release = pool.metadata.blockBallRelease!;
  return {
    pool,
    release,
    before: r.boardCheckpoints!.find(
      (c) => c.afterSourceIndex === release.beforeCheckpointAfter
    )!,
    after: r.boardCheckpoints!.find(
      (c) => c.afterSourceIndex === release.after?.checkpointAfter
    ),
    bounce: raw(r).find((e) => e.id === release.bounceSourceId)!,
    step: raw(r).find(
      (e) =>
        e.actionId ===
          raw(r).find((x) => x.id === release.bounceSourceId)!.actionId &&
        e.sourceTag === "BallStep"
    )!
  };
}
function explain(r: LuckReport) {
  return explainBlockResolution(
    linked(r),
    r.teams,
    new Map(r.events.map((e) => [e.metadata.sourceId!, e]))
  )!;
}
const corpora = new Map<string, LuckReport>();
function source(file: string) {
  if (!corpora.has(file))
    corpora.set(file, report(readFileSync(`demo-replays/${file}`, "utf8")));
  return corpora.get(file)!;
}
const cell = (p: Record<string, unknown>) => ({
  x: Number((p.X as string[])[0]),
  y: Number((p.Y as string[])[0])
});

describe("first observed block carrier bounce", () => {
  it("[cli-worker] transports the first bounce without a fabricated possession verdict", () => {
    const dir = mkdtempSync(join(tmpdir(), "block-ball-cli-"));
    try {
      const path = join(dir, "paired-projection.xml");
      writeFileSync(path, blockBallPlaybackXml());
      const child = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "src/cli/nufflizier.ts",
          "analyze",
          path,
          "--format",
          "text"
        ],
        { encoding: "utf8", timeout: 20000 }
      );
      expect(child.status, child.stderr).toBe(0);
      expect(child.stdout).toContain("first recorded bounce travels to [4,9]");
      expect(child.stdout).toContain(
        "omitted holder flags do not establish a loose ball"
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("reproduces raw source facts independently of the analyzer", () => {
    const p = spawnSync(
      "python3",
      ["scripts/extract-block-ball-evidence.py", "--check"],
      { encoding: "utf8" }
    );
    expect(p.status, p.stderr).toBe(0);
  });
  it.each(blockBallCases)(
    "joins $id to the original replay and a sequence-preserving physical projection",
    (c) => {
      expect(
        createHash("sha256")
          .update(readFileSync(`demo-replays/${c.sourceFile}`))
          .digest("hex")
      ).toBe(c.sha256);
      for (const r of [
        source(c.sourceFile),
        report(blockBallSourceXml(c.id))
      ]) {
        const pool = r.events.find(
          (e) =>
            e.metadata.blockBallRelease &&
            e.metadata.blockBallRelease.holderId === c.holderId &&
            e.metadata.blockBallRelease.from.x === cell(c.fromCell).x &&
            e.metadata.blockBallRelease.from.y === cell(c.fromCell).y
        )!;
        expect(pool, c.id).toBeDefined();
        const b = pool.metadata.blockBallRelease!,
          bounce = r.events.find(
            (e) => e.metadata.sourceId === b.bounceSourceId
          )!;
        expect(b).toMatchObject({
          holderId: c.holderId,
          from: cell(c.fromCell),
          to: cell(c.toCell)
        });
        expect(bounce.metadata.ballTravel).toEqual({
          from: cell(c.fromCell),
          to: cell(c.toCell)
        });
        expect(bounce.scoringStatus).toBe("excluded");
        expect(bounce.probabilitySuccess).toBeNull();
        expect(bounce.weightedDelta).toBe(0);
        expect(pool.metadata.blockResolution).toBeDefined();
        expect(
          explainBlockResolution(
            pool,
            r.teams,
            new Map(r.events.map((e) => [e.metadata.sourceId!, e]))
          )
        ).toContain("first recorded bounce");
        expect(r.verdict.luckierTeam).toBe("unknown");
        if (r === source(c.sourceFile))
          expect(bounce.metadata.locator).toMatchObject({
            replayStep: c.originalReplayStep,
            stepIndex: c.bounceStepIndex,
            messageIndex: 0
          });
      }
    }
  );
  it("retains the paired UI-096 replacement pool and each victim while leaving the later snapshot unjoined", () => {
    const r = report(blockBallPlaybackXml()),
      pool = linked(r),
      b = pool.metadata.blockBallRelease!;
    expect(b).toMatchObject({
      holderId: "5",
      holderTeamId: "0",
      from: { x: 4, y: 10 },
      to: { x: 4, y: 9 }
    });
    expect(b.after).toBeUndefined();
    expect(pool.metadata.block?.pool.faces).toEqual([1]);
    expect(pool.metadata.blockResolution!.outcome).toBe("both_down");
    expect(
      r.damageSteps
        .filter((s) =>
          pool.metadata.blockResolution!.damageActionIds.includes(s.actionId)
        )
        .map((s) => [s.playerId, s.teamId])
    ).toEqual([
      ["48", "1"],
      ["5", "0"]
    ]);
    expect(explain(r)).toContain(
      "omitted holder flags do not establish a loose ball"
    );
    const parsed = parseReplayXml(blockBallPlaybackXml());
    expect(parsed.boardCheckpoints!.at(-1)!.board!.ball).toMatchObject({
      cell: { x: 4, y: 9 },
      isHeld: null,
      carrierId: null,
      possession: "unknown"
    });
    expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
  });
  it("a synthetic Wrestle variant releases the held ball without inventing armor", () => {
    const r = report(blockBallPlaybackXml(true)),
      p = linked(r);
    expect(p.metadata.blockResolution).toMatchObject({
      outcome: "wrestled_prone",
      damageActionIds: []
    });
    expect(p.metadata.blockBallRelease?.holderId).toBe("5");
    expect(r.damageSteps).toHaveLength(0);
    expect(explain(r)).toContain(
      "Wrestle does not add a knockdown armor check"
    );
  });
  it("preserves null holder flags in an immediate snapshot instead of carrying the old carrier", () => {
    const r = report(),
      b = linked(r).metadata.blockBallRelease!;
    expect(b.after).toMatchObject({
      cell: { x: 14, y: 2 },
      carrierId: null,
      isHeld: null
    });
    expect(explain(r)).toContain("Later possession is unconfirmed");
    const replay = parseReplayXml(blockBallSourceXml()),
      c = context(replay);
    c.after!.board!.ball.isHeld = false;
    c.after!.board!.ball.possession = "not_held";
    const explicit = LuckReportSchema.parse(analyzeReplayLuck(replay));
    expect(linked(explicit).metadata.blockBallRelease?.after?.isHeld).toBe(
      false
    );
    expect(explain(explicit)).toContain(
      "explicitly records the ball as not held"
    );
  });
  it("does not join later catches, bounces or controller/timer transitions as immediate state", () => {
    const r = report(blockBallSourceXml("demo-goblins1-490")),
      p = linked(r),
      b = p.metadata.blockBallRelease!;
    expect(b.after).toBeUndefined();
    expect(
      r.events.filter(
        (e) =>
          e.metadata.rollType === 25 &&
          (e.metadata.sourceIndex ?? 0) >
            (r.events.find((e) => e.metadata.sourceId === b.bounceSourceId)!
              .metadata.sourceIndex ?? 0)
      ).length
    ).toBeGreaterThan(0);
    const switched=parseReplayXml(blockBallSourceXml("demo3-381"));
    expect(raw(switched).some(e=>e.sourceTag === "EventActiveGamerChanged")).toBe(true);
    const withTimers=LuckReportSchema.parse(analyzeReplayLuck(switched));
    expect(linked(withTimers).metadata.blockBallRelease!.after).toBeUndefined();
  });

  const mutations: [
    string,
    (r: ReplayModel, c: ReturnType<typeof context>) => void
  ][] = [
    [
      "unknown held flag",
      (_, c) => {
        c.before.board!.ball.isHeld = null;
      }
    ],
    [
      "explicit not held",
      (_, c) => {
        c.before.board!.ball.isHeld = false;
      }
    ],
    [
      "unknown carrier",
      (_, c) => {
        c.before.board!.ball.carrierId = null;
      }
    ],
    [
      "unaffected carrier",
      (_, c) => {
        c.before.board!.ball.carrierId = Number(
          c.pool.metadata.block!.attackerId
        );
      }
    ],
    [
      "missing ball axis",
      (_, c) => {
        c.before.board!.ball.cell.x = null;
      }
    ],
    [
      "missing carrier square",
      (_, c) => {
        c.before
          .board!.teams.flatMap((t) => t.players)
          .find((p) => String(p.id) === c.release.holderId)!.cell.y = null;
      }
    ],
    [
      "unowned rosters",
      (_, c) => {
        c.before.board!.teams.forEach((t) => {
          t.explicitTeamId = null;
        });
      }
    ],
    [
      "duplicate holder",
      (_, c) => {
        const b = c.before.board!;
        const owner = b.teams.find((t) =>
          t.players.some((p) => String(p.id) === c.release.holderId)
        )!;
        b.teams
          .find((t) => t !== owner)!
          .players.push(
            structuredClone(
              owner.players.find((p) => String(p.id) === c.release.holderId)!
            )
          );
      }
    ],
    [
      "unknown phase",
      (_, c) => {
        c.before.board!.phaseCode = null;
      }
    ],
    [
      "conflicted board",
      (_, c) => {
        c.before.board!.issues.push("synthetic conflict");
      }
    ],
    [
      "unsupported version",
      (r) => {
        r.replayVersion = "unsupported";
      }
    ],
    [
      "evaluated ball",
      (_, c) => {
        c.step.payload!.IsEvaluation = 1;
      }
    ],
    [
      "different ball",
      (_, c) => {
        c.step.payload!.BallId = 1;
      }
    ],
    [
      "unknown ball state",
      (_, c) => {
        c.step.payload!.State = 2;
      }
    ],
    [
      "different sequence",
      (_, c) => {
        c.step.sequenceId = "different";
      }
    ],
    [
      "nonadjacent step",
      (_, c) => {
        c.step.locator!.stepIndex!++;
      }
    ],
    [
      "nonadjacent source",
      (_, c) => {
        c.step.sourceIndex!++;
      }
    ],
    [
      "wrong departure",
      (_, c) => {
        (c.step.payload!.CellFrom as { X: number }).X++;
      }
    ],
    [
      "wrong arrival",
      (_, c) => {
        (c.step.payload!.CellTo as { X: number }).X++;
      }
    ],
    [
      "applied modifiers",
      (_, c) => {
        c.bounce.payload!.Modifiers = { Modifier: { Skill: 1 } };
      }
    ],
    [
      "unknown roll fields",
      (_, c) => {
        c.bounce.payload!.Unknown = 1;
      }
    ],
    [
      "unknown step fields",
      (_, c) => {
        c.step.payload!.Unknown = 1;
      }
    ],
    [
      "replacement bounce",
      (_, c) => {
        c.bounce.payload!.NewRoll = 1;
      }
    ],
    [
      "wrong bounce status",
      (_, c) => {
        c.bounce.payload!.Status = 2;
      }
    ],
    [
      "different roll",
      (_, c) => {
        c.bounce.rollType = 24;
      }
    ],
    [
      "wrong outcome",
      (_, c) => {
        c.bounce.payload!.Outcome = 1;
      }
    ],
    [
      "different die",
      (_, c) => {
        (c.bounce.payload!.Dice as { Die: { DieType: number } }).Die.DieType =
          0;
      }
    ],
    [
      "unknown die policy",
      (_, c) => {
        (
          c.bounce.payload!.Dice as { Die: Record<string, unknown> }
        ).Die.Effect = 1;
      }
    ],
    [
      "conflicting after holder",
      (_, c) => {
        c.after!.board!.ball.isHeld = true;
      }
    ],
    [
      "conflicting after cell",
      (_, c) => {
        c.after!.board!.ball.cell.x = (c.after!.board!.ball.cell.x ?? 0) + 1;
      }
    ]
  ];
  it.each(mutations)("withholds a release for %s", (_, mutate) => {
    const r = parseReplayXml(blockBallSourceXml()),
      c = context(r);
    mutate(r, c);
    expect(
      analyzeReplayLuck(r).events.some((e) => e.metadata.blockBallRelease)
    ).toBe(false);
  });

  const forgeries: [string, (p: LuckEvent, r: LuckReport) => void][] = [
    [
      "different holder",
      (p) => {
        p.metadata.blockBallRelease!.holderId = p.metadata.block!.attackerId;
      }
    ],
    [
      "different owner",
      (p) => {
        p.metadata.blockBallRelease!.holderTeamId = p.teamId;
      }
    ],
    [
      "late checkpoint",
      (p) => {
        p.metadata.blockBallRelease!.beforeCheckpointAfter = 99999;
      }
    ],
    [
      "other source",
      (p) => {
        p.metadata.blockBallRelease!.bounceSourceId = p.metadata.sourceId!;
      }
    ],
    [
      "different cell",
      (p) => {
        p.metadata.blockBallRelease!.from.x++;
      }
    ],
    [
      "different travel",
      (p, r) => {
        r.events.find(
          (e) =>
            e.metadata.sourceId === p.metadata.blockBallRelease!.bounceSourceId
        )!.metadata.ballTravel!.to.y++;
      }
    ],
    [
      "missing travel",
      (p, r) => {
        delete r.events.find(
          (e) =>
            e.metadata.sourceId === p.metadata.blockBallRelease!.bounceSourceId
        )!.metadata.ballTravel;
      }
    ],
    [
      "held after",
      (p) => {
        p.metadata.blockBallRelease!.after!.isHeld = true;
      }
    ],
    [
      "filled old carrier",
      (p) => {
        p.metadata.blockBallRelease!.after!.carrierId = Number(
          p.metadata.blockBallRelease!.holderId
        );
      }
    ],
    [
      "late after",
      (p) => {
        p.metadata.blockBallRelease!.after!.checkpointAfter += 3;
      }
    ],
    [
      "missing resolution",
      (p) => {
        delete p.metadata.blockResolution;
      }
    ],
    [
      "reordered bounce",
      (p, r) => {
        r.events.find(
          (e) =>
            e.metadata.sourceId === p.metadata.blockBallRelease!.bounceSourceId
        )!.metadata.locator!.stepIndex!++;
      }
    ]
  ];
  it.each(forgeries)("rejects public JSON forgery: %s", (_, mutate) => {
    const r = structuredClone(report()),
      p = linked(r);
    mutate(p, r);
    r.keyMoments = r.keyMoments.map((m) =>
      structuredClone(r.events.find((e) => e.id === m.id)!)
    );
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
});
