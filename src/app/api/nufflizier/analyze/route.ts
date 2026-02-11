import { NextResponse } from "next/server";

import { appConfig } from "@/lib/config";
import { ReplayValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";

export const runtime = "nodejs";

type RateBucket = {
  count: number;
  resetAt: number;
};

const analyzeRateLimiter = new Map<string, RateBucket>();

function hasAllowedExtension(name: string): boolean {
  return name.endsWith(".xml") || name.endsWith(".bbr");
}

function getClientIdentifier(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  return "unknown";
}

function consumeRateLimit(clientKey: string): boolean {
  const now = Date.now();

  if (analyzeRateLimiter.size > 1000) {
    for (const [key, bucket] of analyzeRateLimiter.entries()) {
      if (bucket.resetAt <= now) {
        analyzeRateLimiter.delete(key);
      }
    }
  }

  const existing = analyzeRateLimiter.get(clientKey);
  if (!existing || existing.resetAt <= now) {
    analyzeRateLimiter.set(clientKey, {
      count: 1,
      resetAt: now + appConfig.replayRateLimitWindowMs
    });
    return true;
  }

  if (existing.count >= appConfig.replayRateLimitMaxRequests) {
    return false;
  }

  existing.count += 1;
  analyzeRateLimiter.set(clientKey, existing);
  return true;
}

export async function POST(request: Request) {
  const clientId = getClientIdentifier(request);
  if (!consumeRateLimit(clientId)) {
    return NextResponse.json({ error: "Too many requests right now. Please wait a minute and retry." }, { status: 429 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > appConfig.maxReplayBytes * 2) {
    return NextResponse.json({ error: "Upload payload is too large." }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Could not read upload form data." }, { status: 400 });
  }

  const replayFile = formData.get("replay");
  if (!(replayFile instanceof File)) {
    return NextResponse.json({ error: "A replay file is required." }, { status: 400 });
  }

  const fileName = replayFile.name.toLowerCase();
  if (!hasAllowedExtension(fileName)) {
    return NextResponse.json({ error: "Unsupported replay file type. Upload .xml or .bbr files." }, { status: 400 });
  }

  if (replayFile.size > appConfig.maxReplayBytes) {
    return NextResponse.json(
      { error: `Replay file too large. Max size is ${Math.floor(appConfig.maxReplayBytes / (1024 * 1024))}MB.` },
      { status: 413 }
    );
  }

  let replayInput = "";
  try {
    replayInput = await replayFile.text();
  } catch {
    return NextResponse.json({ error: "Could not read replay file." }, { status: 400 });
  }

  if (replayInput.trim().length === 0) {
    return NextResponse.json({ error: "Replay file is empty." }, { status: 400 });
  }

  try {
    const startedAt = Date.now();
    const report = analyzeNufflizerInput(replayInput, {
      maxDecodedChars: appConfig.maxDecodedReplayChars
    });
    const durationMs = Date.now() - startedAt;

    if (durationMs > appConfig.maxAnalyzeDurationMs) {
      logger.info("Nufflizier analysis exceeded duration budget", {
        reportId: report.id,
        durationMs,
        budgetMs: appConfig.maxAnalyzeDurationMs
      });
    }

    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof ReplayValidationError) {
      const friendlyError = /parse failed/i.test(error.message)
        ? "Replay format was not readable. Please upload a valid BB3 .bbr or XML replay file."
        : error.message;
      return NextResponse.json({ error: friendlyError }, { status: 400 });
    }

    logger.error("Unexpected nufflizier analysis error", {
      error: error instanceof Error ? error.message : "Unknown error"
    });

    return NextResponse.json({ error: "Failed to analyze replay." }, { status: 500 });
  }
}
