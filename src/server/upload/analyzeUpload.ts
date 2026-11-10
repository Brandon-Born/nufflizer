import { NextResponse } from "next/server";
import { ReplayValidationError } from "@/lib/errors";
import { REPLAY_LIMITS } from "@/domain/replay/limits";
import { AnalysisExecutionError, runAnalysis } from "../runAnalysis";
import { readReplayUpload, UploadError } from "./readReplayUpload";
import { consumeLocalUploadQuota } from "./rateLimit";

export async function analyzeUpload(
  request: Request,
  legacy = false
): Promise<NextResponse> {
  if (!consumeLocalUploadQuota())
    return NextResponse.json(
      {
        error: "Too many requests. Please wait a minute and retry.",
        code: "RATE_LIMIT"
      },
      { status: 429, headers: { "Retry-After": "60" } }
    );
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
  }
}
