import { inflateRawSync, inflateSync, gunzipSync } from "node:zlib";
import { ReplayValidationError } from "@/lib/errors";
import { REPLAY_LIMITS } from "./limits";

export type ReplayInputFormat = "xml" | "bbr";
export type DecodedReplay = { xml: string; format: ReplayInputFormat };
export type DecodeReplayOptions = { maxDecodedChars?: number };

export function decodeReplayInput(
  input: string,
  options: DecodeReplayOptions = {}
): DecodedReplay {
  if (
    Buffer.byteLength(input, "utf8") >
    (input.trimStart().startsWith("<")
      ? REPLAY_LIMITS.decodedBytes
      : REPLAY_LIMITS.inputBytes)
  )
    throw new ReplayValidationError("Replay input is too large.");
  const raw = input.trim();
  if (!raw) throw new ReplayValidationError("Replay input is empty.");
  const maxBytes = Math.min(
    options.maxDecodedChars ?? REPLAY_LIMITS.decodedBytes,
    REPLAY_LIMITS.decodedBytes
  );
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1)
    throw new ReplayValidationError("Invalid decode limit.");
  if (raw.startsWith("<")) {
    if (Buffer.byteLength(raw) > maxBytes)
      throw new ReplayValidationError("Replay XML is too large after decode.");
    return { xml: raw, format: "xml" };
  }
  const base64 = raw.replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 !== 0) {
    throw new ReplayValidationError(
      "Replay input is not valid XML or supported BB3 .bbr content."
    );
  }
  const binary = Buffer.from(base64, "base64");
  for (const decoder of [inflateSync, inflateRawSync, gunzipSync]) {
    try {
      const xml = decoder(binary, { maxOutputLength: maxBytes }).toString(
        "utf8"
      );
      if (xml.trimStart().startsWith("<")) return { xml, format: "bbr" };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE") {
        throw new ReplayValidationError(
          "Replay XML is too large after decode."
        );
      }
    }
  }
  throw new ReplayValidationError(
    "Replay input is not valid XML or supported BB3 .bbr content."
  );
}
