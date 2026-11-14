import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { scopedTraitEffectPlayer } from "@/domain/replay/traitTransitions";
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
  it("joins every known result holder/header and leaves provider84 outside the scoped policy", () => {
    let admitted = 0,
      other = 0;
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
        if (!n.tag.startsWith("Result")) continue;
        const h = by.get(key({ ...n.locator, messageIndex: null }))!;
        expect(h.sourceTag).toBe(n.headerTag);
        expect(canonical(h.payload)).toEqual(n.header);
        const valid = [31, 51].includes(n.payload.Effect.ProviderId);
        expect(scopedTraitEffectPlayer(e, h)).toBe(
          valid ? String(n.payload.PlayerId) : undefined
        );
        valid ? admitted++ : other++;
      }
    }
    expect({ admitted, other }).toEqual({ admitted: 64, other: 5 });
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
