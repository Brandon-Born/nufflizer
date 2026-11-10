import { NextResponse } from "next/server";
import { ReplayValidationError } from "@/lib/errors";
import { REPLAY_LIMITS } from "@/domain/replay/limits";
import { AnalysisExecutionError, runAnalysis } from "../runAnalysis";
import { readReplayUpload, UploadError } from "./readReplayUpload";
import { acquireUpload } from "./rateLimit";
import type { UploadGate } from "./sharedQuota";

export async function analyzeUpload(
  request: Request,
  legacy = false,
  gate: UploadGate = acquireUpload
): Promise<NextResponse> {
  if (request.signal.aborted)
    return NextResponse.json(
      { error: "Upload cancelled.", code: "CANCELLED" },
      { status: 499 }
    );
  const slot = await gate();
  if (slot.kind !== "admitted") {
    const rateLimited = slot.kind === "rate_limit";
    return NextResponse.json(
      {
        error: rateLimited
          ? "Too many uploads. Please wait and retry."
          : slot.kind === "busy"
            ? "Analysis is busy. Please retry shortly."
            : "Upload capacity is temporarily unavailable. Please retry shortly.",
        code: rateLimited
          ? "RATE_LIMIT"
          : slot.kind === "busy"
            ? "BUSY"
            : "QUOTA_UNAVAILABLE"
      },
      {
        status: rateLimited ? 429 : 503,
        headers: { "Retry-After": String(slot.retryAfter) }
      }
    );
  }
  try {
    const input = await readReplayUpload(request);
    const report = legacy
      ? await runAnalysis(input, {
          mode: "legacy",
          signal: request.signal,
          maxReportBytes: REPLAY_LIMITS.responseBytes - 11
        })
      : await runAnalysis(input, {
          signal: request.signal,
          maxReportBytes: REPLAY_LIMITS.responseBytes
        });
    const json = JSON.stringify(legacy ? { report } : report);
    if (Buffer.byteLength(json) > REPLAY_LIMITS.responseBytes)
      return NextResponse.json(
        {
          error:
            "Report is too large for direct download. Try a smaller replay or use the CLI.",
          code: "REPORT_TOO_LARGE"
        },
        { status: 413 }
      );
    return new NextResponse(json, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    if (error instanceof UploadError || error instanceof AnalysisExecutionError)
      return NextResponse.json(
        {
          error: error.message,
          code:
            error instanceof AnalysisExecutionError
              ? error.code
              : "INVALID_UPLOAD"
        },
        { status: error.status }
      );
    if (error instanceof ReplayValidationError)
      return NextResponse.json(
        { error: error.message, code: "INVALID_REPLAY" },
        { status: 400 }
      );
    console.error(
      "Replay analysis failed",
      error instanceof Error ? error.message : "Unknown error"
    );
    return NextResponse.json(
      { error: "Failed to analyze replay.", code: "ANALYSIS_FAILED" },
      { status: 500 }
    );
  } finally {
    await slot.release();
  }
}
