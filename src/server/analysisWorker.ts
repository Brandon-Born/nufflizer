import { parentPort, workerData } from "node:worker_threads";
import { analyzeNufflizerInput } from "./services/analyzeNufflizer";
import { analyzeReplayInput } from "./services/analyzeReplay";
import { ReplayValidationError } from "@/lib/errors";

function execute() {
  try {
    const report =
      workerData.mode === "legacy"
        ? analyzeReplayInput(workerData.input)
        : analyzeNufflizerInput(workerData.input);
    if (workerData.maxReportBytes !== undefined) {
      // Serialize under the same terminating deadline as parsing/scoring, before copying to the API thread.
      const json = JSON.stringify(report);
      if (Buffer.byteLength(json) > workerData.maxReportBytes) {
        parentPort!.postMessage({ ok: false, kind: "report_limit" });
        return;
      }
      parentPort!.postMessage({ ok: true, json });
    } else parentPort!.postMessage({ ok: true, report });
  } catch (error) {
    parentPort!.postMessage({
      ok: false,
      validation: error instanceof ReplayValidationError,
      message: error instanceof Error ? error.message : "Analysis failed."
    });
  }
}
execute();
