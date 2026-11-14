import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  preservesTraitContinuity,
  scopedTraitEffectPlayer
} from "@/domain/replay/traitTransitions";
import { findBlockTraitEvidence } from "@/domain/replay/traitContinuity";
import { observeBoardCheckpoint } from "@/domain/replay/boardState";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { model, rollEvent } from "../helpers/replay";
import type { ReplayEvent } from "@/domain/replay/types";

type Locator = {
  replayStep: number | null;
  childIndex: number | null;
  stepIndex?: number | null;
  messageIndex?: number | null;
};
type RawPlayer = {
  rosterIndex: number;
  player: {
    Id: number;
    Data: {
      Id: number;
      TeamId: number | null;
      IdPlayerTypes: number;
      InnateSkills: "" | { InnateSkillsItem: number | number[] } | null;
      AcquiredSkills: "" | { AcquiredSkillsItem: number | number[] } | null;
    };
    Effects: unknown;
  };
};
const facts = JSON.parse(
  readFileSync("tests/fixtures/evidence/bb3-trait-transitions.json", "utf8")
) as {
  files: {
    file: string;
    sha256: string;
    seeds: RawPlayer[];
    refreshes: { locator: Locator; players: RawPlayer[] }[];
    transitions: {
      locator: Locator;
      tag: string;
      payload: Record<string, unknown>;
    }[];
    pools: {
      locator: Locator;
      checkpoint: Locator;
      actor: string;
      target: string;
      participants: RawPlayer[];
    }[];
  }[];
};
const arithmetic = JSON.parse(
  readFileSync("tests/fixtures/evidence/block-skill-arithmetic.json", "utf8")
).cases as {
  attackerSkills: number[];
  defenderSkills: number[];
  faces: number[];
  rolledIndexes: number[];
  attackerChooses: boolean;
  wrestlePolicy: string;
  faceOutcomes: number[];
  distribution: string[];
  expectedValue: string;
  positiveChance: string;
}[];
const fraction = (s: string) => {
  const [n, d = "1"] = s.split("/");
  return Number(n) / Number(d);
};
const location = (v: Locator) =>
  [
    v.replayStep,
    v.childIndex,
    v.stepIndex ?? null,
    v.messageIndex ?? null
  ].join(":");
const list = (v: unknown, key: string): number[] | null =>
  v === ""
    ? []
    : v && typeof v === "object"
      ? [(v as Record<string, number | number[]>)[key]].flat()
      : null;
