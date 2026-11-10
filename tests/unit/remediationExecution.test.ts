import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activeAnalysisWorkers,
  runAnalysis,
  AnalysisExecutionError
} from "@/server/runAnalysis";
import { POST } from "@/app/api/nufflizier/analyze/route";
import { envelope, sequence, rollXml } from "../helpers/replay";

const demo = readFileSync("demo-replays/demo1.bbr", "utf8");
afterEach(() => vi.unstubAllEnvs());
describe("NUF-006 terminating execution boundary", () => {
  it("terminates parsing on deadline while the parent remains responsive", async () => {
    const start = performance.now();
    const slow = runAnalysis(demo, { timeoutMs: 100 }).catch(
      (error: unknown) => error
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(performance.now() - start).toBeLessThan(500);
    const quick = await runAnalysis(envelope(sequence([rollXml()])));
    expect(quick.events).toHaveLength(1);
    expect(await slow).toMatchObject({ status: 504, code: "TIMEOUT" });
    expect(activeAnalysisWorkers()).toBe(0);
    expect(performance.now() - start).toBeLessThan(2000);
  });
  it("terminates on client cancellation and frees the concurrency slot", async () => {
    const controller = new AbortController();
    const promise = runAnalysis(demo, { signal: controller.signal });
    setTimeout(() => controller.abort(), 100);
    await expect(promise).rejects.toMatchObject({
      status: 499,
      code: "CANCELLED"
    });
    expect(activeAnalysisWorkers()).toBe(0);
    await expect(runAnalysis(envelope())).resolves.toHaveProperty(
      "verdict.status",
      "insufficient_evidence"
    );
  });
  it("rejects already aborted work without starting a worker", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runAnalysis(demo, { signal: controller.signal })
    ).rejects.toBeInstanceOf(AnalysisExecutionError);
    expect(activeAnalysisWorkers()).toBe(0);
  });
});
describe("NUF-003/023/025 HTTP contracts", () => {
  it.each([
    "<hello>world</hello>",
    envelope(
      sequence([
        "<ResultRoll><RollType>7</RollType><Difficulty>2</Difficulty></ResultRoll>"
      ])
    )
  ])("maps invalid replay input to HTTP 400", async (xml) => {
    const form = new FormData();
    form.append("replay", new File([xml], "replay.xml"));
    const response = await POST(
      new Request("http://localhost/api/nufflizier/analyze", {
        method: "POST",
        body: form
      })
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty("code", "INVALID_REPLAY");
  });
  it("defaults legacy API to disabled even with invalid configuration", async () => {
    for (const value of ["", "typo", "disabled"]) {
      vi.resetModules();
      vi.stubEnv("NUFFLIZIER_LEGACY_REPLAY_API_MODE", value);
      const { POST: legacy } = await import("@/app/api/replay/route");
      const response = await legacy(
        new Request("http://localhost/api/replay", { method: "POST" })
      );
      expect(response.status).toBe(410);
      expect(response.headers.get("Link")).toContain("/api/nufflizier/analyze");
    }
  });
});

describe("NUF-006/023 response work inside the terminating boundary", () => {
  it("rejects oversized serialized reports before copying them to the API thread", async () => {
    await expect(
      runAnalysis(envelope(sequence([rollXml()])), { maxReportBytes: 1 })
    ).rejects.toMatchObject({ status: 413, code: "REPORT_TOO_LARGE" });
    expect(activeAnalysisWorkers()).toBe(0);
  });
  it("accepts exactly the report-byte cap and rejects one byte less", async () => {
    const { analyzeNufflizerInput } =
      await import("@/server/services/analyzeNufflizer");
    const input = envelope(sequence([rollXml()]));
    const size = Buffer.byteLength(
      JSON.stringify(analyzeNufflizerInput(input))
    );
    await expect(
      runAnalysis(input, { maxReportBytes: size })
    ).resolves.toHaveProperty("verdict.status", "partial_analysis");
    await expect(
      runAnalysis(input, { maxReportBytes: size - 1 })
    ).rejects.toMatchObject({ code: "REPORT_TOO_LARGE" });
    expect(activeAnalysisWorkers()).toBe(0);
  });
  it("rejects invalid output-budget configuration before allocating a worker", async () => {
    await expect(
      runAnalysis(envelope(), { maxReportBytes: 0 })
    ).rejects.toThrow(/Invalid worker report size limit/);
    expect(activeAnalysisWorkers()).toBe(0);
  });
});
