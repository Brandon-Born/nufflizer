import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import type { LuckReport } from "@/domain/nufflizer/types";

export type AnalyzeNufflizerOptions = {
  maxDecodedChars?: number;
  onStage?: (stage: "decode" | "parse" | "analyze" | "validate") => void;
};

export function analyzeNufflizerXml(
  xml: string,
  options: Pick<AnalyzeNufflizerOptions, "onStage"> = {}
): LuckReport {
  const replay = parseReplayXml(xml, { omitRawReplaySteps: true });
  options.onStage?.("parse");
  const normalized = analyzeReplayLuck(replay);
  options.onStage?.("analyze");
  const report = LuckReportSchema.safeParse(normalized);
  options.onStage?.("validate");
  if (!report.success)
    throw new Error("Generated report failed contract validation.");
  return report.data;
}

export function analyzeNufflizerInput(
  input: string,
  options: AnalyzeNufflizerOptions = {}
): LuckReport {
  const decoded = decodeReplayInput(input, {
    maxDecodedChars: options.maxDecodedChars
  });

  options.onStage?.("decode");
  return analyzeNufflizerXml(decoded.xml, options);
}
