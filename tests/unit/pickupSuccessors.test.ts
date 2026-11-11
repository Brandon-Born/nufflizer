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
import { parseReplayXml } from "@/domain/replay/parseXml";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { estimatePickupPossessionBounds } from "@/domain/nufflizer/contextImpact";
import { explainContextBounds } from "@/domain/nufflizer/presentation";
import { contextReplayXml } from "../helpers/contextReplay";
import { lonerDriveXml } from "../helpers/lonerDrive";
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
      expect(e.delta).toBeCloseTo(Number(success) - 8 / 9, 12);
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
  it("prints component bounds in CLI text without point totals or a midpoint", () => {
    const dir = mkdtempSync(join(tmpdir(), "nufflizier-pickup-"));
    try {
      const path = join(dir, "source.xml");
      writeFileSync(path, sourceXml());
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
      expect(run.status).toBe(0);
      expect(run.stdout).toContain("3 empty, 5 occupied and 0 off-pitch");
      expect(run.stdout).toContain("0.00 to 0.88 context units");
      expect(run.stdout).toContain(
        "No midpoint or range endpoint enters point totals"
      );
      expect(run.stdout).toContain("Context for Home: Not scored");
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
  it("reconciles all public demos without converting component ranges into point estimates", () => {
    let possession = 0,
      moves = 0;
    for (const file of readdirSync("demo-replays").filter((f) =>
      f.endsWith(".bbr")
    )) {
      const r = analyzeNufflizerInput(
        readFileSync(`demo-replays/${file}`, "utf8")
      );
      possession += r.events.filter((e) => e.possessionBounds).length;
      moves += r.events.filter((e) => e.contextualBounds).length;
      expect(r.coverage.contextEvidence.boundedCount).toBe(
        r.events.filter((e) => e.contextualBounds || e.possessionBounds).length
      );
      expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
      expect(r.verdict.luckierTeam).toBe("unknown");
    }
    expect(possession).toBe(2);
    expect(moves).toBe(10);
  });
});
