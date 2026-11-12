import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import {
  contextComponent,
  summarizeContextComponents
} from "@/domain/nufflizer/contextComponents";
import {
  formatContextComponentSum,
  PARTIAL_CONTEXT_SCOPE
} from "@/domain/nufflizer/presentation";
import type { LuckEvent, LuckReport } from "@/domain/nufflizer/types";
import { contextReplayXml } from "../helpers/contextReplay";

const original = () => analyzeNufflizerInput(contextReplayXml());
// Literal arithmetic examples deliberately don't claim causal-policy admission.
// Full report tests below exercise source-qualified events and Zod admission.
function literal(
  id: string,
  lower: number,
  upper = lower,
  options: {
    point?: boolean;
    team?: string;
    type?: LuckEvent["type"];
    action?: string;
    source?: string;
  } = {}
): LuckEvent {
  return {
    id,
    teamId: options.team ?? "home",
    type: options.type ?? "dodge",
    scoringStatus: "scored",
    metadata: {
      isRollCandidate: true,
      sourceId: options.source ?? id,
      actionId: options.action
    },
    ...(options.point
      ? { contextualImpact: { contribution: lower } }
      : { contextualBounds: { lower, upper } })
  } as LuckEvent;
}
const sum = (events: LuckEvent[]) =>
  summarizeContextComponents(events, ["home", "away"]);
const rational = (s: string) => {
  const [a, b = "1"] = s.split("/");
  return Number(a) / Number(b);
};
const fixture = JSON.parse(
  readFileSync(
    "tests/fixtures/evidence/context-component-arithmetic.json",
    "utf8"
  )
) as {
  cases: {
    file: string;
    eventId: string;
    sourceId: string;
    actionId: string;
    teamId: string;
    type: string;
    lower: string;
    upper: string;
  }[];
  files: {
    file: string;
    sha256: string;
    teams: {
      teamId: string;
      componentCount: number;
      pointCount: number;
      boundedCount: number;
      bounds: { lower: string; upper: string } | null;
      byCategory: { type: string; eventIds: string[] }[];
      byAction: { actionId: string; eventIds: string[] }[];
    }[];
  }[];
};

