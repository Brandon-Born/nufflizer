import { playbackFragment } from "../helpers/playback";
import { observeBoardCheckpoint } from "@/domain/replay/boardState";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  enumeratePushSuccessors,
  ordinaryPushDirections,
  pushPositionChanges,
  type PushPlayer
} from "@/domain/nufflizer/pushSuccessors";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { explainBlockPush } from "@/domain/nufflizer/presentation";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import type { LuckEvent, LuckReport } from "@/domain/nufflizer/types";
const p = (id: string, x: number, y: number, teamId = "1"): PushPlayer => ({
  id,
  teamId,
  cell: { x, y },
  ordinaryPolicy: true
});
const problem = (others: PushPlayer[] = []) => ({
  attackerId: "a",
  defenderId: "d",
  players: [p("a", 5, 7, "0"), p("d", 6, 7), ...others]
});
const points = (cs: { x: number; y: number }[]) =>
  cs.map((c) => [c.x, c.y]).sort();
const required = (s: ReturnType<typeof enumeratePushSuccessors>) => {
  expect(s.status).toBe("supported");
  if (s.status !== "supported") throw new Error(s.reason);
  return s;
};

describe("ordinary push position successors, not probabilities of coach choices", () => {
  it.each([
    [
      1,
      0,
      [
        [7, 6],
        [7, 7],
        [7, 8]
      ]
    ],
    [
      1,
      1,
      [
        [7, 8],
        [7, 9],
        [6, 9]
      ]
    ],
    [
      0,
      1,
      [
        [4, 9],
        [5, 9],
        [6, 9]
      ]
    ],
    [
      -1,
      1,
      [
        [3, 8],
        [3, 9],
        [4, 9]
      ]
    ],
    [
      -1,
      0,
      [
        [3, 6],
        [3, 7],
        [3, 8]
      ]
    ],
    [
      -1,
      -1,
      [
        [3, 5],
        [3, 6],
        [4, 5]
      ]
    ],
    [
      0,
      -1,
      [
        [4, 5],
        [5, 5],
        [6, 5]
      ]
    ],
    [
      1,
      -1,
      [
        [6, 5],
        [7, 5],
        [7, 6]
      ]
    ]
  ] as const)(
    "enumerates the three template squares for direction [%s,%s]",
    (dx, dy, expected) => {
      // Subject is one step from [5,7]; the independent table follows the
      // orthogonal/diagonal diagrams on printed rulebook58.
      const actual = points(
        ordinaryPushDirections({ x: 5, y: 7 }, { x: 5 + dx, y: 7 + dy })
      );
      expect(actual).toEqual([...expected].map((x) => [...x]).sort());
    }
  );
  it("an empty square takes precedence over an occupied chain-push square", () => {
    const s = required(enumeratePushSuccessors(problem([p("blocker", 7, 7)])));
    expect(points(s.destinations)).toEqual([
      [7, 6],
      [7, 8]
    ]);
    expect(s.branches).toHaveLength(4);
    expect(s.branches.every((b) => b.moves.length === 1)).toBe(true);
  });
  it("an empty on-pitch square takes precedence over the crowd", () => {
    const q = {
      attackerId: "a",
      defenderId: "d",
      players: [p("a", 1, 6, "0"), p("d", 0, 7)]
    };
    const s = required(enumeratePushSuccessors(q));
    expect(points(s.destinations)).toEqual([[0, 8]]);
  });
  it("crowd takes precedence over a chain-push when no empty pitch square exists", () => {
    const q = {
      attackerId: "a",
      defenderId: "d",
      players: [p("a", 1, 6, "0"), p("d", 0, 7), p("edge", 0, 8)]
    };
    const s = required(enumeratePushSuccessors(q));
    expect(points(s.destinations)).toEqual([
      [-1, 7],
      [-1, 8]
    ]);
    expect(
      s.branches.every(
        (b) => b.moves.length === 1 && b.moves[0].destination === "crowd"
      )
    ).toBe(true);
  });
  it("represents corner exits as removals without assigning1/3 chance to the entries", () => {
    const q = {
        attackerId: "a",
        defenderId: "d",
        players: [p("a", 1, 1, "0"), p("d", 0, 0)]
      },
      s = required(enumeratePushSuccessors(q));
    expect(points(s.destinations)).toEqual([
      [-1, -1],
      [-1, 0],
      [0, -1]
    ]);
    expect(s.branches).toHaveLength(6);
    for (const b of s.branches) {
      expect(pushPositionChanges(q, b)[0].cell).toBeNull();
      expect(b).not.toHaveProperty("probability");
    }
  });
  it("enumerates all nine ordinary chain paths and optional follow-up without mutating the board", () => {
    const q = problem([p("b", 7, 6), p("c", 7, 7, "0"), p("e", 7, 8)]),
      before = JSON.stringify(q),
      s = required(enumeratePushSuccessors(q));
    expect(s.branches).toHaveLength(18);
    expect(s.branches.every((b) => b.moves.length === 2)).toBe(true);
    const center = s.branches.filter((b) => b.moves[1].playerId === "c");
    expect(
      points(center.filter((b) => !b.follow).map((b) => b.moves[1].to))
    ).toEqual([
      [8, 6],
      [8, 7],
      [8, 8]
    ]);
    for (const b of s.branches) {
      const changes = pushPositionChanges(q, b);
      expect(changes).toHaveLength(b.follow ? 3 : 2);
      if (b.follow)
        expect(changes.at(-1)).toEqual({
          playerId: "a",
          teamId: "0",
          cell: { x: 6, y: 7 }
        });
    }
    expect(JSON.stringify(q)).toBe(before);
  });
  it("unknown policy in any legal chain branch withholds the whole alternative set", () => {
    const q = problem([
      p("b", 7, 6),
      { ...p("c", 7, 7), ordinaryPolicy: false },
      p("e", 7, 8)
    ]);
    expect(enumeratePushSuccessors(q)).toEqual({
      status: "unsupported",
      reason: "unknown_push_policy"
    });
  });
  it("cyclic chains involving the blocker remain explicit unknowns", () => {
    const cells = [
      [7, 4],
      [7, 5],
      [7, 6],
      [7, 3],
      [8, 3],
      [8, 4],
      [6, 2],
      [7, 2],
      [8, 2],
      [5, 2],
      [5, 1],
      [6, 1],
      [4, 1],
      [4, 2],
      [4, 3],
      [3, 3],
      [3, 4],
      [4, 4],
      [3, 5],
      [4, 5]
    ];
    const q = {
      attackerId: "a",
      defenderId: "d",
      players: [
        p("a", 5, 5, "0"),
        p("d", 6, 5),
        ...cells.map(([x, y], i) => p(`p${i}`, x, y))
      ]
    };
    expect(enumeratePushSuccessors(q)).toEqual({
      status: "unsupported",
      reason: "cyclic_chain"
    });
  });
  it("bounds a dense combinatorial board without returning a truncated legal set", () => {
    const others: PushPlayer[] = [];
    for (let x = 2; x <= 9; x++)
      for (let y = 3; y <= 9; y++)
        if (x !== 2 || y !== 6) others.push(p(`${x}-${y}`, x, y));
    const q = {
      attackerId: "a",
      defenderId: "d",
      players: [p("a", 1, 6, "0"), p("d", 2, 6), ...others]
    };
    expect(enumeratePushSuccessors(q)).toEqual({
      status: "unsupported",
      reason: "branch_limit"
    });
  });
  it.each(["overlap", "id", "distance", "team", "off_pitch"])(
    "rejects invalid positional input: %s",
    (kind) => {
      const q = problem();
      if (kind === "overlap") q.players.push(p("x", 6, 7));
      if (kind === "id") q.players.push(p("d", 7, 8));
      if (kind === "distance") q.players[1].cell.x = 9;
      if (kind === "team") q.players[1].teamId = "0";
      if (kind === "off_pitch") q.players[1].cell.y = 15;
      expect(enumeratePushSuccessors(q)).toEqual({
        status: "unsupported",
        reason: "invalid_board"
      });
    }
  );
});

