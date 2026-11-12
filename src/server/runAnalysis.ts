import { Worker } from "node:worker_threads";
import path from "node:path";
import { ReplayValidationError } from "@/lib/errors";
import type { LuckReport } from "@/domain/nufflizer/types";
import type { ReplayAnalysisReport } from "./services/analyzeReplay";
import { REPLAY_LIMITS } from "@/domain/replay/limits";

export class AnalysisExecutionError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string
  ) {
    super(message);
  }
}
let active = 0;
export function activeAnalysisWorkers(): number {
  return active;
}
export async function runAnalysis(
  input: string,
  options?: {
    mode?: "primary";
    signal?: AbortSignal;
    timeoutMs?: number;
    maxReportBytes?: number;
  }
): Promise<LuckReport>;
export async function runAnalysis(
  input: string,
  options: {
    mode: "legacy";
    signal?: AbortSignal;
    timeoutMs?: number;
    maxReportBytes?: number;
  }
): Promise<ReplayAnalysisReport>;
export async function runAnalysis(
  input: string,
  options: {
    mode?: "primary" | "legacy";
    signal?: AbortSignal;
    timeoutMs?: number;
    maxReportBytes?: number;
  } = {}
): Promise<LuckReport | ReplayAnalysisReport> {
  if (Buffer.byteLength(input) > REPLAY_LIMITS.inputBytes)
    throw new ReplayValidationError("Replay input is too large.");
  if (
    options.maxReportBytes !== undefined &&
    (!Number.isSafeInteger(options.maxReportBytes) ||
      options.maxReportBytes < 1 ||
      options.maxReportBytes > REPLAY_LIMITS.responseBytes)
  )
    throw new Error("Invalid worker report size limit.");
  if (options.signal?.aborted)
    throw new AnalysisExecutionError("Analysis cancelled.", 499, "CANCELLED");
  if (active >= 2)
    throw new AnalysisExecutionError(
      "Analysis is busy. Please retry shortly.",
      503,
      "BUSY"
    );
  active++;
  let worker: Worker | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort = () => {};
  try {
    if (process.env.NUFFLIZIER_ANALYZER_TIMING === "1")
      console.info(JSON.stringify({
        event: "nufflizier_analysis_stage", stage: "worker_start", atMs: Date.now()
      }));
    worker = new Worker(
      path.join(process.cwd(), ".generated", "analysis-worker.cjs"),
      {
        workerData: {
          input,
          mode: options.mode ?? "primary",
          maxReportBytes: options.maxReportBytes
        },
        resourceLimits: { maxOldGenerationSizeMb: 256, stackSizeMb: 4 }
      }
    );
    return await new Promise((resolve, reject) => {
      abort = () =>
        reject(
          new AnalysisExecutionError("Analysis cancelled.", 499, "CANCELLED")
        );
      options.signal?.addEventListener("abort", abort, { once: true });
      timer = setTimeout(
        () =>
          reject(
            new AnalysisExecutionError(
              "Analysis timed out. Try a smaller replay.",
              504,
              "TIMEOUT"
            )
          ),
        options.timeoutMs ?? 4000
      );
      worker!.on("message", (message) => {
        if (process.env.NUFFLIZIER_ANALYZER_TIMING === "1" &&
            message.kind === "analysis_stage" &&
            ["worker_ready", "decode", "parse", "analyze", "validate", "serialize"].includes(message.stage) &&
            Number.isSafeInteger(message.atMs)) {
          console.info(JSON.stringify({
            event: "nufflizier_analysis_stage", stage: message.stage, atMs: message.atMs
          }));
          return;
        }
        if (message.ok) {
          try {
            resolve(
              message.json !== undefined
                ? JSON.parse(message.json)
                : message.report
            );
          } catch {
            reject(new Error("Analysis worker returned invalid JSON."));
          }
        } else if (message.kind === "report_limit")
          reject(
            new AnalysisExecutionError(
              "Report is too large for direct download. Try a smaller replay or use the CLI.",
              413,
              "REPORT_TOO_LARGE"
            )
          );
        else
          reject(
            message.validation
              ? new ReplayValidationError(message.message)
              : new Error("Analysis failed.")
          );
      });
      worker!.once("error", (error: Error & { code?: string }) =>
        reject(
          error.code === "ERR_WORKER_OUT_OF_MEMORY"
            ? new AnalysisExecutionError(
                "Replay exceeded the analysis memory budget. Try a smaller replay.",
                413,
                "RESOURCE_LIMIT"
              )
            : error
        )
      );
      worker!.once("exit", (code) =>
        reject(
          new AnalysisExecutionError(
            `Analysis worker stopped (${code}).`,
            503,
            "WORKER_EXIT"
          )
        )
      );
      if (options.signal?.aborted) abort();
    });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
    if (worker) {
      await worker.terminate();
      worker.removeAllListeners();
    }
    active--;
  }
}