function state(complete: boolean) {
  return {
    Effects: "",
    CurrentPhase: 5,
    ActiveTeam: 0,
    ListTeams: {
      TeamState: [0, 1].map((i) => ({
        Data: { TeamId: i },
        Effects: "",
        TransformedPlayers: "",
        ActivePrayers: "",
        ListPitchPlayers: {
          PlayerState: {
            Id: i ? 7 : 42,
            Effects: "",
            TackleZone: 1,
            Cell: { X: i ? 6 : 5, Y: 5 },
            ...(complete
              ? {
                  Data: {
                    Id: i ? 7 : 42,
                    TeamId: i,
                    IdPlayerTypes: 8,
                    InnateSkills: "",
                    AcquiredSkills: ""
                  }
                }
              : {})
          }
        }
      }))
    }
  };
}
function replay(e: Partial<ReplayEvent>) {
  const r = model([
    rollEvent({ id: "transition", sourceIndex: 2, ...e }),
    rollEvent({
      id: "pool",
      sourceIndex: 5,
      sourceTag: "QuestionBlockDice",
      stepTag: "PlayerStep",
      stepType: 6,
      stepActorId: "42",
      stepTargetId: "7",
      targetId: "7"
    })
  ]);
  r.boardCheckpoints = [
    observeBoardCheckpoint(state(true), "1-4-0-0", {
      kind: "initial",
      afterSourceIndex: 0,
      replayStep: null,
      childIndex: null
    }),
    observeBoardCheckpoint(state(false), "1-4-0-0", {
      kind: "board",
      afterSourceIndex: 3,
      replayStep: 1,
      childIndex: 0
    })
  ];
  return r;
}
const mental = () => ({
  EffectId: 44,
  ProviderType: 4,
  ProviderId: 31,
  Durations: { DurationsItem: [6, 1] },
  CharacModifiers: ""
});
describe("intrinsic traits across source-qualified non-transforming transitions", () => {
  it.each(
    [10, 31, 35, 36, 51, 56].flatMap((Skill) =>
      [0, 1].map((Used) => ({ Skill, Used }))
    )
  )(
    "keeps learned lists through skill $Skill / used $Used without creating snapshot Data",
    ({ Skill, Used }) => {
      const r = replay({
          sourceTag: "ResultSkillUsage",
          payload: { PlayerId: 42, Skill, Used }
        }),
        before = JSON.stringify(r);
      const p = findBlockTraitEvidence(r).get("pool")!;
      expect(p.attacker.traits).toEqual({
        dataPlayerId: 42,
        playerTypeId: 8,
        innateSkills: [],
        acquiredSkills: []
      });
      expect(
        r.boardCheckpoints![1]!.board!.teams[0]!.players[0]!.traits
      ).toBeNull();
      expect(JSON.stringify(r)).toBe(before);
    }
  );
  it.each([2, "2", [2, 7], ["2", "7"]])(
    "keeps intrinsic lists across explicitly empty-pitch-roll stunned reset %j",
    (PlayersItem) => {
      expect(
        findBlockTraitEvidence(
          replay({
            sourceTag: "EventFaceUpStunnedPlayers",
            payload: { PitchRolls: "", Players: { PlayersItem } }
          })
        ).size
      ).toBe(1);
    }
  );
  it("does not confuse awarded experience with an in-match skill change", () => {
    expect(
      findBlockTraitEvidence(
        replay({
          sourceTag: "ResultGainSpp",
          payload: { PlayerId: 42, SppGained: 3 }
        })
      ).size
    ).toBe(1);
  });
  it.each(["EventAddPlayerEffect", "EventEndPlayerEffect"])(
    "scopes %s to its explicit mental-effect holder and never restores that holder",
    (sourceTag) => {
      for (const PlayerId of [42, "42", 99, "99"]) {
        const e = { sourceTag, payload: { PlayerId, Effect: mental() } },
          r = replay(e);
        expect(scopedTraitEffectPlayer(rollEvent(e))).toBe(String(PlayerId));
        expect(findBlockTraitEvidence(r).size).toBe(
          Number(String(PlayerId) !== "42")
        );
      }
    }
  );
  const invalid: [string, Partial<ReplayEvent>][] = [
    [
      "old-passive-extra-field",
      {
        sourceTag: "ResultSkillUsage",
        payload: { PlayerId: 42, Skill: 6, Used: 1, Skills: "" }
      }
    ],
    [
      "old-passive-null-decision",
      {
        sourceTag: "ResultSkillUsage",
        payload: { PlayerId: 42, Skill: 6, Used: null }
      }
    ],
    [
      "old-passive-missing-holder",
      { sourceTag: "ResultSkillUsage", payload: { Skill: 6, Used: 1 } }
    ],
    [
      "unknown-skill",
      {
        sourceTag: "ResultSkillUsage",
        payload: { PlayerId: 42, Skill: 999, Used: 1 }
      }
    ],
    [
      "skill-extra-field",
      {
        sourceTag: "ResultSkillUsage",
        payload: {
          PlayerId: 42,
          Skill: 31,
          Used: 1,
          AdditionalSkills: { AdditionalSkillsItem: 30 }
        }
      }
    ],
    [
      "skill-missing-holder",
      { sourceTag: "ResultSkillUsage", payload: { Skill: 31, Used: 1 } }
    ],
    [
      "skill-fractional-holder",
      {
        sourceTag: "ResultSkillUsage",
        payload: { PlayerId: 42.5, Skill: 31, Used: 1 }
      }
    ],
    [
      "skill-null-decision",
      {
        sourceTag: "ResultSkillUsage",
        payload: { PlayerId: 42, Skill: 31, Used: null }
      }
    ],
    [
      "skill-conflict",
      {
        sourceTag: "ResultSkillUsage",
        payload: { PlayerId: 42, Skill: 31, Used: 1 },
        attributionConflict: true
      }
    ],
    [
      "spp-negative",
      { sourceTag: "ResultGainSpp", payload: { PlayerId: 42, SppGained: -1 } }
    ],
    [
      "spp-extra-skill",
      {
        sourceTag: "ResultGainSpp",
        payload: { PlayerId: 42, SppGained: 3, Skill: 30 }
      }
    ],
    ["spp-missing", { sourceTag: "ResultGainSpp", payload: { PlayerId: 42 } }],
    ...[
      undefined,
      {},
      "",
      { PlayersItem: [] },
      { PlayersItem: [2, 2] },
      { PlayersItem: [2, "2"] },
      { PlayersItem: -1 },
      { PlayersItem: "2x" },
      { PlayersItem: null },
      { PlayersItem: "9007199254740992" },
      { PlayersItem: Array.from({ length: 65 }, (_, i) => i) },
      { PlayersItem: 2, Unknown: 1 }
    ].map(
      (Players, i) =>
        [
          `invalid-reset-list-${i}`,
          {
            sourceTag: "EventFaceUpStunnedPlayers",
            payload: { PitchRolls: "", Players }
          }
        ] as [string, Partial<ReplayEvent>]
    ),
    [
      "reset-random-pitch-roll",
      {
        sourceTag: "EventFaceUpStunnedPlayers",
        payload: {
          PitchRolls: { Die: { Value: 1 } },
          Players: { PlayersItem: 2 }
        }
      }
    ],
    [
      "reset-omitted-pitch-roll",
      {
        sourceTag: "EventFaceUpStunnedPlayers",
        payload: { Players: { PlayersItem: 2 } }
      }
    ],
    [
      "reset-extra-field",
      {
        sourceTag: "EventFaceUpStunnedPlayers",
        payload: { PitchRolls: "", Players: { PlayersItem: 2 }, Skills: "" }
      }
    ],
    ...[
      { EffectId: 12 },
      { AdditionalSkills: { AdditionalSkillsItem: 30 } },
      { CharacModifiers: { Value: 1 } },
      { ProviderId: 99 },
      { Durations: { DurationsItem: [6] } },
      { Unknown: 1 }
    ].map(
      (change, i) =>
        [
          `unknown-effect-${i}`,
          {
            sourceTag: "EventEndPlayerEffect",
            payload: { PlayerId: 99, Effect: { ...mental(), ...change } }
          }
        ] as [string, Partial<ReplayEvent>]
    ),
    [
      "effect-missing-holder",
      { sourceTag: "EventEndPlayerEffect", payload: { Effect: mental() } }
    ],
    [
      "effect-extra-field",
      {
        sourceTag: "EventEndPlayerEffect",
        payload: { PlayerId: 99, Effect: mental(), Global: true }
      }
    ],
    [
      "effect-conflict",
      {
        sourceTag: "EventEndPlayerEffect",
        payload: { PlayerId: 99, Effect: mental() },
        attributionConflict: true
      }
    ]
  ];
  it.each(invalid)("retains the %s barrier", (_name, e) =>
    expect(findBlockTraitEvidence(replay(e)).size).toBe(0)
  );
  it("does not carry physical eligibility or recover a deleted seed from a later empty effect", () => {
    const r = replay({
      sourceTag: "ResultSkillUsage",
      payload: { PlayerId: 42, Skill: 31, Used: 1 }
    });
    const p = r.boardCheckpoints![1]!.board!.teams[0]!.players[0]!;
    p.effectsKnownEmpty = false;
    expect(findBlockTraitEvidence(r).size).toBe(0);
    p.effectsKnownEmpty = true;
    r.boardCheckpoints!.shift();
    expect(findBlockTraitEvidence(r).size).toBe(0);
  });
  it("reproduces the independently extracted raw transition/roster evidence", () => {
    const p = spawnSync(
      "python3",
      ["scripts/extract-trait-transition-evidence.py", "--check"],
      { encoding: "utf8" }
    );
    expect(p.status, p.stdout + p.stderr).toBe(0);
  });
  it.each(facts.files)(
    "joins every $file source transition and continued block participant to raw facts",
    (f) => {
      const input = readFileSync(`demo-replays/${f.file}`);
      expect(createHash("sha256").update(input).digest("hex")).toBe(f.sha256);
      const replay = parseReplayXml(decodeReplayInput(input.toString()).xml, {
          omitRawReplaySteps: true
        }),
        report = LuckReportSchema.parse(analyzeReplayLuck(replay));
      const events = new Map(
        replay.turns
          .flatMap((t) => t.events)
          .filter((e) => e.locator)
          .map((e) => [location(e.locator as Locator), e])
      );
      for (const t of f.transitions) {
        const e = events.get(location(t.locator))!;
        expect(e?.sourceTag).toBe(t.tag);
        // Direct payload strings and encoded numeric scalars are distinct parser forms.
        const canonical = (v: unknown): unknown =>
          typeof v === "string" && /^-?(0|[1-9]\d*)$/.test(v)
            ? Number(v)
            : Array.isArray(v)
              ? v.map(canonical)
              : v && typeof v === "object"
                ? Object.fromEntries(
                    Object.entries(v).map(([k, x]) => [k, canonical(x)])
                  )
                : v;
        expect(canonical(e.payload)).toEqual(t.payload);
        if (
          t.tag === "ResultSkillUsage" ||
          t.tag === "ResultGainSpp" ||
          t.tag === "EventFaceUpStunnedPlayers"
        )
          expect(preservesTraitContinuity(e)).toBe(true);
        else if (
          t.payload.Effect &&
          (t.payload.Effect as { EffectId?: number }).EffectId === 44 &&
          [31, 51].includes(
            (t.payload.Effect as { ProviderId: number }).ProviderId
          )
        )
          expect(scopedTraitEffectPlayer(e)).toBe(String(t.payload.PlayerId));
        else expect(scopedTraitEffectPlayer(e)).toBeUndefined();
      }
      let count = 0;
      for (const e of report.events) {
        if (!e.metadata.block?.traitEvidence) continue;
        count++;
        const pool = f.pools.find(
          (p) => location(p.locator) === location(e.metadata.locator as Locator)
        )!;
        expect(pool).toBeDefined();
        for (const proof of Object.values(e.metadata.block.traitEvidence)) {
          const seededAt = replay.boardCheckpoints!.find(
            (c) => c.afterSourceIndex === proof.observedCheckpointAfter
          )!;
          const seeds =
            proof.observedCheckpointAfter === 0
              ? f.seeds
              : f.refreshes.find(
                  (c) => location(c.locator) === location(seededAt)
                )!.players;
          const seed = seeds.find(
            (s) =>
              String(s.player.Id) === proof.playerId &&
              s.rosterIndex === proof.rosterIndex
          )!;
          expect(proof.traits).toEqual({
            dataPlayerId: seed.player.Data.Id,
            playerTypeId: seed.player.Data.IdPlayerTypes,
            innateSkills: list(
              seed.player.Data.InnateSkills,
              "InnateSkillsItem"
            ),
            acquiredSkills: list(
              seed.player.Data.AcquiredSkills,
              "AcquiredSkillsItem"
            )
          });
          const current = pool.participants.find(
            (p) => String(p.player.Id) === proof.playerId
          )!;
          expect(current.rosterIndex).toBe(proof.rosterIndex);
          expect(current.player.Effects).toBe("");
          const cp = replay.boardCheckpoints!.find(
            (c) => c.afterSourceIndex === proof.currentCheckpointAfter
          )!;
          expect(location(cp)).toBe(location(pool.checkpoint));
        }
      }
      for (const e of report.events) {
        const m = e.metadata.block?.skillModel,
          b = e.metadata.block;
        if (!m || !b) continue;
        const relevant = (skills: number[], allowed: number[]) =>
          skills.filter((s) => allowed.includes(s)).sort((a, b) => a - b);
        const a = relevant(
          [
            ...m.traitEvidence.attacker.traits.innateSkills!,
            ...m.traitEvidence.attacker.traits.acquiredSkills!
          ],
          [30, 57, 68]
        );
        const d = relevant(
          [
            ...m.traitEvidence.defender.traits.innateSkills!,
            ...m.traitEvidence.defender.traits.acquiredSkills!
          ],
          [30, 7, 68]
        );
        const ref = arithmetic.find(
          (c) =>
            JSON.stringify(c.attackerSkills.slice().sort((a, b) => a - b)) ===
              JSON.stringify(a) &&
            JSON.stringify(c.defenderSkills.slice().sort((a, b) => a - b)) ===
              JSON.stringify(d) &&
            c.attackerChooses === b.pool.attackerChooses &&
            c.wrestlePolicy === m.wrestlePolicy &&
            JSON.stringify(c.rolledIndexes) ===
              JSON.stringify(b.pool.rolledIndexes) &&
            c.faces.length === b.pool.faces.length &&
            c.faces.every(
              (f, i) => c.rolledIndexes.includes(i) || f === b.pool.faces[i]
            )
        );
        expect(ref, e.metadata.sourceId).toBeDefined();
        expect(m.faceOutcomes).toEqual(ref!.faceOutcomes);
        expect(m.outcomeDistribution).toEqual(ref!.distribution.map(fraction));
        expect(m.expectedValue).toBeCloseTo(fraction(ref!.expectedValue), 12);
        expect(m.positiveChance).toBeCloseTo(fraction(ref!.positiveChance), 12);
      }
      const expected: Record<string, number> = {
        "demo1.bbr": 14,
        "demo10.bbr": 36,
        "demo5.bbr": 14,
        "demo6.bbr": 4,
        "demo8.bbr": 29,
        "demo9.bbr": 54
      };
      expect(count).toBe(expected[f.file] ?? 0);
      expect(report.teams.every((t) => t.impactCount === 0)).toBe(true);
      expect(report.verdict.luckierTeam).toBe("unknown");
    },
    30000
  );
});
