import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { scopedTraitEffectPlayer } from "@/domain/replay/traitTransitions";
import { recordedMentalEffect } from "@/domain/replay/mentalEffects";
import { visitCurrentTraits } from "@/domain/replay/traitContinuity";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { mentalNotificationXml } from "../helpers/mentalNotification";

const facts = JSON.parse(
  readFileSync("tests/fixtures/evidence/bb3-mental-notifications.json", "utf8")
);
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
const key = (l: {
  replayStep?: number | null;
  childIndex?: number | null;
  stepIndex?: number | null;
  messageIndex?: number | null;
}) =>
  [
    l.replayStep,
    l.childIndex,
    l.stepIndex ?? null,
    l.messageIndex ?? null
  ].join(":");

describe("independent inner mental-notification continuity evidence", () => {
  it("reproduces all85 notifications and a separately hashed UI-007 result witness", () => {
    const p = spawnSync(
      "python3",
      ["scripts/extract-mental-notification-evidence.py", "--check"],
      { encoding: "utf8" }
    );
    expect(p.status, p.stderr).toBe(0);
    expect(facts.counts).toEqual({
      EventAddPlayerEffect: 2,
      EventEndPlayerEffect: 14,
      ResultAddPlayerEffect: 42,
      ResultEndPlayerEffect: 27
    });
    expect(facts.files).toHaveLength(12);
    for (const f of facts.files)
      expect(
        createHash("sha256")
          .update(readFileSync("demo-replays/" + f.file))
          .digest("hex")
      ).toBe(f.sha256);
    const w = facts.pairedWitness;
    expect(
      createHash("sha256")
        .update(readFileSync("tests/fixtures/evidence/" + w.fixture))
        .digest("hex")
    ).toBe(w.sha256);
    expect(w.caseId).toBe("UI-007");
    expect(w.records[0].messages).toContainEqual({
      ResultAddPlayerEffect: {
        PlayerId: ["37"],
        Effect: [
          {
            Durations: [{ DurationsItem: ["6", "1"] }],
            ProviderType: ["4"],
            ProviderId: ["51"],
            EffectId: ["44"]
          }
        ]
      }
    });
  });
  it("joins 69 result headers and scopes the six Animal Savagery notifications to player 37", () => {
    let inner = 0;
    const savagery: string[] = [];
    for (const f of facts.files) {
      const p = parseReplayXml(
        decodeReplayInput(readFileSync("demo-replays/" + f.file, "utf8")).xml,
        { omitRawReplaySteps: true }
      );
      const es = p.turns.flatMap((t) => t.events),
        by = new Map(es.map((e) => [key(e.locator ?? {}), e]));
      for (const n of f.notifications) {
        const e = by.get(key(n.locator))!;
        expect(e?.sourceTag).toBe(n.tag);
        expect(canonical(e.payload)).toEqual(n.payload);
        const isInner = n.tag.startsWith("Result");
        const h = isInner
          ? by.get(key({ ...n.locator, messageIndex: null }))
          : undefined;
        if (isInner) {
          expect(h?.sourceTag).toBe(n.headerTag);
          expect(canonical(h?.payload)).toEqual(n.header);
          expect(scopedTraitEffectPlayer(e, h)).toBe(
            String(n.payload.PlayerId)
          );
          inner++;
        }
        if (n.payload.Effect.ProviderId !== 84) continue;
        expect(scopedTraitEffectPlayer(e, h)).toBe("37");
        expect(recordedMentalEffect(e.payload?.Effect)).toBeNull();
        expect(f.file).toBe("demo5.bbr");
        savagery.push(key(n.locator));

        const extraSkill = structuredClone(e);
        (
          extraSkill.payload!.Effect as Record<string, unknown>
        ).AdditionalSkills = "57";
        expect(scopedTraitEffectPlayer(extraSkill, h)).toBeUndefined();
        expect(
          scopedTraitEffectPlayer({ ...e, attributionConflict: true }, h)
        ).toBeUndefined();
        if (h) {
          expect(
            scopedTraitEffectPlayer(e, { ...h, actorTeamId: "0" })
          ).toBeUndefined();
        } else {
          expect(
            scopedTraitEffectPlayer({ ...e, locator: undefined })
          ).toBeUndefined();
        }
      }
    }
    expect(inner).toBe(69);
    expect(savagery).toEqual([
      "100:1:0:2",
      "118:6::",
      "209:1:0:2",
      "252:1:0:1",
      "379:1:0:2",
      "400:1:0:1"
    ]);
  });
  it("restores the holder and struck teammate only on their clean settled return boards", () => {
    const replay = parseReplayXml(
      decodeReplayInput(readFileSync("demo-replays/demo5.bbr", "utf8")).xml,
      { omitRawReplaySteps: true }
    );
    const trackedSources = [
      665, 812, 824, 1134, 1139, 1721, 1729, 1741, 1762, 2409
    ];
    const collect = () => {
      const observations = new Map<number, string[]>();
      visitCurrentTraits(replay, (event, current, ledger) => {
        const index = event.sourceIndex!;
        if (!trackedSources.includes(index)) return;
        const ids = ["37", "38"].filter((id) => ledger.has(id));
        observations.set(index, ids);
        for (const id of ids)
          expect(ledger.get(id)).toMatchObject({
            teamId: "1",
            observedCheckpointAfter: 0,
            currentCheckpointAfter: current!.afterSourceIndex,
            traits: { dataPlayerId: Number(id), acquiredSkills: [] }
          });
      });
      return observations;
    };
    expect([...collect()]).toEqual([
      [665, ["38"]],
      [812, ["38"]],
      [824, ["37", "38"]],
      [1134, []],
      [1139, []],
      [1721, []],
      [1729, ["37"]],
      [1741, ["37"]],
      [1762, ["37", "38"]],
      [2409, ["37", "38"]]
    ]);

    const checkpoints = replay.boardCheckpoints!;
    const firstEffect = checkpoints
      .find((cp) => cp.afterSourceIndex === 664)!
      .board!.teams[1]!.players.find((player) => player.id === 37)!;
    firstEffect.animalSavageryEffect = false;
    expect(collect().get(824)).toEqual(["38"]);
    firstEffect.animalSavageryEffect = true;

    const events = replay.turns.flatMap((turn) => turn.events);
    const armor = events.find((event) => event.sourceIndex === 1135)!;
    armor.payload!.NewRoll = 0;
    expect(collect().get(2409)).toEqual([]);
    armor.payload!.NewRoll = 1;

    const stoodUp = checkpoints.find(
      (cp) => cp.afterSourceIndex === 1761
    )!.board!;
    stoodUp.stable = false;
    expect(collect().get(1762)).toEqual(["37"]);
  });
  it("scores the three recovered demo5 block pools and links the subsequent armor check", () => {
    const report = analyzeNufflizerInput(
      readFileSync("demo-replays/demo5.bbr", "utf8")
    );
    const bySource = new Map(
      report.events.map((event) => [event.metadata.sourceId, event])
    );
    const pools = [
      {
        source: 682,
        team: "1",
        attacker: "39",
        defender: "5",
        faces: [2, 2],
        offered: 0,
        mean: 19 / 36,
        delta: -19 / 48
      },
      {
        source: 703,
        team: "1",
        attacker: "42",
        defender: "9",
        faces: [3, 0],
        offered: 0,
        mean: 5 / 18,
        delta: -5 / 24
      },
      {
        source: 987,
        team: "0",
        attacker: "2",
        defender: "41",
        faces: [3, 0],
        offered: 1,
        mean: 19 / 36,
        delta: 17 / 48
      }
    ];
    for (const {
      source,
      team,
      attacker,
      defender,
      faces,
      offered,
      mean,
      delta
    } of pools) {
      const pool = bySource.get(`source-${source}`)!;
      expect(pool).toMatchObject({
        teamId: team,
        playerId: attacker,
        scoringStatus: "scored",
        actualSuccess: null,
        probabilitySuccess: null,
        metadata: {
          block: {
            attackerId: attacker,
            defenderId: defender,
            pool: { faces, rolledIndexes: [0, 1], attackerChooses: true }
          },
          blockScoring: {
            policy: "fixed_pool_knockdown_balance",
            observedValue: offered,
            expectedValue: mean
          }
        }
      });
      expect(pool.weightedDelta).toBeCloseTo(delta, 12);
    }
    expect(
      bySource.get("source-703")!.metadata.block!.selectedFace
    ).toBeUndefined();
    const armor = bySource.get("source-1002")!;
    expect(armor).toMatchObject({
      type: "armor_break",
      teamId: "1",
      playerId: "41",
      scoringStatus: "scored",
      actualSuccess: true,
      probabilitySuccess: 30 / 36,
      explainability: { target: "Armor holds below 10" },
      metadata: {
        dice: [5, 2],
        damage: { chainActionId: "sequence-101-step-1" }
      }
    });
    expect(
      bySource.get("source-987")!.metadata.blockResolution?.damageActionIds
    ).toEqual([armor.metadata.damage!.chainActionId]);
    expect(armor.weightedDelta).toBeCloseTo(1 / 6, 12);
    expect(report.verdict.luckierTeam).toBe("unknown");
  });
  it.each(["ResultAddPlayerEffect", "ResultEndPlayerEffect"] as const)(
    "retains unrelated learned lists after %s without new snapshot Data",
    (tag) => {
      const input = mentalNotificationXml(tag),
        p = parseReplayXml(input),
        r = analyzeNufflizerInput(input),
        pool = r.events.find((e) => e.metadata.block)!;
      expect(pool.metadata.block!.traitEvidence?.attacker).toMatchObject({
        playerId: "42",
        observedCheckpointAfter: 0
      });
      expect(pool.metadata.block!.traitEvidence?.defender).toMatchObject({
        playerId: "7",
        observedCheckpointAfter: 0
      });
      expect(pool).toMatchObject({
        scoringStatus: "scored",
        probabilitySuccess: null,
        actualSuccess: null,
        weightedDelta: 5 / 8
      });
      expect(pool.metadata.block!.skillModel!.expectedValue).toBeCloseTo(
        1 / 6,
        12
      );
      expect(
        p.boardCheckpoints![1]!.board!.teams[0]!.players.find(
          (p) => p.id === 42
        )!.traits
      ).toBeNull();
      expect(pool.metadata.preRoll?.actorMovementRemaining).toBeUndefined();
      expect(pool.contextualImpact).toBeUndefined();
      expect(r.verdict.luckierTeam).toBe("unknown");
    }
  );
});
