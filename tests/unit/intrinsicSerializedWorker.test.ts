import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
import { runAnalysis, activeAnalysisWorkers } from "@/server/runAnalysis";
import { REPLAY_LIMITS } from "@/domain/replay/limits";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";

// Scheduled with actual CLI workers, after corpus generation and before the
// ten-request HTTP gate. Exercises the HTTP serializer without another POST.
it("[cli-worker] serializes both expanded original-source reports inside the unchanged HTTP worker budget", async () => {
  for (const [file, id, weighted] of [
    ["demo9.bbr", "source-2060", -5 / 4],
    ["demo10.bbr", "source-1121", -13 / 12]
  ] as const) {
    expect(activeAnalysisWorkers()).toBe(0);
    const r = LuckReportSchema.parse(
      await runAnalysis(readFileSync("demo-replays/" + file, "utf8"), {
        maxReportBytes: REPLAY_LIMITS.responseBytes
      })
    );
    expect(r.modelVersion).toBe("dice-only-36");
    expect(r.schemaVersion).toBe("2.72");
    expect(
      r.events.find((e) => e.metadata.sourceId === id)!.weightedDelta
    ).toBe(weighted);
    expect(Buffer.byteLength(JSON.stringify(r))).toBeLessThanOrEqual(
      REPLAY_LIMITS.responseBytes
    );
    expect(r.verdict.luckierTeam).toBe("unknown");
    expect(activeAnalysisWorkers()).toBe(0);
  }
}, 20000);