type Locator = {
  replayStep: number | null;
  childIndex: number | null;
  stepIndex?: number;
  messageIndex?: number;
};
type RawFrame = {
  locator: Locator;
  useSmallPitch: number | null;
  endZones: { bottomLeft: (number | null)[]; topRight: (number | null)[] }[];
  teams: {
    teamId: number | null;
    players: {
      id: string;
      cell: (number | null)[] | null;
      tackleZone: number | null;
      status: number | null;
      data: {
        id: number;
        teamId: number | null;
        playerTypeId: number;
        innate: number[] | null;
        acquired: number[] | null;
      } | null;
    }[];
  }[];
};
type RawCase = {
  locator: Locator;
  checkpoint: Locator;
  offered: number[][];
  reference: {
    directions: number[][];
    destinations: number[][];
    kind: string;
  } | null;
  question: Record<string, unknown>;
};
const artifact = JSON.parse(
  readFileSync("tests/fixtures/evidence/bb3-push-decisions.json", "utf8")
) as {
  files: {
    file: string;
    sha256: string;
    frames: RawFrame[];
    cases: RawCase[];
  }[];
};
const key = (v: Locator) =>
  JSON.stringify([
    v.replayStep,
    v.childIndex,
    v.stepIndex ?? null,
    v.messageIndex ?? null
  ]);