describe("additive partial component accounting (NUF-019)", () => {
  it("adds independent opportunities, preserves precision and never averages", () => {
    const a = literal("a", -2 / 3, 1 / 6),
      b = literal("b", -2 / 3, 1 / 6);
    expect(sum([a])[0]!.bounds).toEqual({ lower: -2 / 3, upper: 1 / 6 });
    expect(sum([a, b])[0]).toMatchObject({
      componentCount: 2,
      pointCount: 0,
      boundedCount: 2,
      bounds: { lower: -4 / 3, upper: 1 / 3 }
    });
    expect(sum([a, b])[0]!.bounds!.lower).not.toBe(-1.33);
  });
  it("does not dilute a component with safe, absent, excluded or nonrandom evidence", () => {
    const a = literal("a", -3, -1),
      safe = literal("safe", 0, 0, { point: true });
    const absent = structuredClone(a);
    absent.id = "absent";
    delete absent.contextualBounds;
    const excluded = structuredClone(a);
    excluded.id = "excluded";
    excluded.scoringStatus = "excluded";
    const deterministic = structuredClone(a);
    deterministic.id = "deterministic";
    deterministic.metadata.isRollCandidate = false;
    const result = sum([a, safe, absent, excluded, deterministic])[0]!;
    expect(result.bounds).toEqual({ lower: -3, upper: -1 });
    expect(result.componentCount).toBe(2);
    expect(result.pointCount).toBe(1);
    expect(result.boundedCount).toBe(1);
  });
  it("distinguishes absent evidence from a supported zero", () => {
    expect(sum([])[0]).toMatchObject({
      componentCount: 0,
      bounds: null,
      byCategory: [],
      byAction: []
    });
    const known = sum([literal("zero", 0, 0, { point: true })])[0]!;
    expect(known).toMatchObject({
      componentCount: 1,
      pointCount: 1,
      boundedCount: 0,
      bounds: { lower: 0, upper: 0 }
    });
    expect(formatContextComponentSum(sum([])[0]!)).toBe(
      "No supported context components"
    );
    expect(formatContextComponentSum(known)).toBe(
      "0.00 to 0.00 provisional context units across 1 reported component"
    );
  });
  it("reconciles mixed point/range events, categories, source actions and owned teams", () => {
    const events = [
      literal("a", -2, 1, { action: "x" }),
      literal("b", 3, 3, { point: true, type: "ball_handling", action: "x" }),
      literal("c", -1, 0, { action: "y" }),
      literal("d", -4, -3, { team: "away", action: "x" })
    ];
    const [home, away] = sum(events);
    expect(home).toMatchObject({
      componentCount: 3,
      pointCount: 1,
      boundedCount: 2,
      bounds: { lower: 0, upper: 4 }
    });
    expect(home!.byCategory.map((c) => [c.type, c.bounds, c.eventIds])).toEqual(
      [
        ["ball_handling", { lower: 3, upper: 3 }, ["b"]],
        ["dodge", { lower: -3, upper: 1 }, ["a", "c"]]
      ]
    );
    expect(
      home!.byAction.map((a) => [a.actionId, a.bounds, a.eventIds])
    ).toEqual([
      ["x", { lower: 1, upper: 4 }, ["a", "b"]],
      ["y", { lower: -1, upper: 0 }, ["c"]]
    ]);
    expect(away!.bounds).toEqual({ lower: -4, upper: -3 });
    for (const team of [home!, away!])
      for (const groups of [team.byCategory, team.byAction]) {
        expect(groups.reduce((n, g) => n + g.componentCount, 0)).toBe(
          team.componentCount
        );
        expect(groups.reduce((n, g) => n + g.bounds!.lower, 0)).toBe(
          team.bounds!.lower
        );
        expect(groups.reduce((n, g) => n + g.bounds!.upper, 0)).toBe(
          team.bounds!.upper
        );
      }
  });
  it("sums dependent intervals conservatively without an independence premise", () => {
    // Shared unknown x: first=x in[0,1], second=2-2x in[0,2].
    // Their true sum is[1,2], inside the deliberately wider interval sum[0,3].
    const combined = sum([literal("a", 0, 1), literal("b", 0, 2)])[0]!.bounds!;
    expect(combined).toEqual({ lower: 0, upper: 3 });
    for (const x of [0, 0.25, 0.5, 0.75, 1]) {
      expect(x + 2 - 2 * x).toBeGreaterThanOrEqual(combined.lower);
      expect(x + 2 - 2 * x).toBeLessThanOrEqual(combined.upper);
    }
    expect(PARTIAL_CONTEXT_SCOPE).toContain("not a whole-match luck range");
    expect(PARTIAL_CONTEXT_SCOPE).toContain(
      "No midpoint or endpoint enters point scores"
    );
  });
  it("counts duplicate event/source summaries once and independent new sources again", () => {
    const a = literal("a", -2, 1),
      copy = structuredClone(a),
      sameSource = literal("other-id", -2, 1, { source: "a" });
    expect(sum([a, copy, sameSource])[0]!.componentCount).toBe(1);
    expect(sum([a, literal("new", -2, 1)])[0]!.bounds).toEqual({
      lower: -4,
      upper: 2
    });
  });
  it("keeps unlinked events individual and preserves recorded action boundaries", () => {
    const groups = sum([
      literal("a", 1),
      literal("b", 2),
      literal("c", 3, 3, { action: "x" }),
      literal("d", 4, 4, { action: "x" }),
      literal("e", 5, 5, { action: "y" })
    ])[0]!.byAction;
    expect(groups.map((g) => [g.actionId, g.eventIds])).toEqual([
      [null, ["a"]],
      [null, ["b"]],
      ["x", ["c", "d"]],
      ["y", ["e"]]
    ]);
  });
  it("does not mutate inputs or let names, future metadata or team ordering change arithmetic", () => {
    const events = [
        literal("a", 1, 2, { action: "x" }),
        literal("b", -1, 1, { team: "away" })
      ],
      before = structuredClone(events),
      expected = sum(events);
    events[0]!.metadata.initialRosterName = "Renamed";
    events[0]!.metadata.sourceIndex = 900;
    expect(sum(events)).toEqual(expected);
    expect(summarizeContextComponents(events, ["away", "home"])).toEqual([
      expected[1],
      expected[0]
    ]);
    delete events[0]!.metadata.initialRosterName;
    delete events[0]!.metadata.sourceIndex;
    expect(events).toEqual(before);
    expect(sum([...events].reverse()).map((t) => t.bounds)).toEqual(
      expected.map((t) => t.bounds)
    );
  });
  it.each(["overlap", "reversed", "nan", "infinite", "unowned"])(
    "withholds invalid %s arithmetic inputs",
    (kind) => {
      const e = literal("a", -1, 1);
      if (kind === "overlap")
        e.contextualImpact = { contribution: 1 } as NonNullable<
          LuckEvent["contextualImpact"]
        >;
      if (kind === "reversed") e.contextualBounds!.lower = 2;
      if (kind === "nan") e.contextualBounds!.lower = NaN;
      if (kind === "infinite") e.contextualBounds!.upper = Infinity;
      if (kind === "unowned") e.teamId = "unknown";
      expect(sum([e])[0]!.bounds).toBeNull();
    }
  );
  it("does not inject a point estimate into interval-only report teams or the verdict", () => {
    const r = analyzeNufflizerInput(
      readFileSync("demo-replays/demo11.bbr", "utf8")
    );
    expect(
      r.contextComponents.map((t) => [t.teamId, t.componentCount])
    ).toEqual([
      ["0", 1],
      ["1", 4]
    ]);
    expect(r.contextComponents[0].bounds).toEqual({ lower: 0, upper: 1 });
    expect(r.contextComponents[1].bounds!.lower).toBeCloseTo(-14 / 3, 12);
    expect(r.contextComponents[1].bounds!.upper).toBe(4);
    expect(
      r.teams.every((t) => t.impactCount === 0 && t.impactScore === 0)
    ).toBe(true);
    expect(r.verdict.luckierTeam).toBe("unknown");
    expect(LuckReportSchema.safeParse(r).success).toBe(true);
  });
  it("keeps existing admitted point totals separately reproducible", () => {
    const r = original(),
      event = r.events.find((e) => e.contextualImpact)!;
    expect(r.contextComponents[0]).toMatchObject({
      componentCount: 1,
      pointCount: 1,
      boundedCount: 0,
      bounds: {
        lower: event.contextualImpact!.contribution,
        upper: event.contextualImpact!.contribution
      }
    });
    expect(r.teams[0].impactScore).toBe(event.contextualImpact!.contribution);
    expect(r.contextComponents[1].bounds).toBeNull();
  });
  it.each([
    "count",
    "point-count",
    "bounded-count",
    "lower",
    "upper",
    "category",
    "category-member",
    "action",
    "action-member",
    "missing",
    "invented-zero",
    "team-order",
    "reverse",
    "overlap",
    "excluded",
    "category-lower",
    "action-upper",
    "duplicate-source",
    "duplicate-team"
  ])("rejects forged %s public accounting without throwing", (kind) => {
    const r = original(),
      c = r.contextComponents[0],
      event = r.events.find((e) => e.contextualImpact)!;
    if (kind === "duplicate-team") r.teams[1].teamId = r.teams[0].teamId;
    if (kind === "count") c.componentCount++;
    if (kind === "point-count") c.pointCount = 0;
    if (kind === "bounded-count") c.boundedCount++;
    if (kind === "lower") c.bounds!.lower--;
    if (kind === "upper") c.bounds!.upper++;
    if (kind === "category") c.byCategory[0]!.type = "injury";
    if (kind === "category-member") c.byCategory[0]!.eventIds = ["invented"];
    if (kind === "action") c.byAction[0]!.actionId = "invented";
    if (kind === "action-member") c.byAction[0]!.eventIds.push(event.id);
    if (kind === "missing") c.byAction = [];
    if (kind === "invented-zero")
      r.contextComponents[1].bounds = { lower: 0, upper: 0 };
    if (kind === "team-order") r.contextComponents.reverse();
    if (kind === "reverse") {
      c.bounds!.lower = 10;
      c.bounds!.upper = -10;
    }
    if (kind === "overlap")
      event.contextualBounds = { lower: 0, upper: 1 } as NonNullable<
        LuckEvent["contextualBounds"]
      >;
    if (kind === "excluded") event.scoringStatus = "excluded";
    if (kind === "category-lower") c.byCategory[0]!.bounds!.lower--;
    if (kind === "action-upper") c.byAction[0]!.bounds!.upper++;
    if (kind === "duplicate-source") {
      const copy = structuredClone(event);
      copy.id = "duplicate-id";
      r.events.push(copy);
    }
    let accepted = true;
    expect(() => {
      accepted = LuckReportSchema.safeParse(r).success;
    }).not.toThrow();
    expect(accepted).toBe(false);
  });
  it("is insensitive to JSON object property order", () => {
    const r = original();
    r.contextComponents = JSON.parse(
      JSON.stringify(r.contextComponents, (key, value) =>
        key === "bounds" && value
          ? { upper: value.upper, lower: value.lower }
          : value
      )
    );
    expect(LuckReportSchema.safeParse(r).success).toBe(true);
  });
});

