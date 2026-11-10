import { NextResponse } from "next/server";
import { appConfig } from "@/lib/config";
import { analyzeUpload } from "@/server/upload/analyzeUpload";
export const runtime = "nodejs";
export const maxDuration = 15;
export async function POST(request: Request) {
  const response =
    appConfig.legacyReplayApiMode === "enabled"
      ? await analyzeUpload(request, true)
      : NextResponse.json(
          {
            error:
              "This endpoint has been disabled. Use /api/nufflizier/analyze instead.",
            code: "LEGACY_ENDPOINT_DISABLED",
            replacement: "/api/nufflizier/analyze"
          },
          { status: 410 }
        );
  response.headers.set("Deprecation", "true");
  response.headers.set(
    "Sunset",
    new Date(appConfig.legacyReplayApiSunsetIso).toUTCString()
  );
  response.headers.set(
    "Link",
    '</api/nufflizier/analyze>; rel="successor-version"'
  );
  return response;
}
