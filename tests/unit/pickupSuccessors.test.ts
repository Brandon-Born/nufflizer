import { expectedPublicImpactCounts } from "../helpers/corpus";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { observeBoardCheckpoint } from "@/domain/replay/boardState";
import { pickupBounceSuccessors } from "@/domain/replay/pickupSuccessors";
import {
  plainBallPolicyKnown,
  observePlayerTraits
} from "@/domain/replay/playerTraits";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { estimatePickupPossessionBounds } from "@/domain/nufflizer/contextImpact";
import { explainContextBounds, explainContextImpact } from "@/domain/nufflizer/presentation";
import { contextReplayXml } from "../helpers/contextReplay";
import { lonerDriveXml } from "../helpers/lonerDrive";
import { demo8PickupWithNeighbor, settledPickupXml } from "../helpers/pickupPossession";
const sourceXml = (id = "pickup_terminal_success") =>
  lonerDriveXml(id, "tests/fixtures/evidence/bb3-pickup-successors.json");
const sourceReport = (id = "pickup_terminal_success") =>
  analyzeNufflizerInput(sourceXml(id));
const check = (r: ReturnType<typeof sourceReport>) =>
  r.events.find((e) => e.possessionBounds)!;
function board(complete = true) {
  const p = (Id: number, X: number, Y: number) => ({
    Id,
    Cell: { X, Y },
    CanAct: 1,
    MovePoint: 5,
    Status: 0,
    Situation: 0,
    TackleZone: 1,
    ...(complete
      ? { Data: { Id, InnateSkills: "", AcquiredSkills: "" }, Effects: "" }
      : {})
  });
  return observeBoardCheckpoint(
    {
      IsStable: 1,
      CurrentPhase: 5,
      ActiveTeam: 0,
      ActivePlayer: 10,
      Ball: { Cell: { X: 5, Y: 5 }, IsHeld: 0 },
      ListTeams: {
        TeamState: [
          {
            Data: { TeamId: 0 },
            ListPitchPlayers: { PlayerState: [p(10, 5, 5), p(11, 2, 2)] }
          },
          {
            Data: { TeamId: 1 },
            ListPitchPlayers: { PlayerState: p(40, 9, 9) }
          }
        ]
      }
    },
    "1-4-0-0",
    { kind: "board", afterSourceIndex: 0, replayStep: 1, childIndex: 0 }
  ).board!;
}
const successors = (b = board()) =>
  pickupBounceSuccessors(b, 10, "declaration", "move", "0", ["0", "1"])!;
