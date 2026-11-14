import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { playbackFragment } from "../helpers/playback";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";

type Raw = {
  file: string;
  sha256: string;
  locator: { replayStep: number; childIndex: number; stepIndex: number };
  header: Record<string, unknown>;
  messages: {
    messageIndex: number;
    tag: string;
    payload: Record<string, unknown>;
  }[];
};
const facts = JSON.parse(
  readFileSync("tests/fixtures/evidence/bb3-throw-team-mate-roles.json", "utf8")
) as {
  headers: Raw[];
  landingHeaders: Raw[];
  sourceHashes: Record<string, string>;
  pairedUI034: {
    case: {
      id: string;
      ui: {
        playerId: number;
        targetId: number;
        events: { label: string; before?: number; after?: number }[];
      };
    };
  };
};
const n = (p: Record<string, unknown>, k: string) =>
  (p[k] as string[] | undefined)?.[0];
const match = (
  a: { replayStep?: number; childIndex?: number; stepIndex?: number },
  b: Record<string, number>
) =>
  (["replayStep", "childIndex", "stepIndex"] as const).every(
    (k) => a[k] === b[k]
  );

describe("independent typed Throw Team-mate participants", () => {
  it("reproduces all raw typed headers and the existing UI-034 role/resource witness", () => {
    const p = spawnSync(
      "python3",
      ["scripts/extract-throw-team-mate-role-evidence.py", "--check"],
      { encoding: "utf8" }
    );
    expect(p.status, p.stderr).toBe(0);
    expect(facts.headers).toHaveLength(3);
    // Public fixtures contain no executed landing. Independently transcribed
    // UI-041 records a distinct PlayerStep/14 for thrown player10 after actor1.
    expect(facts.landingHeaders).toHaveLength(0);
    const landing = playbackFragment("007", "UI-041", [1, 5, 10], [37])
      .turns.flatMap((t) => t.events)
      .filter((e) => e.stepType === 14);
    expect(landing.length).toBeGreaterThan(0);
    for (const e of landing) {
      expect(e.playerId).toBe("10");
      expect(e.stepActorId).toBe("10");
      expect(e.throwTeamMate).toBeUndefined();
    }
    for (const [file, hash] of Object.entries(facts.sourceHashes))
      expect(
        createHash("sha256")
          .update(readFileSync(`demo-replays/${file}`))
          .digest("hex")
      ).toBe(hash);
    expect(facts.pairedUI034.case).toMatchObject({
      id: "UI-034",
      ui: { playerId: 37, targetId: 50 }
    });
    expect(
      facts.pairedUI034.case.ui.events.find(
        (e) => e.label === "Team reroll resource"
      )
    ).toMatchObject({ before: 2, after: 1 });
  });
  it.each(["demo1.bbr", "demo6.bbr"])(
    "retains distinct typed thrower/thrown roles and message actors in %s",
    (file) => {
      const replay = parseReplayXml(
          decodeReplayInput(readFileSync(`demo-replays/${file}`, "utf8")).xml,
          { omitRawReplaySteps: true }
        ),
        events = replay.turns.flatMap((t) => t.events);
      for (const h of facts.headers.filter((h) => h.file === file)) {
        const actor = n(h.header, "ThrowerId"),
          target = n(h.header, "ThrownMateId");
        expect(actor).not.toBe(target);
        const source = events.find(
          (e) =>
            e.sourceTag === "ThrowTeamMateStep" &&
            e.locator &&
            match(e.locator, h.locator)
        )!;
        expect(source).toMatchObject({
          playerId: actor,
          targetId: target,
          stepActorId: actor,
          stepTargetId: target
        });
        for (const m of h.messages) {
          const e = events.find(
            (e) =>
              e.locator &&
              match(e.locator, h.locator) &&
              e.locator.messageIndex === m.messageIndex
          )!;
          expect(e.sourceTag).toBe(m.tag);
          expect(e.stepActorId).toBe(actor);
          expect(e.stepTargetId).toBe(target);
          expect(e.playerId).toBe(n(m.payload, "PlayerId") ?? actor);
          expect(e.targetId).toBe(n(m.payload, "TargetId") ?? target);
        }
      }
    }
  );
  it("links the last raw team-reroll choice without scoring an unsupported throwing policy", () => {
    const r = analyzeNufflizerInput(
      readFileSync("demo-replays/demo1.bbr", "utf8")
    );
    expect(r.rerollResources).toMatchObject({
      decisionCount: 21,
      linkedCount: 21,
      unresolvedCount: 0
    });
    expect(
      r.rerollResources.decisions.find(
        (d) => d.decisionSourceId === "source-5407"
      )
    ).toMatchObject({
      status: "linked",
      questionSourceId: "source-5404",
      teamId: "1",
      namespace: { actorPlayerId: "37", rosterIndex: 1, checkpointAfter: 5404 }
    });
    const gate = r.events.find((e) => e.metadata.sourceId === "source-5409")!,
      replacement = r.events.find(
        (e) => e.metadata.sourceId === "source-5410"
      )!;
    expect(gate.metadata).toMatchObject({
      teamRerollsSpent: 1,
      lonerGate: {
        passed: true,
        threshold: 4,
        gamerId: 1,
        skillSourceId: "source-5408"
      }
    });
    expect(replacement.metadata.teamDiceIdentity).toMatchObject({
      questionSourceId: "source-5404",
      decisionSourceId: "source-5407",
      originalDie: 4,
      finalDie: 3,
      gateSourceId: "source-5409"
    });
    for (const e of r.events.filter((e) => e.metadata.stepType === 13)) {
      expect(e.scoringStatus).toBe("excluded");
      expect(e.weightedDelta).toBe(0);
      expect(e.probabilitySuccess).toBeNull();
    }
    expect(r.verdict.luckierTeam).toBe("unknown");
  });
});
