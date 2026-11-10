import { describe, expect, it } from "vitest";
import { readAnalysisResponse } from "@/lib/readAnalysisResponse";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { envelope } from "../helpers/replay";
import { REPLAY_LIMITS } from "@/domain/replay/limits";

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}
describe("NUF-021/023 response boundary", () => {
  it("accepts a validated insufficient-evidence report", async () => {
    const report = analyzeNufflizerInput(envelope());
    await expect(readAnalysisResponse(json(report))).resolves.toEqual(report);
  });
  it.each([{}, null, [], { error: "unexpected" }, { schemaVersion: "old" }])(
    "rejects malformed success data without rendering it",
    async (value) => {
      await expect(readAnalysisResponse(json(value))).rejects.toThrow(
        /format or totals/
      );
    }
  );
  it("rejects invalid JSON and HTML success responses clearly", async () => {
    for (const text of ["", "<html>gateway failed</html>", "{"])
      await expect(readAnalysisResponse(new Response(text))).rejects.toThrow(
        /unreadable report/
      );
  });
  it.each([413, 504, 429, 503])(
    "handles non-JSON hosting errors for HTTP %s",
    async (status) => {
      await expect(
        readAnalysisResponse(
          new Response("<html>Upstream failure</html>", { status })
        )
      ).rejects.toThrow(
        status === 413
          ? /too large/
          : status === 504
            ? /timed out/
            : status === 429
              ? /Too many/
              : /HTTP 503/
      );
    }
  );
  it("uses only string error messages from valid error bodies", async () => {
    await expect(
      readAnalysisResponse(json({ error: "Replay is invalid." }, 400))
    ).rejects.toThrow("Replay is invalid.");
    for (const error of [null, {}, 17, []])
      await expect(readAnalysisResponse(json({ error }, 400))).rejects.toThrow(
        /HTTP 400/
      );
  });
  it.each([undefined, "1"])(
    "bounds successful streamed responses independently of content length %s",
    async (length) => {
      let reads = 0;
      let cancelled = false;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          reads++;
          controller.enqueue(new Uint8Array(64 * 1024));
        },
        cancel() {
          cancelled = true;
        }
      });
      await expect(
        readAnalysisResponse(
          new Response(stream, {
            headers: length ? { "content-length": length } : {}
          })
        )
      ).rejects.toThrow(/size limit/);
      expect(reads).toBeLessThan(
        Math.ceil(REPLAY_LIMITS.responseBytes / (64 * 1024)) + 3
      );
      expect(cancelled).toBe(true);
    }
  );
  it("does not download an unbounded hosting error page", async () => {
    let reads = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        reads++;
        controller.enqueue(new Uint8Array(4096));
      },
      cancel() {
        cancelled = true;
      }
    });
    await expect(
      readAnalysisResponse(new Response(stream, { status: 504 }))
    ).rejects.toThrow(/timed out/);
    expect(reads).toBeLessThanOrEqual(3);
    expect(cancelled).toBe(true);
  });
  it("preserves client cancellation during body reading", async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new DOMException("Cancelled", "AbortError"));
      }
    });
    await expect(
      readAnalysisResponse(new Response(stream))
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

it("cancels an oversized declared response without consuming its body", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    }
  });
  await expect(
    readAnalysisResponse(
      new Response(stream, {
        headers: { "content-length": String(REPLAY_LIMITS.responseBytes + 1) }
      })
    )
  ).rejects.toThrow(/size limit/);
  expect(cancelled).toBe(true);
});
it("distinguishes an interrupted download from an oversized response", async () => {
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.error(new Error("Connection reset"));
    }
  });
  await expect(readAnalysisResponse(new Response(stream))).rejects.toThrow(
    /download was interrupted/
  );
});
