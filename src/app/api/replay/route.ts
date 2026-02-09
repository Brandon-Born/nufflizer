import { NextResponse } from "next/server";

import { ReplayValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { appConfig } from "@/lib/config";
import { analyzeReplayInput } from "@/server/services/analyzeReplay";

export const runtime = "nodejs";

type RateBucket = {
  count: number;
  resetAt: number;
};

const replayRateLimiter = new Map<string, RateBucket>();

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

function consumeReplayRateLimit(clientKey: string): boolean {
  const now = Date.now();

  if (replayRateLimiter.size > 1000) {
    for (const [key, bucket] of replayRateLimiter.entries()) {
      if (bucket.resetAt <= now) {
        replayRateLimiter.delete(key);
      }
    }
  }

  const existing = replayRateLimiter.get(clientKey);

  if (!existing || existing.resetAt <= now) {
    replayRateLimiter.set(clientKey, {
      count: 1,
      resetAt: now + appConfig.replayRateLimitWindowMs
    });
    return true;
  }

  if (existing.count >= appConfig.replayRateLimitMaxRequests) {
    return false;
  }

  existing.count += 1;
  replayRateLimiter.set(clientKey, existing);
  return true;
}

export async function POST(request: Request) {
  const clientId = getClientIdentifier(request);
  if (!consumeReplayRateLimit(clientId)) {
    logger.warn("Replay API rate limit exceeded", {
      clientId,
      windowMs: appConfig.replayRateLimitWindowMs,
      maxRequests: appConfig.replayRateLimitMaxRequests
    });

    return NextResponse.json({ error: "Too many replay uploads right now. Please wait about a minute and try again." }, { status: 429 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > appConfig.maxReplayBytes * 2) {
    logger.warn("Replay upload rejected due to oversized request payload", {
      clientId,
      contentLength,
      maxReplayBytes: appConfig.maxReplayBytes
    });

    return NextResponse.json({ error: "Upload payload is too large." }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Could not read upload form data. Please try uploading the replay again." }, { status: 400 });
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
    logger.warn("Replay file rejected due to size", {
      clientId,
      fileSize: replayFile.size,
      maxReplayBytes: appConfig.maxReplayBytes
    });

    return NextResponse.json(
      { error: `Replay file too large. Max size is ${Math.floor(appConfig.maxReplayBytes / (1024 * 1024))}MB.` },
      { status: 413 }
    );
  }

  let replayInput = "";
  try {
    replayInput = await replayFile.text();
  } catch {
    return NextResponse.json({ error: "Could not read the replay file. Please try another file." }, { status: 400 });
  }

  if (replayInput.trim().length === 0) {
    return NextResponse.json({ error: "Replay file is empty." }, { status: 400 });
  }

  try {
    const startedAt = Date.now();
    const report = analyzeReplayInput(replayInput, {
      maxDecodedChars: appConfig.maxDecodedReplayChars
    });
    const analyzeDuration = Date.now() - startedAt;

    if (analyzeDuration > appConfig.maxAnalyzeDurationMs) {
      logger.info("Replay analysis exceeded duration budget", {
        reportId: report.id,
        durationMs: analyzeDuration,
        budgetMs: appConfig.maxAnalyzeDurationMs
      });

      return NextResponse.json(
        { error: "Replay analysis took too long. Try a smaller replay or trim long overtime games." },
        { status: 413 }
      );
    }

    if (report.replay.unknownCodes.length > 0) {
      logger.info("Replay contains unknown mapping codes", {
        reportId: report.id,
        unknownCodes: report.replay.unknownCodes.slice(0, 10)
      });

      const unknownCount = report.replay.unknownCodes.reduce((sum, item) => sum + item.occurrences, 0);
      if (unknownCount >= 50) {
        logger.warn("Replay has high unknown-code volume", {
          reportId: report.id,
          unknownCount
        });
      }
    }

    if (report.analysis.findings.length === 0) {
      logger.info("Replay produced no coaching findings", {
        reportId: report.id,
        turnCount: report.replay.turnCount
      });
    }

    const highSeverityFindings = report.analysis.findings.filter((finding) => finding.severity === "high").length;
    if (highSeverityFindings >= 6) {
      logger.warn("Replay generated unusually high number of high-severity findings", {
        reportId: report.id,
        highSeverityFindings
      });
    }

    return NextResponse.json({ report });
  } catch (error) {
    if (error instanceof ReplayValidationError) {
      const friendlyError = /parse failed/i.test(error.message)
        ? "Replay format was not readable. Please upload a valid BB3 .bbr or XML replay file."
        : error.message;
      return NextResponse.json({ error: friendlyError }, { status: 400 });
    }

    logger.error("Unexpected replay analysis error", {
      error: error instanceof Error ? error.message : "Unknown error"
    });

    return NextResponse.json({ error: "Failed to analyze replay." }, { status: 500 });
  }
}
