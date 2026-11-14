import { describe, it, expect } from "vitest";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { formatExpectedOutcome } from "@/domain/nufflizer/presentation";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { throwTeamMateXml, type ThrowFragment } from "../helpers/throwTeamMate";
const parse = (
  edit?: Parameters<typeof throwTeamMateXml>[0],
  roster?: Parameters<typeof throwTeamMateXml>[1]
) =>
  parseReplayXml(throwTeamMateXml(edit, roster), { omitRawReplaySteps: true });
const analyze = (...args: Parameters<typeof parse>) => {
  const r = analyzeReplayLuck(parse(...args));
  expect(LuckReportSchema.safeParse(r).success).toBe(true);
  return r;
};
const events = (r: ReturnType<typeof parse>) =>
  r.turns.flatMap((t) => t.events);
const choice = (r: ReturnType<typeof analyze>) =>
  r.rerollResources.decisions[0]!;
const nonrandom = (r: ReturnType<typeof analyze>) => {
  for (const e of r.events.filter((e) => e.metadata.stepType === 13))
    expect(e).toMatchObject({
      scoringStatus: "excluded",
      weightedDelta: 0,
      probabilitySuccess: null
    });
};
const headerGuards: [string, (h: ThrowFragment["header"]) => void][] = [
  [
    "missing thrower",
    (h) => {
      delete h.ThrowerId;
    }
  ],
  [
    "missing mate",
    (h) => {
      delete h.ThrownMateId;
    }
  ],
  [
    "ordinary PlayerId alias",
    (h) => {
      h.PlayerId = ["37"];
    }
  ],
  [
    "ordinary TargetId alias",
    (h) => {
      h.TargetId = ["50"];
    }
  ],
  [
    "same participant",
    (h) => {
      h.ThrownMateId = ["37"];
    }
  ],
  [
    "negative participant",
    (h) => {
      h.ThrowerId = ["-1"];
    }
  ],
  [
    "fractional participant",
    (h) => {
      h.ThrowerId = ["37.5"];
    }
  ],
  [
    "unknown state",
    (h) => {
      h.State = ["2"];
    }
  ],
  [
    "evaluation",
    (h) => {
      h.IsEvaluation = ["1"];
    }
  ],
  [
    "different step",
    (h) => {
      h.StepType = ["4"];
    }
  ],
  [
    "unknown skill",
    (h) => {
      h.Skill = ["64"];
    }
  ],
  [
    "unknown header",
    (h) => {
      h.Future = ["1"];
    }
  ],
  [
    "missing from",
    (h) => {
      delete h.CellFrom;
    }
  ],
  [
    "off-pitch from",
    (h) => {
      h.CellFrom = [{ X: ["26"], Y: ["7"] }];
    }
  ],
  [
    "missing to",
    (h) => {
      delete h.CellTo;
    }
  ],
  [
    "invalid probability",
    (h) => {
      h.Probability = ["101"];
    }
  ]
];
describe("Throw Team-mate source and report guards", () => {
  it("links serialized roles and keeps all physical observations unscored", () => {
    const r = analyze();
    expect(choice(r)).toMatchObject({ status: "linked", teamId: "1" });
    expect(r.events.filter((e) => e.metadata.throwTeamMate)).toHaveLength(11);
    nonrandom(r);
  });
  it.each(headerGuards)("withholds inherited roles for %s", (_, edit) => {
    const p = parse((rows) => rows.forEach((r) => edit(r.header)));
    for (const e of events(p)) {
      expect(e.throwTeamMate).toBeUndefined();
      expect(e.stepActorId).toBeUndefined();
      expect(e.stepTargetId).toBeUndefined();
    }
    const r = analyzeReplayLuck(p);
    expect(choice(r).status).toBe("unresolved");
    nonrandom(r);
  });
  it("withholds the new reader for an unverified replay version", () => {
    expect(() =>
      parseReplayXml(throwTeamMateXml().replace("1-4-0-0", "1-5-0-0"))
    ).toThrow("Unsupported replay version");
    const p = parse();
    p.replayVersion = "1-5-0-0";
    expect(choice(analyzeReplayLuck(p)).status).toBe("unresolved");
  });
  it.each(["PlayerId", "TargetId"])(
    "does not override a contradictory explicit %s",
    (key) => {
      const p = parse((rows) => {
        rows[1]!.messages[3]!.payload[key] = ["999"];
      });
      const e = events(p).find(
        (e) => e.sourceTag === "ResultRoll" && e.payload?.RollType === 41
      )!;
      expect(e.throwTeamMate).toBeUndefined();
      expect(e.stepActorId).toBeUndefined();
      expect(e[key === "PlayerId" ? "playerId" : "targetId"]).toBe("999");
    }
  );
  it("keeps another explicit skill holder distinct from the thrower", () => {
    const r = analyze((rows) => {
      rows[0]!.messages[0]!.payload.PlayerId = ["1"];
    });
    const e = r.events.find((e) => e.metadata.throwTeamMate?.holderId === "1")!;
    expect(e).toMatchObject({
      playerId: "1",
      teamId: "0",
      metadata: {
        throwTeamMate: {
          throwerId: "37",
          thrownMateId: "50",
          role: "skill_holder"
        },
        ownership: { role: "actor", playerId: "1", teamId: "0" }
      }
    });
    nonrandom(r);
  });
  it.each([0, 1, 2])(
    "does not treat unknown roll family/tag/deep dice variant %i as the thrower",
    (variant) => {
      const p = parse((rows) => {
        const m = rows[0]!.messages[1]!;
        if (variant === 0) m.payload.RollType = ["999"];
        if (variant === 1) m.tag = "FutureThrowResult";
        if (variant === 2)
          m.payload.Modifiers = [{ Modifier: [{ Dice: ["6"] }] }];
      });
      const e = events(p).find((e) => e.locator?.messageIndex === 1)!;
      expect(e.throwTeamMate).toBeUndefined();
      expect(e.stepActorId).toBeUndefined();
    }
  );
  it.each(["missing Dice", "null Dice", "scalar Dice", "unknown die field"])(
    "withholds a malformed roll role for %s",
    (kind) => {
      const edit: Parameters<typeof throwTeamMateXml>[0] = (rows) => {
        const roll = rows[0]!.messages[1]!.payload;
        if (kind === "missing Dice") delete roll.Dice;
        if (kind === "null Dice") roll.Dice = null;
        if (kind === "scalar Dice") roll.Dice = "6";
        if (kind === "unknown die field")
          roll.Dice = [
            { Die: [{ DieType: ["0"], Value: ["5"], Future: ["1"] }] }
          ];
      };
      if (kind !== "unknown die field") {
        expect(() => parse(edit)).toThrow("Invalid ResultRoll");
        const p = parse();
        const e = events(p).find((e) => e.sourceTag === "ResultRoll")!;
        delete e.payload!.Dice;
        const report = analyzeReplayLuck(p);
        expect(
          report.events.find((r) => r.metadata.sourceId === e.id)!.metadata
            .throwTeamMate
        ).toBeUndefined();
        expect(LuckReportSchema.safeParse(report).success).toBe(true);
        return;
      }
      const p = parse(edit);
      expect(
        events(p).find((e) => e.locator?.messageIndex === 1)!.throwTeamMate
      ).toBeUndefined();
      expect(LuckReportSchema.safeParse(analyzeReplayLuck(p)).success).toBe(
        true
      );
    }
  );
  it.each(["PlayerId", "TargetId"])(
    "withholds roles on contradictory original-question %s",
    (key) => {
      const r = analyze((rows) => {
        const infos = rows[0]!.messages[3]!.payload.RollInfos as {
          [key: string]: unknown;
        }[];
        infos[0]![key] = ["999"];
      });
      expect(
        r.events.find(
          (e) => e.metadata.sourceTag === "QuestionTeamRerollUsage"
        )!.metadata.throwTeamMate
      ).toBeUndefined();
      expect(choice(r).status).toBe("unresolved");
    }
  );
  it.each(["question", "choice"])(
    "withholds inherited roles for a nested-dice %s flag",
    (kind) => {
      const edit: Parameters<typeof throwTeamMateXml>[0] = (rows) => {
        const m =
          kind === "question" ? rows[0]!.messages[3]! : rows[1]!.messages[0]!;
        m.payload.GamerId = [
          { Dice: [{ Die: [{ DieType: ["0"], Value: ["6"] }] }] }
        ];
      };
      expect(() => parse(edit)).toThrow("Invalid numeric GamerId");
      const tag =
        kind === "question"
          ? "QuestionTeamRerollUsage"
          : "ResultTeamRerollUsage";
      const p = parse();
      events(p).find((e) => e.sourceTag === tag)!.payload!.GamerId = {
        Dice: { Die: { DieType: 0, Value: 6 } }
      };
      const r = analyzeReplayLuck(p);
      expect(LuckReportSchema.safeParse(r).success).toBe(true);
      expect(
        r.events.find((e) => e.metadata.sourceTag === tag)!.metadata
          .throwTeamMate
      ).toBeUndefined();
      expect(choice(r).status).toBe("unresolved");
    }
  );
  it.each(["missing mate", "opposing mate", "duplicate mate"])(
    "requires a unique same-roster %s for resources",
    (kind) => {
      const r = analyze(undefined, (teams) => {
        teams[1] = [37];
        if (kind === "opposing mate") teams[0]!.push(50);
        if (kind === "duplicate mate") teams[1]!.push(50, 50);
      });
      expect(choice(r).status).toBe("unresolved");
      nonrandom(r);
    }
  );
  it.each(["GamerId", "Used"])(
    "does not default an absent choice %s to zero",
    (key) => {
      const r = analyze((rows) => {
        delete rows[1]!.messages[0]!.payload[key];
      });
      expect(choice(r).status).toBe("unresolved");
    }
  );
  it("records non-use rather than a second random draw", () => {
    const r = analyze((rows) => {
      rows[1]!.messages[0]!.payload.Used = ["0"];
    });
    expect(choice(r)).toMatchObject({ status: "linked" });
    expect(
      r.events.find((e) => e.metadata.recordedRerollChoice)!.metadata
        .recordedRerollChoice!.used
    ).toBe(false);
    nonrandom(r);
  });
  it.each(["from", "pair", "state", "gamer"])(
    "refuses a changed continuation %s",
    (kind) => {
      const r = analyze((rows) => {
        if (kind === "from")
          rows[1]!.header.CellFrom = [{ X: ["12"], Y: ["7"] }];
        if (kind === "pair") rows[1]!.header.ThrownMateId = ["1"];
        if (kind === "state") rows[1]!.header.State = ["1"];
        if (kind === "gamer") rows[1]!.messages[0]!.payload.GamerId = ["0"];
      });
      expect(choice(r).status).toBe("unresolved");
    }
  );
  it("does not use future destination or gate/replacement faces to establish earlier source roles", () => {
    const a = analyze(),
      b = analyze((rows) => {
        rows[1]!.header.CellTo = [{ X: ["-1"], Y: ["15"] }];
        for (const m of rows[1]!.messages)
          if (
            m.tag === "ResultRoll" &&
            (m.payload.RollType as string[] | undefined)?.[0] !== "26"
          )
            m.payload.Dice = [{ Die: [{ DieType: ["0"], Value: ["6"] }] }];
      });
    expect(choice(b)).toEqual(choice(a));
    const roles = (r: typeof a) =>
      r.events
        .filter((e) => e.metadata.throwTeamMate)
        .map((e) => e.metadata.throwTeamMate);
    expect(roles(b)).toEqual(roles(a));
    nonrandom(b);
  });
  it.each(["index", "id", "payload", "duplicate"])(
    "rechecks stale derived annotations when header %s changes",
    (kind) => {
      const p = parse(),
        h = events(p).find((e) => e.sourceTag === "ThrowTeamMateStep")!;
      if (kind === "index") delete h.sourceIndex;
      if (kind === "id") h.id = "forged-header";
      if (kind === "payload") delete h.payload!.ThrownMateId;
      if (kind === "duplicate") p.turns[0]!.events.push(structuredClone(h));
      const before = structuredClone(p);
      const r = analyzeReplayLuck(p);
      expect(p).toEqual(before);
      expect(choice(r).status).toBe("unresolved");
      nonrandom(r);
    }
  );
  it.each([false, true])(
    "withholds a current-roster resource namespace when boards are absent (explicit actor team=%s)",
    (explicit) => {
      const p = parse();
      p.boardCheckpoints = [];
      if (explicit)
        for (const e of events(p)) {
          e.actorTeamId = "1";
          e.actorTeamSource = "explicit";
        }
      const before = structuredClone(p),
        r = analyzeReplayLuck(p);
      expect(p).toEqual(before);
      expect(LuckReportSchema.safeParse(r).success).toBe(true);
      expect(choice(r)).toMatchObject({
        status: "unresolved",
        teamId: null,
        namespace: null
      });
      nonrandom(r);
    }
  );
  it("leaves an original question die physical even though the question row is a control", () => {
    const r = analyze(),
      q = r.events.find(
        (e) => e.metadata.sourceTag === "QuestionTeamRerollUsage"
      )!;
    expect(q.metadata.isRollCandidate).toBe(false);
    expect(formatExpectedOutcome(q)).toBe("Unknown");
    expect(
      r.diceRecords.filter((d) => d.parentSourceId === q.metadata.sourceId)
    ).toMatchObject([
      {
        path: ["RollInfos", "Dice"],
        dice: [{ value: 4, dieType: 0 }],
        stepActorId: "37",
        stepTargetId: "50"
      }
    ]);
  });
});

