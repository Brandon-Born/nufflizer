import { foulAppearanceContextXml } from "../helpers/foulAppearanceReplay";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { readFileSync } from "node:fs";
import { contextReplayXml } from "../helpers/contextReplay";
import { findMentalActivationEnds } from "@/domain/replay/activationEnds";
import { describe, it, expect } from "vitest";
import { activationAftermathFragment } from "../helpers/activationReplay";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { reconstructReplayContext } from "@/domain/replay/reconstructContext";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import {
  observeMentalEffect,
  applyObservedMentalEffects
} from "@/domain/replay/mentalEffects";
const fragment = (id: string) =>
  parseReplayXml(
    activationAftermathFragment(
      id,
      "tests/fixtures/evidence/bb3-mental-effect-lifetimes.json"
    )
  );
const effect = (provider = 51) => ({
  EffectId: 44,
  ProviderType: 4,
  ProviderId: provider,
  Durations: { DurationsItem: [6, 1] }
});

describe("observed mental-trait effects and next activation", () => {
  it.each([31, 51])(
    "recognizes only the bounded positive effect for provider %s",
    (provider) => {
      expect(observeMentalEffect({ PlayerEffect: effect(provider) })).toEqual({
        providerSkillId: provider
      });
      expect(observeMentalEffect(undefined)).toBeNull();
      expect(
        observeMentalEffect({
          PlayerEffect: [effect(provider), effect(provider)]
        })
      ).toBeNull();
      expect(
        observeMentalEffect({
          PlayerEffect: Array.from({ length: 65 }, () => effect(provider))
        })
      ).toBeNull();
      expect(
        observeMentalEffect({ PlayerEffect: { ...effect(provider), Extra: 1 } })
      ).toBeNull();
    }
  );
  it("observes persistent suppression during the opponent turn without carrying prior availability", () => {
    const replay = fragment("opponent_turn");
    const board = replay.boardCheckpoints!.find((c) =>
      c.board?.teams[1]?.players.some((p) => p.id === 37 && p.mentalEffect)
    )!.board!;
    const raw = board.teams[1]!.players.find((p) => p.id === 37)!;
    const copy = structuredClone(board);
    const derived = applyObservedMentalEffects(board);
    expect(derived.teams[1]!.players.find((p) => p.id === 37)).toMatchObject({
      tackleZone: false,
      mentalEffect: { providerSkillId: 51 }
    });
    expect(raw.tackleZone).toBeNull();
    expect(derived.teams[1]!.players.find((p) => p.id === 37)!.canAct).toBe(
      raw.canAct
    );
    expect(board).toEqual(copy);
    const r = LuckReportSchema.parse(analyzeReplayLuck(replay));
    expect(
      r.events.some((e) =>
        e.metadata.preRoll?.suppressedTackleZones?.some(
          (p) => p.playerId === "37" && p.providerSkillId === 51
        )
      )
    ).toBe(true);
  });
  it.each(["next_activation_pass", "next_activation_fail"])(
    "separates ending the old effect from the next test in %s",
    (id) => {
      const replay = fragment(id);
      const context = reconstructReplayContext(replay);
      expect(context.mentalEffectEnds.size).toBe(1);
      const r = LuckReportSchema.parse(analyzeReplayLuck(replay));
      const ended = r.events.find((e) => e.metadata.mentalEffectEnd)!;
      expect(ended).toBeDefined();
      const check = r.events.find(
        (e) =>
          e.metadata.rollType === 34 && e.metadata.preRoll?.actorMentalEffectEnd
      )!;
      expect(check).toBeDefined();
      expect(
        check.metadata.preRoll!.suppressedTackleZones?.some(
          (p) => p.playerId === check.playerId
        )
      ).not.toBe(true);
      expect(check.metadata.preRoll?.actorMentalEffectEnd?.sourceId).toBe(
        ended.metadata.sourceId
      );
    }
  );
  it("observes Bone Head's matching effect without equating it to a spent activation in a later turn", () => {
    const r = LuckReportSchema.parse(
      analyzeReplayLuck(fragment("bone_head_snapshot"))
    );
    expect(
      r.events.some((e) =>
        e.metadata.preRoll?.suppressedTackleZones?.some(
          (p) => p.playerId === "37" && p.providerSkillId === 31
        )
      )
    ).toBe(true);
  });

  it("keeps the failed original after a spent team reroll and failed Loner4+ gate", () => {
    const replay = fragment("failed_loner_kept");
    const ends = findMentalActivationEnds(replay);
    expect(ends).toHaveLength(1);
    expect(ends[0]!.policy).toBe("failed_loner_kept_original");
    const r = LuckReportSchema.parse(analyzeReplayLuck(replay));
    const gate = r.events.find((e) => e.metadata.rollType === 71)!;
    expect(gate.metadata.lonerGate?.passed).toBe(false);
    expect(gate.metadata.teamRerollsSpent).toBe(1);
    const confirmation = r.events.find((e) => e.metadata.activationEnd)!;
    expect(confirmation.metadata.activationEnd?.rollSourceId).not.toBe(
      gate.metadata.sourceId
    );
    expect(confirmation.metadata.activationEnd?.policy).toBe(
      "failed_loner_kept_original"
    );
    expect(
      r.events.find((e) => e.metadata.sourceId === ends[0]!.rollSourceId)
        ?.probabilitySuccess
    ).toBeNull();
  });

  it.each([31, 51] as const)(
    "retains provider%s suppression while withholding unsupported ball-effect settlement",
    (provider) => {
      const regular = LuckReportSchema.parse(
        analyzeReplayLuck(
          parseReplayXml(contextReplayXml({ type: 4, exposed: true }))
        )
      );
      const reduced = LuckReportSchema.parse(
        analyzeReplayLuck(
          parseReplayXml(
            contextReplayXml({
              type: 4,
              exposed: true,
              mentalEffectPlayer: 40,
              mentalEffectProvider: provider
            })
          )
        )
      );
      const pickup = (r: typeof regular) =>
        r.events.find(
          (e) => e.scoringStatus === "scored" && e.metadata.rollType === 4
        )!;
      const a = pickup(regular),
        b = pickup(reduced);
      expect(a.metadata.preRoll?.pickupBounceExposure).toBe(3 / 8);
      expect(b.metadata.preRoll?.pickupBounceExposure).toBeNull();
      expect(b.metadata.preRoll?.pickupSettlementKnown).toBe(false);
      expect(b.metadata.preRoll?.suppressedTackleZones).toEqual([
        {
          playerId: "40",
          rosterIndex: 1,
          teamId: "1",
          providerSkillId: provider
        }
      ]);
      expect(b.contextualImpact).toBeUndefined();
      expect(a.contextualImpact!.contribution).toBeCloseTo(-175 / 48,12);
      expect(b.probabilitySuccess).toBe(a.probabilitySuccess);
      const missing = contextReplayXml({
        type: 4,
        exposed: true,
        mentalEffectPlayer: 40
      }).replaceAll(/<Effects>.*?<\/Effects>/g, "");
      const unknown = analyzeReplayLuck(parseReplayXml(missing));
      expect(pickup(unknown).metadata.preRoll?.pickupBounceExposure).toBeNull();
      expect(pickup(unknown).contextualImpact).toBeUndefined();
    }
  );
  it("withholds a useful-move count when an available teammate needs an unmodeled mental activation check", () => {
    const r = analyzeReplayLuck(
      parseReplayXml(contextReplayXml({ mentalEffectPlayer: 11 }))
    );
    const check = r.events.find((e) => e.scoringStatus === "scored")!;
    expect(check.metadata.preRoll?.otherUsefulActivations).toBeNull();
    expect(check.contextualImpact).toBeUndefined();
  });
  it("never infers restoration from an effect end before its new trait test", () => {
    const r = LuckReportSchema.parse(
      analyzeReplayLuck(fragment("next_activation_pass"))
    );
    const check = r.events.find((e) => e.metadata.mentalTraitResolution)!;
    expect(check.actualSuccess).toBe(true);
    expect(check.probabilitySuccess).toBeNull();
    expect(check.metadata.preRoll?.actorTackleZone).toBeNull();
    const later = fragment("next_activation_pass").boardCheckpoints!.find((c) =>
      c.board?.teams[1]?.players.some(
        (p) => p.id === 37 && p.tackleZone === true
      )
    )!;
    expect(
      later.board!.teams[1]!.players.find((p) => p.id === 37)?.mentalEffect
    ).toBeNull();
  });
  it("retains renewed suppression after a separately observed new failure", () => {
    const replay = fragment("next_activation_fail");
    const r = LuckReportSchema.parse(analyzeReplayLuck(replay));
    const check = r.events.find((e) => e.metadata.mentalTraitResolution)!;
    expect(check.actualSuccess).toBe(false);
    expect(check.metadata.preRoll?.actorTackleZone).toBeNull();
    expect(
      r.events.some(
        (e) =>
          e.metadata.sourceIndex! > check.metadata.sourceIndex! &&
          e.metadata.preRoll?.suppressedTackleZones?.some(
            (p) => p.playerId === "38"
          )
      )
    ).toBe(true);
  });
  it.each([
    "unknown",
    "owner",
    "provider",
    "missing_effect",
    "cell",
    "off_pitch",
    "clock"
  ] as const)("withholds effect-end inference after %s", (change) => {
    const replay = fragment("next_activation_pass");
    const events = replay.turns.flatMap((t) => t.events);
    const end = events.find((e) => e.sourceTag === "ResultEndPlayerEffect")!;
    if (change === "owner") end.actorTeamId = "0";
    if (change === "clock") {
      const declaration = events.find(
        (e) => e.sourceTag === "ResultUseAction" && e.actionId === end.actionId
      )!;
      const before = replay
        .boardCheckpoints!.filter(
          (c) => c.afterSourceIndex < declaration.sourceIndex!
        )
        .at(-1)!;
      const changed = structuredClone(before),
        restored = structuredClone(before);
      changed.afterSourceIndex = restored.afterSourceIndex =
        declaration.sourceIndex!;
      changed.board!.teams[1]!.gameTurn = 4;
      replay.boardCheckpoints!.push(changed, restored);
      replay.boardCheckpoints!.sort(
        (a, b) => a.afterSourceIndex - b.afterSourceIndex
      );
    }

    if (change === "provider")
      (end.payload!.Effect as Record<string, unknown>).ProviderId = 31;
    if (change === "cell" || change === "off_pitch")
      for (const c of replay.boardCheckpoints ?? [])
        for (const t of c.board?.teams ?? [])
          for (const p of t.players)
            if (p.id === 37) {
              p.cell = {
                x: change === "cell" ? 12 : -1,
                y: change === "cell" ? 6 : -1
              };
              if (change === "off_pitch") p.pitchLocation = "off_pitch";
            }
    if (change === "missing_effect")
      for (const c of replay.boardCheckpoints ?? [])
        for (const t of c.board?.teams ?? [])
          for (const p of t.players) p.mentalEffect = null;
    if (change === "unknown") {
      const t = replay.turns.find((t) => t.events.includes(end))!;
      t.events.splice(t.events.indexOf(end), 0, {
        type: "unknown",
        sourceTag: "EventUnknownMutation",
        sourceIndex: end.sourceIndex
      });
    }
    expect(reconstructReplayContext(replay).mentalEffectEnds.size).toBe(0);
  });
  it.each(["skill", "die", "fresh"] as const)(
    "preserves the earlier effect end while rejecting a contradictory later %s",
    (change) => {
      const replay = fragment("next_activation_pass");
      const events = replay.turns.flatMap((t) => t.events);
      const end = events.find((e) => e.sourceTag === "ResultEndPlayerEffect")!;
      const roll = events.find(
        (e) => e.rollType === 34 && e.sourceIndex! > end.sourceIndex!
      )!;
      if (change === "skill")
        events.find(
          (e) =>
            e.sourceTag === "ResultSkillUsage" &&
            e.sourceIndex! > end.sourceIndex!
        )!.payload!.Used = 0;
      if (change === "die") roll.payload!.Outcome = 0;
      if (change === "fresh") roll.payload!.NewRoll = 0;
      const result = reconstructReplayContext(replay);
      expect(result.mentalEffectEnds.size).toBe(1);
      expect(result.mentalTraitResults.size).toBe(0);
    }
  );
  it("keeps earlier pre-roll state invariant under future truncation and future board edits", () => {
    const replay = fragment("next_activation_pass");
    const full = analyzeReplayLuck(replay);
    const check = full.events.find((e) => e.metadata.mentalTraitResolution)!;
    const prefix = structuredClone(replay);
    prefix.turns = prefix.turns.map((t) => ({
      ...t,
      events: t.events.filter(
        (e) => e.sourceIndex! <= check.metadata.sourceIndex!
      )
    }));
    const partial = LuckReportSchema.parse(analyzeReplayLuck(prefix));
    expect(
      partial.events.find(
        (e) => e.metadata.sourceId === check.metadata.sourceId
      )?.metadata.preRoll
    ).toEqual(check.metadata.preRoll);
    for (const c of replay.boardCheckpoints ?? [])
      if (c.afterSourceIndex >= check.metadata.sourceIndex!)
        for (const t of c.board?.teams ?? [])
          for (const p of t.players) {
            p.mentalEffect = null;
            p.tackleZone = false;
          }
    expect(
      analyzeReplayLuck(replay).events.find(
        (e) => e.metadata.sourceId === check.metadata.sourceId
      )?.metadata.preRoll
    ).toEqual(check.metadata.preRoll);
  });
  it("rejects broken or duplicated effect provenance at the report boundary", () => {
    const r = LuckReportSchema.parse(
      analyzeReplayLuck(fragment("next_activation_pass"))
    );
    const check = r.events.find((e) => e.metadata.mentalTraitResolution)!;
    check.metadata.mentalTraitResolution!.effectEndSourceId = "missing";
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
    const report = LuckReportSchema.parse(
      analyzeReplayLuck(
        parseReplayXml(contextReplayXml({ type: 4, mentalEffectPlayer: 40 }))
      )
    );
    const context = report.events.find(
      (e) => e.metadata.preRoll?.suppressedTackleZones
    )!.metadata.preRoll!;
    context.suppressedTackleZones!.push(context.suppressedTackleZones![0]!);
    expect(LuckReportSchema.safeParse(report).success).toBe(false);
  });

  it("rejects unverified movement by an actor still under the observed effect", () => {
    const replay = parseReplayXml(
      contextReplayXml({ type: 4, mentalEffectPlayer: 10 })
    );
    const r = LuckReportSchema.parse(analyzeReplayLuck(replay));
    const pickup = r.events.find(
      (e) => e.metadata.rollType === 4 && e.scoringStatus === "scored"
    )!;
    expect(pickup.metadata.preRoll).toBeUndefined();
    expect(pickup.contextualImpact).toBeUndefined();
  });

  it("keeps a missing current effect unknown and rejects a contradictory positive tackle-zone flag", () => {
    const replay = parseReplayXml(
      contextReplayXml({ type: 4, exposed: true, mentalEffectPlayer: 40 })
    );
    const current = replay.boardCheckpoints!.find((c) => c.kind === "board")!;
    current.board!.teams[1]!.players.find((p) => p.id === 40)!.mentalEffect =
      null;
    const r = analyzeReplayLuck(replay);
    expect(
      r.events.find((e) => e.scoringStatus === "scored")?.metadata.preRoll
        ?.pickupBounceExposure
    ).toBeNull();
    const conflictXml = contextReplayXml({
      type: 4,
      exposed: true,
      mentalEffectPlayer: 40
    }).replaceAll("<Effects>", "<TackleZone>1</TackleZone><Effects>");
    const conflict = parseReplayXml(conflictXml);
    expect(
      conflict.boardCheckpoints!.some((c) =>
        c.board?.issues.includes("conflicting_tackle_zone_effect")
      )
    ).toBe(true);
    expect(
      analyzeReplayLuck(conflict).events.find(
        (e) => e.scoringStatus === "scored"
      )?.contextualImpact
    ).toBeUndefined();
  });
  it("validates the numeric snapshot encoding and exact effect signature", () => {
    expect(
      observeMentalEffect({
        PlayerEffect: {
          EffectId: "44",
          ProviderType: "4",
          ProviderId: "51",
          Durations: { DurationsItem: ["6", "1"] }
        }
      })
    ).toEqual({ providerSkillId: 51 });
    expect(
      observeMentalEffect({
        PlayerEffect: { ...effect(), CharacModifiers: "" }
      })
    ).toEqual({ providerSkillId: 51 });
    expect(
      observeMentalEffect({
        PlayerEffect: { ...effect(), CharacModifiers: { Modifier: 1 } }
      })
    ).toBeNull();
    expect(
      observeMentalEffect({
        PlayerEffect: { ...effect(), AdditionalSkills: "" }
      })
    ).toEqual({ providerSkillId: 51 });
    expect(
      observeMentalEffect({
        PlayerEffect: { ...effect(), AdditionalSkills: { Skill: 7 } }
      })
    ).toBeNull();
    for (const invalid of [
      { ...effect(), ProviderId: 1008 },
      { ...effect(), ProviderType: 1 },
      { ...effect(), Durations: { DurationsItem: [1, 6] } },
      { ...effect(), ProviderId: 51.5 }
    ])
      expect(observeMentalEffect({ PlayerEffect: invalid })).toBeNull();
  });
  it.each(["spend", "face", "owner", "replacement"] as const)(
    "rejects an unsupported failed-Loner original after %s changes",
    (change) => {
      const replay = fragment("failed_loner_kept");
      const events = replay.turns.flatMap((t) => t.events);
      if (change === "spend")
        events.find(
          (e) => e.sourceTag === "ResultTeamRerollUsage"
        )!.payload!.Used = 0;
      const roll = events.find((e) => e.rollType === 34)!;
      if (change === "face")
        roll.payload!.Dice = { Die: { DieType: 0, Value: 2 } };
      if (change === "owner")
        events.find((e) => e.rollType === 71)!.actorTeamId = "0";
      if (change === "replacement") {
        roll.payload!.NewRoll = 1;
        roll.payload!.Status = 2;
      }
      expect(findMentalActivationEnds(replay)).toHaveLength(0);
    }
  );

  it("retains the actual full-demo empty effect fields through production compact parsing", () => {
    const r = analyzeNufflizerInput(
      readFileSync("demo-replays/demo1.bbr", "utf8")
    );
    const sourceEnd = r.events.find(
      (e) =>
        e.metadata.sourceTag === "ResultEndPlayerEffect" &&
        e.metadata.locator?.replayStep === 136
    );
    expect(sourceEnd?.metadata.mentalEffectEnd?.providerSkillId).toBe(51);
    const opponent = r.events.find(
      (e) =>
        e.metadata.sourceTag === "ResultUseAction" &&
        e.metadata.locator?.replayStep === 103
    );
    expect(opponent?.teamId).toBe("0");
    expect(opponent?.metadata.preRoll?.activeTeamId).toBeNull();
    expect(opponent?.metadata.preRoll?.suppressedTackleZones).toContainEqual({
      playerId: "37",
      rosterIndex: 1,
      teamId: "1",
      providerSkillId: 51
    });
    expect(
      r.events.some(
        (e) => e.metadata.mentalTraitResolution?.providerSkillId === 51
      )
    ).toBe(true);
    expect(
      r.events.some((e) =>
        e.metadata.preRoll?.suppressedTackleZones?.some(
          (p) => p.playerId === "37"
        )
      )
    ).toBe(true);
  });

  it("preserves the opposing Foul Appearance use even while its holder has no tackle zone", () => {
    const effectXml =
      "<Effects><PlayerEffect><Durations><DurationsItem>6</DurationsItem><DurationsItem>1</DurationsItem></Durations><ProviderType>4</ProviderType><ProviderId>51</ProviderId><EffectId>44</EffectId></PlayerEffect></Effects>";
    const r = LuckReportSchema.parse(
      analyzeReplayLuck(
        parseReplayXml(
          foulAppearanceContextXml().replaceAll(
            "<Id>7</Id>",
            "<Id>7</Id>" + effectXml
          )
        )
      )
    );
    const gate = r.events.find((e) => e.metadata.rollType === 37)!;
    expect(gate.metadata.activationLoss).toBeDefined();
    expect(
      gate.metadata.preRoll?.suppressedTackleZones?.some(
        (p) => p.playerId === "7"
      )
    ).toBe(true);
    expect(gate.probabilitySuccess).toBeNull();
  });

  it.each(["dice", "outcome", "restored_zone"] as const)(
    "rejects fabricated resolution %s at the report boundary",
    (change) => {
      const r = LuckReportSchema.parse(
        analyzeReplayLuck(fragment("next_activation_pass"))
      );
      const check = r.events.find((e) => e.metadata.mentalTraitResolution)!;
      if (change === "dice") check.metadata.dice = [];
      if (change === "outcome") delete check.metadata.outcomeCode;
      if (change === "restored_zone")
        check.metadata.preRoll!.actorTackleZone = true;
      expect(LuckReportSchema.safeParse(r).success).toBe(false);
    }
  );
});