describe("valid pickup failure successors and conditional possession bounds", () => {
  it.each([false, true])("values all six replacement faces with known landings (exposed = %s)", (exposed) => {
    // At (5,7), a marker on (3,7) covers precisely three of eight
    // destinations. The other variant keeps that same opponent far away.
    const difference = exposed ? 19 / 8 : 2;
    let total = 0;
    for (const face of [1, 2, 3, 4, 5, 6]) {
      const report = analyzeNufflizerInput(settledPickupXml(exposed, face));
      const roll = report.events.find((event) => event.metadata.sourceId === "source-15")!;
      const success = face >= 3;
      const value = difference * (success ? 1 / 3 : -2 / 3);
      expect(roll.contextualImpact).toMatchObject({
        policy: "exact_pickup_possession",
        stage: "sure_hands_reroll",
        components: { possession: 2, markedBounce: exposed ? 3 / 8 : 0 },
        successChance: 2 / 3,
        difference
      });
      expect(roll.contextualImpact!.contribution).toBeCloseTo(value, 12);
      expect(roll.possessionBounds).toBeUndefined();
      expect(roll.delta).toBeCloseTo(Number(success) - 4 / 3, 12);
      expect(roll.metadata.teamRerollsSpent).toBe(0);
      expect(Boolean(roll.metadata.pickupResolution)).toBe(success);
      expect(report.teams[0].impactCount).toBe(1);
      expect(report.teams[0].impactScore).toBeCloseTo(value, 12);
      expect(report.contextComponents[0]).toMatchObject({ pointCount: 1, boundedCount: 0 });
      total += roll.contextualImpact!.contribution;
    }
    expect(total).toBeCloseTo(0, 12);
  });
  it("keeps an exposure range when current effects are missing and rejects forged exactness", () => {
    const report = analyzeNufflizerInput(settledPickupXml(true, 1, true));
    expect(check(report)).toMatchObject({
      possessionBounds: { minimumDifference: 0, maximumDifference: 19 / 8 }
    });
    expect(check(report).contextualImpact).toBeUndefined();
    const complete = analyzeNufflizerInput(settledPickupXml(true));
    const roll = complete.events.find((event) => event.contextualImpact?.policy === "exact_pickup_possession")!;
    expect(explainContextImpact(roll)).toContain("with 3 under an opponent's tackle zone");
    const branch = roll.metadata.preRoll!.pickupSuccessors!.branches[0]!;
    if (branch.kind !== "empty") throw new Error("Expected a settled empty branch");
    branch.marking = "unknown";
    expect(LuckReportSchema.safeParse(complete).success).toBe(false);
  });
  it.each([
    { file: "demo2.bbr", source: 255, before: 234, waiting: undefined, moved: 8, stage: "kept_pickup_possession", spend: 0 },
    { file: "demo4.bbr", source: 4192, before: 4174, waiting: 4189, moved: undefined, stage: "team_pickup_possession", spend: 1 }
  ])("qualifies a controlled complete $stage while preserving the draw and choice", (example) => {
    const replay = parseReplayXml(decodeReplayInput(readFileSync(`demo-replays/${example.file}`, "utf8")).xml);
    const published = analyzeReplayLuck(replay).events.find((event) => event.metadata.sourceIndex === example.source)!;
    expect(published.possessionBounds).toBeDefined();
    // Synthetic completion of the observed reaction profiles. Move the
    // known occupied alternative outside the bounce area in the kept case.
    for (const checkpoint of replay.boardCheckpoints!.filter((row) =>
      row.afterSourceIndex === example.before || row.afterSourceIndex === example.waiting
    )) {
      for (const player of checkpoint.board!.teams.flatMap((team) => team.players)) {
        if (player.pitchLocation === "on_pitch") player.plainBallPolicyKnown = true;
        if (player.id === example.moved) player.cell = { x: 23, y: 13 };
      }
    }
    const report = analyzeReplayLuck(replay);
    const roll = report.events.find((event) => event.metadata.sourceIndex === example.source)!;
    expect(roll.contextualImpact).toMatchObject({
      policy: "exact_pickup_possession", stage: example.stage,
      waitingCheckpointAfter: example.waiting, contribution: -4 / 3
    });
    expect(roll.possessionBounds).toBeUndefined();
    expect(roll.metadata.teamRerollsSpent).toBe(example.spend);
    expect(roll.delta).toBe(published.delta);
    expect(LuckReportSchema.safeParse(report).success).toBe(true);
  });
  it("constructs all eight independent D8 destinations without mutating the board", () => {
    const b = board(),
      copy = structuredClone(b),
      s = successors(b);
    expect(s.branches.map((b) => b.destination)).toEqual([
      { x: 4, y: 6 },
      { x: 5, y: 6 },
      { x: 6, y: 6 },
      { x: 4, y: 5 },
      { x: 6, y: 5 },
      { x: 4, y: 4 },
      { x: 5, y: 4 },
      { x: 6, y: 4 }
    ]);
    expect(
      s.branches.every(
        (b) =>
          b.kind === "empty" &&
          b.marking === "unmarked" &&
          b.settlement === "loose"
      )
    ).toBe(true);
    expect(b).toEqual(copy);
  });
  it.each(["other_owns_actor", "both_omitted", "unknown_other_team"] as const)(
    "does not repair current roster identity after %s",
    (change) => {
      const b = board();
      b.teams[0]!.explicitTeamId = null;
      if (change === "both_omitted") b.teams[1]!.explicitTeamId = null;
      if (change === "unknown_other_team") b.teams[1]!.explicitTeamId = 2;
      const acting = change === "other_owns_actor" ? "1" : "0";
      expect(
        pickupBounceSuccessors(b, 10, "declaration", "move", acting, ["0", "1"])
      ).toBeUndefined();
    }
  );
  it("keeps missing reaction traits/effects uncertain even for empty squares", () => {
    expect(
      successors(board(false)).branches.every(
        (b) => b.kind === "empty" && b.settlement === "reaction_unknown"
      )
    ).toBe(true);
  });
  it.each([true, null] as const)(
    "marks known/unknown tackle zones %s without choosing a landing",
    (zone) => {
      const b = board();
      b.teams[1]!.players[0]!.cell = { x: 7, y: 5 };
      b.teams[1]!.players[0]!.tackleZone = zone;
      const s = successors(b);
      expect(
        s.branches.filter(
          (p) =>
            p.kind === "empty" && p.marking === (zone ? "marked" : "unknown")
        )
      ).toHaveLength(3);
    }
  );
  it("keeps a friendly occupied square pending instead of claiming a catch or lost ball", () => {
    const b = board();
    b.teams[0]!.players[1]!.cell = { x: 6, y: 5 };
    const s = successors(b);
    expect(s.branches[4]).toMatchObject({
      kind: "occupied",
      playerId: "11",
      rosterIndex: 0
    });
    const bound = estimatePickupPossessionBounds(
      { pickupSuccessors: s } as never,
      "sure_hands_reroll",
      1 / 3,
      2 / 3
    )!;
    expect(bound.minimumDifference).toBe(7 / 4);
    expect(bound.maximumDifference).toBe(17 / 8);
  });
  it("retains all five off-pitch corner alternatives as unknown returns", () => {
    const b = board();
    b.teams[0]!.players[0]!.cell = { x: 0, y: 0 };
    b.ball.cell = { x: 0, y: 0 };
    const s = successors(b);
    expect(s.branches.filter((b) => b.kind === "out_of_bounds")).toHaveLength(
      5
    );
    const bound = estimatePickupPossessionBounds(
      { pickupSuccessors: s } as never,
      "sure_hands_reroll",
      1 / 3,
      2 / 3
    )!;
    expect(bound.minimumDifference).toBe(3 / 4);
    expect(bound.maximumDifference).toBe(21 / 8);
  });
  it.each([
    "holder",
    "carrier",
    "wrong_ball_cell",
    "owner_conflict",
    "wrong_active",
    "mental",
    "prone",
    "small_pitch",
    "unknown_position",
    "collision",
    "issues"
  ] as const)("withholds %s geometry", (change) => {
    const b = board(),
      actor = b.teams[0]!.players[0]!;
    if (change === "holder") b.ball.possession = "held";
    if (change === "carrier") b.ball.carrierId = 11;
    if (change === "wrong_ball_cell") b.ball.cell = { x: 6, y: 6 };
    if (change === "owner_conflict") b.teams[0]!.explicitTeamId = 1;
    if (change === "wrong_active") b.activeTeamIndex = 1;
    if (change === "mental") actor.mentalEffect = { providerSkillId: 51 };
    if (change === "prone") actor.statusCode = 1;
    if (change === "small_pitch") b.pitchLayout = "small";
    if (change === "unknown_position")
      b.teams[1]!.players[0]!.pitchLocation = "unknown";
    if (change === "collision") b.teams[1]!.players[0]!.cell = actor.cell;
    if (change === "issues") b.issues.push("unknown_geometry");
    expect(
      pickupBounceSuccessors(b, 10, "declaration", "move", "0", ["0", "1"])
    ).toBeUndefined();
  });
  it.each(["pickup_terminal_success", "pickup_terminal_failure"] as const)(
    "reconciles independently extracted %s without filling current team/holder/clock/traits",
    (id) => {
      const r = sourceReport(id),
        e = check(r),
        p = e.metadata.preRoll!,
        s = p.pickupSuccessors!,
        success = id.endsWith("success");
      expect(e.actualSuccess).toBe(success);
      expect(e.probabilitySuccess).toBeCloseTo(8 / 9, 12);
      expect(e.delta).toBeCloseTo(Number(success) - 4 / 3, 12);
      expect(e.possessionBounds!.successChance).toBeCloseTo(2 / 3, 12);
      expect(p).toMatchObject({
        activeTeamId: null,
        teamTurn: null,
        period: null,
        actorCarriesBall: null,
        pickupSettlementKnown: false
      });
      expect(p.actorRosterTeamId).toBeUndefined();
      expect(p.otherUsefulActivations).toBeNull();
      expect(s.origin).toEqual(success ? { x: 11, y: 10 } : { x: 5, y: 7 });
      expect(s.branches.filter((b) => b.kind === "empty")).toHaveLength(
        success ? 3 : 8
      );
      expect(
        s.branches
          .filter((b) => b.kind === "occupied")
          .map((b) => (b.kind === "occupied" ? b.playerId : ""))
      ).toEqual(success ? ["5", "8", "4", "1", "10"] : []);
      expect(s.branches.some((b) => b.kind === "out_of_bounds")).toBe(false);
      expect(e.possessionBounds!.minimumDifference).toBe(0);
      expect(e.possessionBounds!.maximumDifference).toBe(success ? 21 / 8 : 2);
      expect(e.possessionBounds!.lower).toBeCloseTo(success ? 0 : -4 / 3, 12);
      expect(e.possessionBounds!.upper).toBeCloseTo(success ? 7 / 8 : 0, 12);
      expect(e.contextualImpact).toBeUndefined();
      expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
      expect(explainContextBounds(e)).toContain(
        "earlier failed die and later catch/return dice"
      );
      const evidence = JSON.parse(
        readFileSync(
          "tests/fixtures/evidence/bb3-pickup-successors.json",
          "utf8"
        )
      );
      const c = evidence.cases.find((c: { id: string }) => c.id === id);
      const raw = c.records.find(
        (r: { projection?: { BoardState?: unknown } }) =>
          r.projection?.BoardState
      ).projection.BoardState;
      expect(raw.ActiveTeam).toBeUndefined();
      expect(raw.Ball[0].IsHeld).toBeUndefined();
    }
  );
  it.each([
    {
      kind: "a possession range",
      xml: () => sourceXml(),
      expected: [
        "3 empty, 5 occupied and 0 off-pitch",
        "0.00 to 0.88 context units",
        "No midpoint or range endpoint enters point totals",
        "Context for Home: Not scored"
      ]
    },
    {
      kind: "an exact possession point",
      xml: () => settledPickupXml(true),
      expected: [
        "source source-15: The committed Sure Hands replacement die had 66.7%",
        "with 3 under an opponent's tackle zone",
        "-1.583 provisional context units"
      ]
    },
    {
      kind: "the original demo8 pickup point",
      xml: () => readFileSync("demo-replays/demo8.bbr", "utf8"),
      expected: [
        "source source-217: The committed team replacement die had 66.7%",
        "all 22 rostered players remained verified through the reroll wait",
        "0.667 provisional context units"
      ]
    }
  ])("[cli-worker] prints $kind with the source and draw scope", ({ xml, expected }) => {
    const dir = mkdtempSync(join(tmpdir(), "nufflizier-pickup-"));
    try {
      const path = join(dir, "source.xml");
      writeFileSync(path, xml());
      const run = spawnSync(
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
      expect(run.status, run.stderr).toBe(0);
      for (const line of expected) expect(run.stdout).toContain(line);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("keeps observed bounce and later snapshots out of earlier counterfactual alternatives", () => {
    const r = parseReplayXml(sourceXml("pickup_terminal_failure")),
      before = check(analyzeReplayLuck(r));
    const bounce = r.turns
      .flatMap((t) => t.events)
      .find((e) => e.rollType === 25)!;
    (bounce.payload!.Dice as { Die: { Value: number } }).Die.Value = 1;
    for (const c of r.boardCheckpoints!)
      if (c.afterSourceIndex > before.metadata.sourceIndex!) c.board = null;
    const after = check(LuckReportSchema.parse(analyzeReplayLuck(r)));
    expect(after.possessionBounds).toEqual(before.possessionBounds);
    expect(after.metadata.preRoll).toEqual(before.metadata.preRoll);
  });
  it.each([
    "interruption",
    "wrong_skill",
    "unused_skill",
    "wrong_owner",
    "modifier",
    "unknown_move",
    "pushback"
  ] as const)("does not admit a terminal component after %s", (change) => {
    const r = parseReplayXml(sourceXml()),
      raw = r.turns.flatMap((t) => t.events),
      skill = raw.find(
        (e) => e.sourceTag === "ResultSkillUsage" && e.payload?.Skill === 61
      )!;
    const turn = r.turns.find((t) => t.events.includes(skill))!,
      index = turn.events.indexOf(skill),
      original = turn.events[index - 1]!,
      final = turn.events[index + 1]!;
    if (change === "interruption")
      turn.events.splice(index, 0, {
        ...skill,
        id: "unknown",
        sourceTag: "UnknownMutation",
        type: "unknown"
      });
    if (change === "wrong_skill") skill.payload!.Skill = 6;
    if (change === "unused_skill") skill.payload!.Used = 0;
    if (change === "wrong_owner") skill.actorTeamId = "1";
    if (change === "modifier") {
      original.payload!.Modifiers = {
        Modifier: { Value: 0, ModifierType: 11 }
      };
      final.payload!.Modifiers = original.payload!.Modifiers;
    }
    if (change === "unknown_move") turn.events[index - 2]!.payload!.Mystery = 1;
    if (change === "pushback")
      turn.events[index - 2]!.payload!.Pushbacks = {
        Pushback: { PlayerId: 40 }
      };
    expect(analyzeReplayLuck(r).events.some((e) => e.possessionBounds)).toBe(
      false
    );
  });
  it("a later plain move cannot repair earlier unknown movement fields", () => {
    const r = parseReplayXml(sourceXml()),
      events = r.turns.flatMap((t) => t.events);
    const skill = events.find(
      (e) => e.sourceTag === "ResultSkillUsage" && e.payload?.Skill === 61
    )!;
    const prior = events.filter(
      (e) =>
        e.sourceTag === "ResultMoveOutcome" &&
        e.sourceIndex! < skill.sourceIndex!
    );
    expect(prior.length).toBeGreaterThan(1);
    // Two source moves by this actor precede the pickup; mutate the first.
    const moves = prior.filter((e) => e.playerId === skill.playerId);
    moves[0]!.payload!.Mystery = 1;
    expect(analyzeReplayLuck(r).events.some((e) => e.possessionBounds)).toBe(
      false
    );
  });
  it("an intervening matching snapshot cannot repair an unknown-clock declaration", () => {
    const r = parseReplayXml(sourceXml()),
      e = check(analyzeReplayLuck(r)),
      decl = r.turns
        .flatMap((t) => t.events)
        .find((x) => x.id === e.metadata.preRoll!.activationId)!;
    const before = r.boardCheckpoints!.find(
      (c) => c.afterSourceIndex === e.metadata.preRoll!.checkpointAfter
    )!;
    const inserted = structuredClone(before);
    inserted.afterSourceIndex = decl.sourceIndex!;
    inserted.board!.activePlayerId = Number(e.playerId);
    r.boardCheckpoints!.push(inserted);
    r.boardCheckpoints!.sort((a, b) => a.afterSourceIndex - b.afterSourceIndex);
    expect(analyzeReplayLuck(r).events.some((e) => e.possessionBounds)).toBe(
      false
    );
  });
  it("has zero-mean conditional terminal contributions for an exact synthetic passive policy", () => {
    const p = { pickupSuccessors: successors() } as never;
    const terms = [1, 2, 3, 4, 5, 6].map((face) =>
      estimatePickupPossessionBounds(
        p,
        "sure_hands_reroll",
        Number(face >= 3) - 2 / 3,
        2 / 3
      )!
    );
    expect(terms[0]!.lower).toBeCloseTo(-4 / 3, 12);
    expect(terms[2]!.upper).toBeCloseTo(2 / 3, 12);
    expect(
      terms.every(
        (t) =>
          t.minimumDifference === 2 &&
          t.maximumDifference === 2 &&
          t.lower === t.upper
      )
    ).toBe(true);
    expect(terms.reduce((n, t) => n + t.lower, 0) / 6).toBeCloseTo(0, 12);
  });
  it.each([
    "direction",
    "destination",
    "off_pitch",
    "self_catch",
    "settlement",
    "bound",
    "compound_chance",
    "owner",
    "declaration",
    "move_source",
    "point_overlap"
  ] as const)("shared reports reject forged %s", (change) => {
    const r = sourceReport(),
      e = check(r),
      s = e.metadata.preRoll!.pickupSuccessors!;
    if (change === "direction") s.branches[0]!.direction = 2;
    if (change === "destination") s.branches[0]!.destination.x = 0;
    if (change === "off_pitch")
      s.branches[0] = {
        direction: 1,
        destination: s.branches[0]!.destination,
        kind: "out_of_bounds"
      };
    if (change === "self_catch") {
      const b = s.branches.find((b) => b.kind === "occupied")!;
      if (b.kind === "occupied") b.playerId = e.playerId!;
    }
    if (change === "settlement") {
      const b = s.branches.find((b) => b.kind === "empty")!;
      if (b.kind === "empty") b.settlement = "loose";
    }
    if (change === "bound") e.possessionBounds!.upper++;
    if (change === "compound_chance") e.possessionBounds!.successChance = 8 / 9;
    if (change === "owner") e.teamId = "1";
    if (change === "declaration") s.declarationSourceId = s.moveOutcomeSourceId;
    if (change === "move_source") s.moveOutcomeSourceId = s.declarationSourceId;
    if (change === "point_overlap")
      e.contextualImpact = {
        policy: "declined_team_reroll",
        components: { availableMoves: 0, possession: 2, markedBounce: 0 },
        deviation: 1 / 3,
        difference: 2,
        contribution: 2 / 3
      };
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
  it.each(["skills", "effects", "identity", "reactive_skill"] as const)(
    "does not certify %s as a plain ball policy",
    (change) => {
      const data: Record<string, unknown> = {
        Id: 10,
        InnateSkills: "",
        AcquiredSkills: ""
      };
      let effects: unknown = "";
      if (change === "skills") delete data.AcquiredSkills;
      if (change === "effects") effects = undefined;
      if (change === "identity") data.Id = 11;
      if (change === "reactive_skill")
        data.InnateSkills = { InnateSkillsItem: 999 };
      expect(
        plainBallPolicyKnown(observePlayerTraits(data, 10), 10, effects)
      ).toBe(false);
    }
  );
  it("withholds the older pickup point estimate when an opponent's current reaction policy is omitted", () => {
    const r = parseReplayXml(contextReplayXml({ type: 4, exposed: true }));
    for (const c of r.boardCheckpoints!)
      if (c.board) c.board.teams[1]!.players[0]!.plainBallPolicyKnown = false;
    const report = LuckReportSchema.parse(analyzeReplayLuck(r)),
      e = report.events.find((e) => e.scoringStatus === "scored")!;
    expect(e.metadata.preRoll?.pickupSettlementKnown).toBe(false);
    expect(e.metadata.preRoll?.pickupBounceExposure).toBeNull();
    expect(e.contextualImpact).toBeUndefined();
  });
  it.each([
    { file: "demo2.bbr", source: 255, occupied: [5], marked: [], upperDifference: 17 / 8, lower: -17 / 12 },
    { file: "demo11.bbr", source: 3198, occupied: [4, 7], marked: [1], upperDifference: 19 / 8, lower: -19 / 12 }
  ])("bounds the recorded decline in $file without charging another die", (c) => {
    const input = readFileSync(`demo-replays/${c.file}`, "utf8");
    const report = analyzeNufflizerInput(input);
    const roll = report.events.find((e) => e.metadata.sourceIndex === c.source)!;
    const branches = roll.metadata.preRoll!.pickupSuccessors!.branches;
    expect(branches.filter((b) => b.kind === "occupied").map((b) => b.direction)).toEqual(c.occupied);
    expect(branches.filter((b) => b.kind === "empty" && b.marking === "marked").map((b) => b.direction)).toEqual(c.marked);
    expect(roll.possessionBounds).toMatchObject({
      policy: "kept_pickup_possession",
      successChance: 2 / 3,
      minimumDifference: 0,
      maximumDifference: c.upperDifference,
      upper: 0
    });
    expect(roll.possessionBounds!.lower).toBeCloseTo(c.lower, 12);
    expect(roll.metadata.teamRerollsSpent).toBe(0);
    expect(roll.delta).toBe(-2 / 3);
    expect(roll.contextualImpact).toBeUndefined();
    expect(explainContextBounds(roll)).toContain("Under the recorded decline policy, the original die");
    const choice = report.events.find((e) => e.metadata.sourceId === roll.metadata.rerollDecisionId)!;
    choice.metadata.recordedRerollChoice!.used = true;
    expect(LuckReportSchema.safeParse(report).success).toBe(false);
  });
  it.each([
    { file: "demo4.bbr", source: 4192, waiting: 4189, success: false }
  ])("values the committed replacement only in $file", (c) => {
    const input = readFileSync(`demo-replays/${c.file}`, "utf8");
    const report = analyzeNufflizerInput(input);
    const roll = report.events.find((event) => event.metadata.sourceIndex === c.source)!;
    expect(roll.actualSuccess).toBe(c.success);
    expect(roll.possessionBounds).toMatchObject({
      policy: "team_pickup_possession",
      waitingCheckpointAfter: c.waiting,
      successChance: 2 / 3,
      minimumDifference: 0,
      maximumDifference: 2
    });
    expect(roll.possessionBounds!.lower).toBeCloseTo(c.success ? 0 : -4 / 3, 12);
    expect(roll.possessionBounds!.upper).toBeCloseTo(c.success ? 2 / 3 : 0, 12);
    expect(roll.probabilitySuccess).toBeCloseTo(8 / 9, 12);
    expect(roll.delta).toBeCloseTo(Number(c.success) - 4 / 3, 12);
    expect(roll.metadata.teamRerollsSpent).toBe(1);
    expect(roll.contextualImpact).toBeUndefined();
    const parsed = parseReplayXml(decodeReplayInput(input).xml);
    const waiting = parsed.boardCheckpoints!.find((frame) => frame.afterSourceIndex === c.waiting)!;
    waiting.board!.ball.cell.x = 0;
    const changed = analyzeReplayLuck(parsed).events.find((e) => e.metadata.sourceIndex === c.source)!;
    expect(changed.metadata.rerollDraws).toEqual(roll.metadata.rerollDraws);
    expect(changed.possessionBounds).toBeUndefined();
    roll.possessionBounds!.waitingCheckpointAfter!++;
    expect(LuckReportSchema.safeParse(report).success).toBe(false);
  });
  it("settles all eight unmarked bounces using demo8's verified roster through the reroll wait", () => {
    const xml = decodeReplayInput(readFileSync("demo-replays/demo8.bbr", "utf8")).xml;
    const replay = parseReplayXml(xml);
    const report = LuckReportSchema.parse(analyzeReplayLuck(replay));
    const roll = report.events.find((e) => e.metadata.sourceId === "source-217")!;
    const point = roll.contextualImpact;
    expect(point?.policy).toBe("exact_pickup_possession");
    if (point?.policy !== "exact_pickup_possession") throw new Error("Expected a pickup point");
    expect(point).toMatchObject({
      stage: "team_pickup_possession", waitingCheckpointAfter: 214,
      successChance: 2 / 3, components: { possession: 2, markedBounce: 0 }
    });
    expect(point.continuedTraits).toHaveLength(22);
    expect(point.continuedTraits!.filter((p) => p.observedCheckpointAfter === 12).map((p) => p.playerId)).toEqual(["10", "11"]);
    expect(point.continuedTraits!.every((p) => p.currentCheckpointAfter === 208)).toBe(true);
    expect(point.contribution).toBeCloseTo(2 / 3, 12);
    expect(roll.possessionBounds).toBeUndefined();
    expect(roll.metadata.preRoll?.pickupSuccessors?.origin).toEqual({ x: 6, y: 3 });
    expect(roll.metadata.preRoll?.pickupSuccessors?.branches).toHaveLength(8);
    expect(roll.metadata.preRoll?.pickupSuccessors?.branches.every((b) =>
      b.kind === "empty" && b.marking === "unmarked" && b.settlement === "loose"
    )).toBe(true);
    expect(report.teams[0].impactCount).toBe(1);
    expect(report.teams[0].impactScore).toBeCloseTo(2 / 3, 12);
    expect(roll.delta).toBeCloseTo(-1 / 3, 12);
    expect(roll.metadata.teamRerollsSpent).toBe(1);

    point.continuedTraits!.pop();
    expect(LuckReportSchema.safeParse(report).success).toBe(false);
    const seed = replay.boardCheckpoints![0]!.board!.teams[0]!.players.find((p) => p.id === 9)!;
    seed.effectsKnownEmpty = false;
    const fallback = LuckReportSchema.parse(analyzeReplayLuck(replay)).events.find((e) => e.metadata.sourceId === "source-217")!;
    expect(fallback.contextualImpact).toBeUndefined();
    expect(fallback.possessionBounds).toMatchObject({ minimumDifference: 0, maximumDifference: 2 });
    expect(fallback.delta).toBe(roll.delta);
  });
  it.each([
    { neighbor: "occupied" as const, empty: 7, unknown: 0, lower: 7 / 12, upper: 17 / 24 },
    { neighbor: "unknown_marking" as const, empty: 8, unknown: 3, lower: 2 / 3, upper: 19 / 24 }
  ])("settles the verified empty landings while retaining $neighbor uncertainty", (example) => {
    const xml = decodeReplayInput(readFileSync("demo-replays/demo8.bbr", "utf8")).xml;
    const replay = demo8PickupWithNeighbor(xml, example.neighbor);
    const report = LuckReportSchema.parse(analyzeReplayLuck(replay));
    const roll = report.events.find((event) => event.metadata.sourceId === "source-217")!;
    const bound = roll.possessionBounds!;
    const empty = roll.metadata.preRoll!.pickupSuccessors!.branches.filter((b) => b.kind === "empty");
    expect(empty).toHaveLength(example.empty);
    expect(empty.every((b) => b.settlement === "loose")).toBe(true);
    expect(empty.filter((b) => b.marking === "unknown")).toHaveLength(example.unknown);
    expect(bound.continuedTraits).toHaveLength(22);
    expect(bound.waitingCheckpointAfter).toBe(214);
    expect(bound.lower).toBeCloseTo(example.lower, 12);
    expect(bound.upper).toBeCloseTo(example.upper, 12);
    expect(roll.contextualImpact).toBeUndefined();
    expect(roll.delta).toBeCloseTo(-1 / 3, 12);
    bound.continuedTraits!.pop();
    expect(LuckReportSchema.safeParse(report).success).toBe(false);
  });
  it("settles demo5's rain pickup with eighteen skill profiles and four recorded removals", () => {
    const input = readFileSync("demo-replays/demo5.bbr", "utf8");
    const report = analyzeNufflizerInput(input);
    const roll = report.events.find((event) => event.metadata.sourceId === "source-2409")!;
    const point = roll.contextualImpact;
    expect(point).toMatchObject({
      policy: "exact_pickup_possession",
      stage: "team_pickup_possession",
      waitingCheckpointAfter: 2406,
      successChance: 1 / 2,
      difference: 2,
      deviation: -1 / 2,
      contribution: -1,
      offPitchPlayerCount: 4
    });
    if (point?.policy !== "exact_pickup_possession") throw new Error("Expected a pickup point");
    expect(point.continuedTraits?.map((p) => p.playerId)).toEqual([
      "1", "3", "4", "5", "6", "8", "9", "10", "11", "37", "38", "40", "41",
      "43", "44", "45", "46", "47"
    ]);
    const removals = [[
      { playerId: 2, situationCode: 4, statusCode: 4 },
      { playerId: 7, situationCode: 4, statusCode: 4 }
    ], [
      { playerId: 39, situationCode: 2, statusCode: 3 },
      { playerId: 42, situationCode: 4, statusCode: 5 }
    ]];
    const frames = report.rerollResources.flow.clockSnapshots;
    for (const after of [2385, 2406])
      expect(frames.find((f) => f.source.checkpointAfter === after)?.pickupOffPitch).toEqual(removals);
    expect(roll.possessionBounds).toBeUndefined();
    expect(roll.metadata.preRoll?.pickupSuccessors?.branches).toHaveLength(8);
    expect(roll.metadata.preRoll?.pickupSuccessors?.branches.every((b) =>
      b.kind === "empty" && b.settlement === "loose" && b.marking === "unmarked"
    )).toBe(true);
    expect(roll.probabilitySuccess).toBe(3 / 4);
    expect(roll.delta).toBe(-1);
    expect(roll.metadata.teamRerollsSpent).toBe(1);
    expect(roll.metadata.fixedNumericModifiers).toEqual([
      { playerId: -1, modifierType: 15, skillId: -1, effectId: -1, value: -1 }
    ]);
    const changed = parseReplayXml(decodeReplayInput(input).xml);
    for (const event of changed.turns.flatMap((turn) => turn.events)) {
      const payload = event.sourceIndex === 2406 ? event.payload?.RollInfos
        : event.sourceIndex === 2409 ? event.payload : undefined;
      if (payload)
        (payload as { Modifiers: { Modifier: { PlayerId: number } } }).Modifiers.Modifier.PlayerId = 40;
    }
    const revised = analyzeReplayLuck(changed).events.find((event) => event.metadata.sourceId === "source-2409")!;
    expect(revised.metadata.rerollDraws).toEqual(roll.metadata.rerollDraws);
    expect(revised.possessionBounds).toBeUndefined();
    expect(revised.contextualImpact).toBeUndefined();

    const waiting = frames.find((f) => f.source.checkpointAfter === 2406)!;
    delete waiting.pickupOffPitch;
    expect(LuckReportSchema.safeParse(report).success).toBe(false);
    waiting.pickupOffPitch = frames.find((f) => f.source.checkpointAfter === 2385)!.pickupOffPitch;
    point.offPitchPlayerCount = 3;
    expect(LuckReportSchema.safeParse(report).success).toBe(false);
  });
  it.each(["unconfirmed_removal", "diving_catch"])("keeps a rain pickup range with %s", (variant) => {
    const input = readFileSync("demo-replays/demo5.bbr", "utf8");
    const replay = parseReplayXml(decodeReplayInput(input).xml);
    if (variant === "unconfirmed_removal") {
      for (const index of [2385, 2406]) {
        const board = replay.boardCheckpoints!.find((cp) => cp.afterSourceIndex === index)!.board!;
        board.teams[1]!.players.find((p) => p.id === 42)!.statusCode = null;
      }
    } else {
      const seed = replay.boardCheckpoints![0]!.board!.teams[0]!.players.find((p) => p.id === 4)!;
      seed.traits!.acquiredSkills!.push(28);
    }
    const report = LuckReportSchema.parse(analyzeReplayLuck(replay));
    const roll = report.events.find((e) => e.metadata.sourceId === "source-2409")!;
    expect(roll.contextualImpact).toBeUndefined();
    expect(roll.possessionBounds).toMatchObject({ lower: -1, upper: 0, successChance: 1 / 2 });
    expect(roll.delta).toBe(-1);
  });
  it("requires the off-pitch roster receipt for the demo6 Sure Hands point", () => {
    const input = readFileSync("demo-replays/demo6.bbr", "utf8");
    const report = analyzeNufflizerInput(input);
    const roll = report.events.find((e) => e.metadata.sourceId === "source-2151")!;
    const point = roll.contextualImpact;
    expect(point).toMatchObject({
      policy: "exact_pickup_possession",
      stage: "sure_hands_reroll",
      contribution: -4 / 3,
      offPitchPlayerCount: 5
    });
    if (point?.policy !== "exact_pickup_possession") throw new Error("Expected pickup point");
    expect(point.continuedTraits).toHaveLength(21);
    expect(point.waitingCheckpointAfter).toBeUndefined();
    const frame = report.rerollResources.flow.clockSnapshots.find(
      (f) => f.source.checkpointAfter === 2143
    )!;
    delete frame.pickupOffPitch;
    expect(LuckReportSchema.safeParse(report).success).toBe(false);

    const replay = parseReplayXml(decodeReplayInput(input).xml);
    const board = replay.boardCheckpoints!.find((cp) => cp.afterSourceIndex === 2143)!.board!;
    board.teams[1]!.players.find((p) => p.id === 51)!.statusCode = null;
    const uncertain = analyzeReplayLuck(replay).events.find((e) => e.metadata.sourceId === "source-2151")!;
    expect(uncertain.contextualImpact).toBeUndefined();
    expect(uncertain.possessionBounds).toMatchObject({ lower: -4 / 3, upper: 0 });
    expect(uncertain.weightedDelta).toBe(roll.weightedDelta);
  });
  it("reconciles all public demo context ranges and point estimates", () => {
    let possession = 0,
      moves = 0;
    for (const file of readdirSync("demo-replays").filter((f) =>
      f.endsWith(".bbr")
    )) {
      const r = analyzeNufflizerInput(
        readFileSync(`demo-replays/${file}`, "utf8")
      );
      possession += r.events.filter((e) => e.possessionBounds).length;
      moves += r.events.filter((e) => e.contextualBounds?.policy === "dodge_skill_reroll").length;
      expect(r.coverage.contextEvidence.boundedCount).toBe(
        r.events.filter((e) => e.contextualBounds || e.possessionBounds || e.catchPossessionBounds).length
      );
      expect(r.teams.map((t) => t.impactCount)).toEqual(expectedPublicImpactCounts(file));
      expect(r.verdict.luckierTeam).toBe("unknown");
    }
    expect(possession).toBe(4);
    expect(moves).toBe(10);
  });
});