function replay(file = "demo5.bbr") {
  return parseReplayXml(
    decodeReplayInput(readFileSync(`demo-replays/${file}`, "utf8")).xml,
    { omitRawReplaySteps: true }
  );
}
function checked(r: ReturnType<typeof replay>) {
  return LuckReportSchema.parse(analyzeReplayLuck(r));
}
let demo: LuckReport | undefined;
function sourceReport() {
  return (demo ??= checked(replay()));
}
const modeled = (r: LuckReport) =>
  r.events.filter((e) => e.metadata.blockPush?.status === "modeled");

describe("source-specific pitch configuration corroboration", () => {
  it.each(["partial", "contradiction", "small", "malformed", "omitted"])(
    "retains raw unknown coordinates and handles %s configuration",
    (kind) => {
      const raw: { [key: string]: unknown } = {
        ListTeams: { TeamState: [{}, {}] },
        PitchZones: {
          PitchZone: [
            { ZoneType: 1, BottomLeft: "", TopRight: { Y: 14 } },
            { ZoneType: 1, BottomLeft: { X: 25 }, TopRight: { X: 25, Y: 14 } }
          ]
        }
      };
      if (kind === "contradiction")
        (
          raw.PitchZones as { PitchZone: { BottomLeft: unknown }[] }
        ).PitchZone[0].BottomLeft = { X: 1 };
      if (kind === "malformed")
        (
          raw.PitchZones as { PitchZone: { BottomLeft: unknown }[] }
        ).PitchZone[0].BottomLeft = { X: "unknown" };
      if (kind === "small") raw.UseSmallPitch = 1;
      if (kind === "omitted") delete raw.PitchZones;
      const before = JSON.stringify(raw),
        b = observeBoardCheckpoint(raw, "1-4-0-0", {
          kind: "board",
          afterSourceIndex: 1,
          replayStep: 1,
          childIndex: 0
        }).board!;
      expect(b.pitchLayout).toBe(kind === "small" ? "small" : null);
      expect(b.standardPitchCompatible).toBe(
        kind === "partial" || kind === "omitted"
      );
      expect(b.pitchLayoutObserved).toBe(kind !== "omitted");
      expect(JSON.stringify(raw)).toBe(before);
    }
  );
});

