import { REPLAY_LIMITS } from "@/domain/replay/limits";
import { ReplayValidationError } from "@/lib/errors";

export class UploadError extends ReplayValidationError {
  constructor(
    message: string,
    public readonly status: number = 400
  ) {
    super(message);
  }
}

export async function readReplayUpload(request: Request): Promise<string> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(contentType))
    throw new UploadError("Upload one replay using multipart form data.");
  const length = Number(request.headers.get("content-length"));
  if (length > REPLAY_LIMITS.requestBytes)
    throw new UploadError("Upload payload is too large.", 413);
  if (!request.body) throw new UploadError("A replay file is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let rejectRead: (error: Error) => void = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    rejectRead = reject;
  });
  const abort = () => {
    rejectRead(new UploadError("Upload cancelled.", 499));
    void reader.cancel().catch(() => {});
  };
  request.signal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => {
    rejectRead(new UploadError("Upload timed out.", 408));
    void reader.cancel().catch(() => {});
  }, 10_000);
  try {
    if (request.signal.aborted) throw new UploadError("Upload cancelled.", 499);
    while (true) {
      const { done, value } = await Promise.race([reader.read(), interrupted]);
      if (done) break;
      size += value.byteLength;
      if (size > REPLAY_LIMITS.requestBytes)
        throw new UploadError("Upload payload is too large.", 413);
      chunks.push(value);
    }
    const body = Buffer.concat(chunks, size);
    let form: FormData;
    try {
      form = await new Response(body, {
        headers: { "content-type": contentType }
      }).formData();
    } catch {
      throw new UploadError("Could not read upload form data.");
    }
    const fields = [...form.entries()];
    if (
      fields.length !== 1 ||
      fields[0]?.[0] !== "replay" ||
      !(fields[0][1] instanceof File)
    ) {
      throw new UploadError(
        "Upload exactly one replay file and no extra fields."
      );
    }
    const file = fields[0][1];
    if (!/\.(xml|bbr)$/i.test(file.name))
      throw new UploadError(
        "Unsupported replay file type. Upload .xml or .bbr files."
      );
    if (file.size > REPLAY_LIMITS.inputBytes)
      throw new UploadError(
        "Replay file too large. Maximum size is 4 MB.",
        413
      );
    const input = await file.text();
    if (!input.trim()) throw new UploadError("Replay file is empty.");
    return input;
  } finally {
    clearTimeout(timeout);
    request.signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
