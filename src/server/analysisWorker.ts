import { parentPort, workerData } from "node:worker_threads";
import { analyzeNufflizerInput } from "./services/analyzeNufflizer";
import { analyzeReplayInput } from "./services/analyzeReplay";
import { ReplayValidationError } from "@/lib/errors";

function execute() {
  const onStage =
    process.env.NUFFLIZIER_ANALYZER_TIMING === "1"
      ? (stage: string) =>
          parentPort!.postMessage({
            kind: "analysis_stage",
            stage,
            atMs: Date.now()
          })
      : undefined;
  onStage?.("worker_ready");
  try {
    const report =
      workerData.mode === "legacy"
        ? analyzeReplayInput(workerData.input)
        : analyzeNufflizerInput(workerData.input, { onStage });
    if (workerData.maxReportBytes !== undefined) {
      // Serialize under the same terminating deadline as parsing/scoring, before copying to the API thread.
      const json = JSON.stringify(report);
      onStage?.("serialize");
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
