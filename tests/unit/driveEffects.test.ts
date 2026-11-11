import { describe, it, expect } from "vitest";
import { lonerDriveXml } from "../helpers/lonerDrive";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { findDriveEffectExpiries } from "@/domain/replay/driveEffects";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
const replay = (id: string) => parseReplayXml(lonerDriveXml(id));
describe("explicit drive-end Confused expiry observations", () => {
  it.each(["touchdown_drive_end", "half_drive_end", "two_effects_drive_end"])(
    "confirms ends before setup with the first following board in %s",
    (id) => {
      const r = replay(id);
      const copy = structuredClone(r);
      const proofs = findDriveEffectExpiries(r);
      expect(proofs.size).toBe(id === "two_effects_drive_end" ? 2 : 1);
      expect(r).toEqual(copy);
      const report = LuckReportSchema.parse(analyzeReplayLuck(r));
      const ended = report.events.filter((e) => e.metadata.driveEffectExpiry);
      expect(ended).toHaveLength(proofs.size);
      expect(
        ended.every(
          (e) =>
            e.weightedDelta === 0 &&
            e.scoringStatus === "excluded" &&
            e.metadata.isRollCandidate === false
        )
      ).toBe(true);
      for (const e of ended) {
        const p = e.metadata.driveEffectExpiry!;
        const locations: Record<string, Record<string, string>> = {
          touchdown_drive_end: { "1": "on_pitch" },
          half_drive_end: { "37": "off_pitch" },
          two_effects_drive_end: { "1": "on_pitch", "38": "off_pitch" }
        };
        expect(p.afterPitchLocation).toBe(locations[id]![p.playerId]);
        expect(p.afterRecordedTackleZone).toBe(true);
        expect(e.playerId).toBe(p.playerId);
        expect(
          report.events.find((e) => e.metadata.sourceId === p.phaseSourceId)
            ?.metadata.setupPhase?.code
        ).toBe(3);
      }
    }
  );
  it.each([
    "missing_before",
    "wrong_provider",
    "wrong_phase",
    "retained_effect",
    "unknown_after",
    "identity_change",
    "missing_first_board"
  ] as const)("withholds a drive-end claim for %s", (change) => {
    const r = replay("touchdown_drive_end");
    const events = r.turns.flatMap((t) => t.events);
    const end = events.find((e) => e.sourceTag === "EventEndPlayerEffect")!;
    const phase = events.find((e) => e.sourceTag === "EventNewGamePhase")!;
    const after = r.boardCheckpoints!.find(
      (c) => c.afterSourceIndex >= phase.sourceIndex!
    )!;
    if (change === "missing_before")
      for (const c of r.boardCheckpoints!)
        if (c.afterSourceIndex < end.sourceIndex!)
          for (const t of c.board?.teams ?? [])
            for (const p of t.players) p.mentalEffect = null;
    if (change === "wrong_provider")
      (end.payload!.Effect as Record<string, unknown>).ProviderId = "84";
    if (change === "wrong_phase") phase.payload!.Phase = "5";
    if (change === "retained_effect")
      after.board!.teams[0]!.players.find((p) => p.id === 1)!.mentalEffect = {
        providerSkillId: 51
      };
    if (change === "unknown_after") {
      const t = r.turns.find((t) => t.events.includes(phase))!;
      t.events.splice(t.events.indexOf(phase) + 1, 0, {
        sourceTag: "EventUnknownMutation",
        type: "unknown",
        sourceIndex: phase.sourceIndex! + 1
      });
    }
    if (change === "identity_change") {
      const t = r.turns.find((t) => t.events.includes(end))!;
      t.events.splice(t.events.indexOf(end), 0, {
        sourceTag: "EventBuyMercenary",
        type: "unknown",
        playerId: end.playerId,
        sourceIndex: end.sourceIndex! - 1
      });
    }
    if (change === "missing_first_board") after.board = null;
    expect(findDriveEffectExpiries(r).size).toBe(0);
  });
  it("does not use later confirmation to alter earlier pre-roll context", () => {
    const r = replay("two_effects_drive_end");
    const full = analyzeReplayLuck(r);
    const endIndex = Math.min(
      ...[...findDriveEffectExpiries(r)].map(
        ([id]) =>
          r.turns.flatMap((t) => t.events).find((e) => e.id === id)!
            .sourceIndex!
      )
    );
    const prefix = structuredClone(r);
    prefix.turns = prefix.turns.map((t) => ({
      ...t,
      events: t.events.filter((e) => e.sourceIndex! < endIndex)
    }));
    const partial = LuckReportSchema.parse(analyzeReplayLuck(prefix));
    expect(partial.events.some((e) => e.metadata.driveEffectExpiry)).toBe(
      false
    );
    for (const e of partial.events)
      expect(e.metadata.preRoll).toEqual(
        full.events.find((f) => f.metadata.sourceId === e.metadata.sourceId)
          ?.metadata.preRoll
      );
  });

  it("keeps raw setup flags separate from playable coverage and confirms the halftime interval", () => {
    const r = replay("half_drive_end");
    const proof = [...findDriveEffectExpiries(r).values()][0]!;
    expect(proof).toMatchObject({
      playerId: "37",
      afterPitchLocation: "off_pitch",
      afterRecordedCanAct: true,
      afterRecordedTackleZone: true
    });
    const before = r.boardCheckpoints!.find(
      (c) => c.afterSourceIndex === proof.beforeCheckpointAfter
    )!;
    expect(before.board!.stable).toBeNull();
    expect(
      before.board!.teams[1]!.players.find((p) => p.id === 37)?.mentalEffect
        ?.providerSkillId
    ).toBe(31);
  });
  it("rejects forged boundary links without granting a score to setup", () => {
    const r = LuckReportSchema.parse(
      analyzeReplayLuck(replay("touchdown_drive_end"))
    );
    const end = r.events.find((e) => e.metadata.driveEffectExpiry)!;
    end.metadata.driveEffectExpiry!.phaseSourceId = "missing";
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
});