describe("independent exact arithmetic over 24-component specification", () => {
  it("regenerates with Fraction without importing the application", () => {
    const result = spawnSync(
      "python3",
      ["scripts/verify-context-component-arithmetic.py", "--check"],
      { encoding: "utf8" }
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });
  it.each(fixture.files)(
    "reconciles $file source membership and exact team/category/action sums",
    ({ file, sha256, teams }) => {
      const source = readFileSync(`demo-replays/${file}`);
      expect(createHash("sha256").update(source).digest("hex")).toBe(sha256);
      const r = analyzeNufflizerInput(source.toString()),
        rows = fixture.cases.filter((c) => c.file === file);
      expect(r.events.filter((e) => contextComponent(e))).toHaveLength(
        rows.length
      );
      for (const row of rows) {
        const e = r.events.find((e) => e.id === row.eventId)!;
        expect(e).toMatchObject({
          teamId: row.teamId,
          type: row.type,
          metadata: { sourceId: row.sourceId, actionId: row.actionId }
        });
        expect(contextComponent(e)!.bounds.lower).toBeCloseTo(
          rational(row.lower),
          12
        );
        expect(contextComponent(e)!.bounds.upper).toBeCloseTo(
          rational(row.upper),
          12
        );
      }
      for (const t of teams) {
        const actual = r.contextComponents.find((a) => a.teamId === t.teamId)!;
        expect(actual.componentCount).toBe(t.componentCount);
        expect(actual.pointCount).toBe(0);
        expect(actual.boundedCount).toBe(t.boundedCount);
        if (t.bounds) {
          expect(actual.bounds!.lower).toBeCloseTo(
            rational(t.bounds.lower),
            12
          );
          expect(actual.bounds!.upper).toBeCloseTo(
            rational(t.bounds.upper),
            12
          );
        } else expect(actual.bounds).toBeNull();
        expect(
          actual.byCategory.map((g) => ({ type: g.type, eventIds: g.eventIds }))
        ).toEqual(
          t.byCategory.map((g) => ({ type: g.type, eventIds: g.eventIds }))
        );
        expect(
          actual.byAction.map((g) => ({
            actionId: g.actionId,
            eventIds: g.eventIds
          }))
        ).toEqual(
          t.byAction.map((g) => ({
            actionId: g.actionId,
            eventIds: g.eventIds
          }))
        );
        for (const groups of [actual.byCategory, actual.byAction]) {
          expect(groups.reduce((n, g) => n + g.componentCount, 0)).toBe(
            actual.componentCount
          );
          if (actual.bounds) {
            expect(groups.reduce((n, g) => n + g.bounds!.lower, 0)).toBeCloseTo(
              actual.bounds.lower,
              12
            );
            expect(groups.reduce((n, g) => n + g.bounds!.upper, 0)).toBeCloseTo(
              actual.bounds.upper,
              12
            );
          }
        }
      }
    }
  );
  it("CLI states the scope and exports exactly the same component accounting", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "src/cli/nufflizier.ts",
        "analyze",
        "demo-replays/demo11.bbr",
        "--format",
        "text"
      ],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      "-4.67 to 4.00 provisional context units across 4 reported components"
    );
    expect(result.stdout).toContain("not a whole-match luck range");
    expect(result.stdout).toContain("Source action sequence-137-step-2");
    const json = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "src/cli/nufflizier.ts",
        "analyze",
        "demo-replays/demo11.bbr",
        "--format",
        "json"
      ],
      { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }
    );
    expect(json.status, json.stderr).toBe(0);
    const r = JSON.parse(json.stdout) as LuckReport;
    expect(LuckReportSchema.safeParse(r).success).toBe(true);
    expect(r.contextComponents[1].componentCount).toBe(4);
    expect(r.teams[1].impactCount).toBe(0);
  });
});
