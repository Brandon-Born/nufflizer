import { z } from "zod";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import type { LuckReport } from "@/domain/nufflizer/types";
import { REPLAY_LIMITS } from "@/domain/replay/limits";

class ResponseSizeError extends Error {}

const ErrorBody = z.object({ error: z.string().min(1).max(1024) });
async function boundedText(
  response: Response,
  maxBytes: number
): Promise<string> {
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw new ResponseSizeError("Response exceeds the size limit.");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes)
        throw new ResponseSizeError("Response exceeds the size limit.");
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join("");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export async function readAnalysisResponse(
  response: Response
): Promise<LuckReport> {
  if (!response.ok) {
    const fallback =
      response.status === 413
        ? "Upload or report is too large. Maximum file size is 4 MB."
        : response.status === 504
          ? "Analysis timed out. Try a smaller replay."
          : response.status === 429
            ? "Too many requests. Please wait a minute and retry."
            : `Replay analysis failed (HTTP ${response.status}). Please retry.`;
    let message = fallback;
    try {
      const body = ErrorBody.safeParse(
        JSON.parse(await boundedText(response, 4096))
      );
      if (body.success) message = body.data.error;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
    }
    throw new Error(message);
  }
  let raw: unknown;
  let text: string;
  try {
    text = await boundedText(response, REPLAY_LIMITS.responseBytes);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new Error(
      error instanceof ResponseSizeError
        ? "The report could not be downloaded within the size limit. Try a smaller replay."
        : "The report download was interrupted. Please retry."
    );
  }
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("The server returned an unreadable report. Please retry.");
  }
  const result = LuckReportSchema.safeParse(raw);
  if (!result.success)
    throw new Error(
      "The report format or totals are inconsistent. Please reload and retry."
    );
  return result.data;
}