describe("source-qualified ordinary push decision model", () => {
  it("reproduces every raw menu and independent root reference without application imports", () => {
    const r = spawnSync(
      "python3",
      ["scripts/extract-push-evidence.py", "--check"],
      { encoding: "utf8" }
    );
    expect(r.status, r.stderr).toBe(0);
  });
  it.each(artifact.files)(
    "joins $file's modeled alternatives, trait seeds and recorded non-random menus",
    (f) => {
      expect(
        createHash("sha256")
          .update(readFileSync(`demo-replays/${f.file}`))
          .digest("hex")
      ).toBe(f.sha256);
      const input = replay(f.file),
        r = checked(input),
        sources = new Map(r.events.map((e) => [e.metadata.sourceId, e]));
      const retained = r.events.filter(
        (e) => e.metadata.sourceTag === "QuestionPushBack"
      );
      expect(retained).toHaveLength(f.cases.length);
      expect(
        retained.every(
          (e) =>
            e.scoringStatus === "excluded" &&
            !e.metadata.isRollCandidate &&
            e.weightedDelta === 0
        )
      ).toBe(true);
      for (const e of modeled(r)) {
        const m = e.metadata.blockPush!;
        if (m.status !== "modeled") throw new Error("missing model");
        const q = sources.get(m.questionSourceId)!;
        const raw = f.cases.find(
          (c) => key(c.locator) === key(q.metadata.locator as Locator)
        )!;
        expect(raw).toBeDefined();
        expect(raw.reference).not.toBeNull();
        expect(points(m.destinations)).toEqual(raw.reference!.destinations);
        expect(points(m.destinations)).toEqual([...raw.offered].sort());
        const cp = input.boardCheckpoints!.find(
            (cp) => cp.afterSourceIndex === m.checkpointAfter
          )!,
          frame = f.frames.find(
            (x) =>
              key(x.locator) ===
              key({ replayStep: cp.replayStep, childIndex: cp.childIndex })
          )!;
        expect(frame).toBeDefined();
        expect(raw.checkpoint).toEqual(frame.locator);
        expect(cp.afterSourceIndex).toBeLessThan(q.metadata.sourceIndex!);
        for (const player of m.players) {
          const raw = frame.teams
            .flatMap((t, i) => t.players.map((p) => ({ p, i, t })))
            .find((x) => x.p.id === player.id)!;
          expect(raw.p.cell).toEqual([player.cell.x, player.cell.y]);
          if (
            [
              e.metadata.block!.attackerId,
              e.metadata.block!.defenderId
            ].includes(player.id)
          ) {
            expect(raw.p.tackleZone).toBe(1);
            expect(raw.p.status === null || raw.p.status === 0).toBe(true);
          }
        }
        const pitch = input.boardCheckpoints!.find(
            (cp) => cp.afterSourceIndex === m.pitchCheckpointAfter
          )!,
          config = f.frames.find(
            (x) =>
              key(x.locator) ===
              key({
                replayStep: pitch.replayStep,
                childIndex: pitch.childIndex
              })
          )!;
        expect(config.useSmallPitch).toBe(0);
        expect(config.endZones).toContainEqual({
          bottomLeft: [0, 0],
          topRight: [0, 14]
        });
        expect(config.endZones).toContainEqual({
          bottomLeft: [25, 0],
          topRight: [25, 14]
        });
        for (const proof of m.traitEvidence) {
          const seed = input.boardCheckpoints!.find(
              (cp) => cp.afterSourceIndex === proof.observedCheckpointAfter
            )!,
            original = f.frames.find(
              (x) =>
                key(x.locator) ===
                key({
                  replayStep: seed.replayStep,
                  childIndex: seed.childIndex
                })
            )!;
          const data = original.teams
            .flatMap((t) => t.players)
            .find((p) => p.id === proof.playerId)!.data!;
          expect(data).toMatchObject({
            id: Number(proof.playerId),
            playerTypeId: proof.traits.playerTypeId,
            innate: proof.traits.innateSkills,
            acquired: proof.traits.acquiredSkills
          });
        }
        expect(m.branches.every((b) => b.moves.length === 1)).toBe(true);
        expect(m.branches).toHaveLength(m.destinations.length * 2);
        expect(e.contextualImpact).toBeUndefined();
      }
      expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
      expect(r.verdict.luckierTeam).toBe("unknown");
    },
    30000
  );
  it("admits the three current full-source menus with source-selected push and optional follow branches", () => {
    expect(modeled(sourceReport()).map((e) => e.metadata.sourceId)).toEqual([
      "source-98",
      "source-132"
    ]);
    const e = modeled(sourceReport())[0],
      m = e.metadata.blockPush!;
    if (m.status !== "modeled") throw new Error();
    expect(m.branches[m.selectedBranch]).toMatchObject({
      follow: false,
      moves: [{ playerId: "46", to: { x: 14, y: 9 } }]
    });
    expect(e.metadata.block?.chooserTeamId).toBe("0");
  });
  it.each([
    "coordinates",
    "small_pitch",
    "partial_layout",
    "no_initial_layout",
    "unknown_skill",
    "effect",
    "future_cp",
    "menu",
    "chooser",
    "result",
    "extra_result_field",
    "extra_applied_field",
    "extra_block_copy",
    "prone_defender",
    "root_tackle_zone",
    "missing_player"
  ])(
    "withholds the model for %s without changing the original block dice score",
    (kind) => {
      const r = replay(),
        es = r.turns.flatMap((t) => t.events),
        q = es.find((e) => e.id === "source-101")!,
        cp = r.boardCheckpoints!.find((cp) => cp.afterSourceIndex === 98)!,
        initial = r.boardCheckpoints![0]!;
      if (kind === "coordinates") cp.board!.teams[0].players[0].cell.x = null;
      if (kind === "small_pitch") {
        cp.board!.pitchLayoutObserved = true;
        cp.board!.pitchLayout = "small";
        cp.board!.standardPitchCompatible = false;
      }
      if (kind === "partial_layout") {
        cp.board!.pitchLayoutObserved = true;
        cp.board!.standardPitchCompatible = false;
      }
      if (kind === "no_initial_layout") {
        initial.board!.pitchLayout = null;
        initial.board!.standardPitchCompatible = true;
      }
      if (kind === "unknown_skill")
        initial.board!.teams[0].players.find(
          (p) => p.id === 2
        )!.traits!.acquiredSkills = [999];
      if (kind === "effect")
        cp.board!.teams[0].players.find((p) => p.id === 2)!.effectsKnownEmpty =
          false;
      if (kind === "future_cp") cp.afterSourceIndex = q.sourceIndex!;
      if (kind === "menu")
        (q.payload!.CellTo as { Cell: { X: number; Y: number }[] }).Cell[0].X =
          20;
      if (kind === "chooser") q.payload!.GamerId = 1;
      if (kind === "result")
        es.find((e) => e.id === "source-103")!.payload!.CellTo = {
          X: 20,
          Y: 7
        };
      if (kind === "missing_player")
        cp.board!.teams[0].players = cp.board!.teams[0].players.filter(
          (p) => p.id !== 11
        );
      if (kind === "prone_defender")
        cp.board!.teams[1].players.find((p) => p.id === 46)!.statusCode = 1;
      if (kind === "root_tackle_zone")
        cp.board!.teams[0].players.find((p) => p.id === 2)!.tackleZone = null;
      if (kind === "extra_result_field")
        es.find((e) => e.id === "source-103")!.payload!.UnverifiedPolicy = 1;
      if (kind === "extra_applied_field")
        (
          es.find((e) => e.id === "source-107")!.payload!.Pushbacks as {
            ResultPushBack: Record<string, unknown>;
          }
        ).ResultPushBack.UnverifiedPolicy = 1;
      if (kind === "extra_block_copy")
        (q.payload!.BlockRoll as Record<string, unknown>).UnverifiedPolicy = 1;
      const report = checked(r),
        e = report.events.find((e) => e.metadata.sourceId === "source-98")!;
      expect(e.metadata.blockPush?.status).toBe("unsupported");
      expect(e.scoringStatus).toBe("scored");
      expect(e.probabilitySuccess).toBeCloseTo(5 / 9, 12);
    }
  );
  it("unexpected dice in a push menu remain an unscored random candidate", () => {
    const r = replay(),
      q = r.turns.flatMap((t) => t.events).find((e) => e.id === "source-101")!;
    q.payload!.Dice = { Die: { DieType: 0, Value: 6 } };
    const report = checked(r),
      row = report.events.find((e) => e.metadata.sourceId === q.id)!;
    expect(row.metadata.isRollCandidate).toBe(false);
    const unknown = report.diceRecords.find(
      (d) => d.parentSourceId === q.id && JSON.stringify(d.path) === '["Dice"]'
    )!;
    expect(unknown.disposition).toBe("unscored_roll");
    expect(unknown.aliasOf).toBeUndefined();
    const nested = report.events.find((e) => e.id === unknown.eventId)!;
    expect(nested.metadata.isRollCandidate).toBe(true);
    expect(nested.scoringStatus).toBe("excluded");
    expect(nested.probabilitySuccess).toBeNull();
    expect(nested.weightedDelta).toBe(0);
    expect(row.metadata.pushQuestion).toBeUndefined();
  });
  it("the recorded opponent die chooser does not inherit the blocker's push menu", () => {
    const r = checked(playbackFragment("005", "UI-059", [4], [41]));
    const pool = r.events.find((e) => e.metadata.block)!;
    expect(pool.metadata.block!.chooserTeamId).toBe("1");
    expect(pool.teamId).toBe("0");
    const q = r.events.find(
      (e) => e.metadata.sourceTag === "QuestionPushBack"
    )!;
    expect(q.metadata.pushQuestion?.gamerId).toBe(0);
    expect(q.scoringStatus).toBe("excluded");
    expect(q.metadata.isRollCandidate).toBe(false);
    expect(q.weightedDelta).toBe(0);
    expect(pool.metadata.blockPush?.status).toBe("unsupported");
  });

  it("[cli-worker] preserves actual-source alternatives in validated JSON and shared text", () => {
    const run = (format: string) =>
      spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "src/cli/nufflizier.ts",
          "analyze",
          "demo-replays/demo5.bbr",
          "--format",
          format
        ],
        { encoding: "utf8", maxBuffer: 4_000_001 }
      );
    const json = run("json");
    expect(json.error).toBeUndefined();
    expect(Buffer.byteLength(json.stdout)).toBeLessThanOrEqual(4_000_001);
    expect(json.status, json.stderr).toBe(0);
    const report = LuckReportSchema.parse(JSON.parse(json.stdout));
    expect(modeled(report).map((e) => e.metadata.sourceId)).toEqual([
      "source-98",
      "source-132"
    ]);
    const text = run("text");
    expect(text.status, text.stderr).toBe(0);
    expect(text.stdout).toContain(explainBlockPush(modeled(report)[0])!);
    expect(text.stdout).toContain(
      "68 source menus; 2 modeled ordinary position alternatives"
    );
    expect(report.teams.every((t) => t.impactCount === 0)).toBe(true);
  }, 20000);
  const forgeries: [string, (e: LuckEvent, r: LuckReport) => void][] = [
    [
      "drop alternative",
      (e) => {
        if (e.metadata.blockPush?.status === "modeled")
          e.metadata.blockPush.branches.pop();
      }
    ],
    [
      "invent follow",
      (e) => {
        if (e.metadata.blockPush?.status === "modeled")
          e.metadata.blockPush.branches[0].positions.push({
            playerId: "2",
            teamId: "0",
            cell: { x: 13, y: 9 }
          });
      }
    ],
    [
      "wrong selected branch",
      (e) => {
        if (e.metadata.blockPush?.status === "modeled")
          e.metadata.blockPush.selectedBranch = 1;
      }
    ],
    [
      "future roster",
      (e) => {
        if (e.metadata.blockPush?.status === "modeled")
          e.metadata.blockPush.checkpointAfter = 101;
      }
    ],
    [
      "future pitch",
      (e) => {
        if (e.metadata.blockPush?.status === "modeled")
          e.metadata.blockPush.pitchCheckpointAfter = 100;
      }
    ],
    [
      "missing trait proof",
      (e) => {
        if (e.metadata.blockPush?.status === "modeled")
          e.metadata.blockPush.traitEvidence = [];
      }
    ],
    [
      "invent coach chance",
      (e) => {
        if (e.metadata.blockPush?.status === "modeled")
          Object.assign(e.metadata.blockPush.branches[0], { probability: 0.5 });
      }
    ],
    [
      "wrong menu",
      (_, r) => {
        r.events
          .find((e) => e.metadata.sourceId === "source-101")!
          .metadata.pushQuestion!.offered.pop();
      }
    ],
    [
      "orphan result",
      (e) => {
        if (e.metadata.blockPush?.status === "modeled")
          e.metadata.blockPush.resultSourceIds = ["source-100"];
      }
    ],
    [
      "wrong follow source",
      (_, r) => {
        r.events.find(
          (e) => e.metadata.sourceId === "source-107"
        )!.metadata.pushAppliedFollow = true;
      }
    ]
  ];
  it.each(forgeries)(
    "rejects coherent public-report tampering: %s",
    (_, change) => {
      const r = structuredClone(sourceReport()),
        e = r.events.find((e) => e.metadata.sourceId === "source-98")!;
      change(e, r);
      r.keyMoments = r.keyMoments.map((m) =>
        structuredClone(r.events.find((e) => e.id === m.id)!)
      );
      expect(LuckReportSchema.safeParse(r).success).toBe(false);
    }
  );
});