describe("exported Throw Team-mate graph", () => {
  const base = analyze();
  type Report = typeof base;
  const role = (r: Report, which = "thrower") =>
    r.events.find((e) => e.metadata.throwTeamMate?.role === which)!;
  const mutations: [string, (r: Report) => void][] = [
    [
      "header source",
      (r) => {
        role(r).metadata.throwTeamMate!.headerSourceId = "source-missing";
      }
    ],
    [
      "header source index",
      (r) => {
        role(r).metadata.throwTeamMate!.headerSourceIndex++;
      }
    ],
    [
      "same actor and target",
      (r) => {
        role(r).metadata.throwTeamMate!.thrownMateId = "37";
      }
    ],
    [
      "wrong actor",
      (r) => {
        role(r).playerId = "50";
      }
    ],
    [
      "wrong skill holder",
      (r) => {
        role(r, "skill_holder").metadata.throwTeamMate!.holderId = "50";
      }
    ],
    [
      "wrong skill decision",
      (r) => {
        role(r, "skill_holder").metadata.throwTeamMate!.used = false;
      }
    ],
    [
      "role on non-random header",
      (r) => {
        role(r, "header").metadata.throwTeamMate!.role = "thrower";
      }
    ],
    [
      "header original and continuation state",
      (r) => {
        role(r).metadata.throwTeamMate!.state = 3;
      }
    ],
    [
      "different from cell",
      (r) => {
        role(r).metadata.throwTeamMate!.headerCellFrom.x++;
      }
    ],
    [
      "message source order",
      (r) => {
        role(r).metadata.locator!.messageIndex!++;
      }
    ],
    [
      "physical thrower",
      (r) => {
        r.diceRecords.find((d) => d.stepType === 13)!.stepActorId = "50";
      }
    ],
    [
      "physical target",
      (r) => {
        r.diceRecords.find((d) => d.stepType === 13)!.stepTargetId = "37";
      }
    ],
    [
      "added odds",
      (r) => {
        role(r).probabilitySuccess = 0.5;
      }
    ],
    [
      "added score",
      (r) => {
        role(r).scoringStatus = "scored";
        role(r).weightedDelta = 1;
      }
    ],
    [
      "added weight",
      (r) => {
        role(r).explainability.weight = 1;
      }
    ],
    [
      "missing role on linked gated replacement",
      (r) => {
        delete r.events.find((e) => e.metadata.teamDiceIdentity)!.metadata
          .throwTeamMate;
      }
    ],
    [
      "coherently changed pair without physical source agreement",
      (r) => {
        for (const e of r.events)
          if (e.metadata.throwTeamMate) {
            e.metadata.throwTeamMate.thrownMateId = "51";
            e.metadata.targetId = "51";
          }
      }
    ],
    [
      "coherently changed continuation from",
      (r) => {
        for (const e of r.events)
          if (e.metadata.throwTeamMate?.state === 3)
            e.metadata.throwTeamMate.headerCellFrom.x++;
      }
    ],
    [
      "missing same-roster mate in resource checkpoint",
      (r) => {
        const d = choice(r),
          ns = d.namespace;
        if (ns?.basis !== "observed_roster")
          throw Error("missing observed namespace");
        const cp = r.rerollResources.flow.clockSnapshots.find(
          (c) => c.source.checkpointAfter === ns.checkpointAfter
        )!;
        cp.playerIds[1] = cp.playerIds[1]!.filter((id) => String(id) !== "50");
      }
    ]
  ];
  it.each(mutations)("rejects %s", (_, mutate) => {
    const r = structuredClone(base);
    mutate(r);
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
});
