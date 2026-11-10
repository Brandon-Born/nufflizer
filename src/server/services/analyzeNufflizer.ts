import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import type { LuckReport } from "@/domain/nufflizer/types";

export type AnalyzeNufflizerOptions = {
  maxDecodedChars?: number;
};

export function analyzeNufflizerXml(xml: string): LuckReport {
  const replay = parseReplayXml(xml);
  const report = LuckReportSchema.safeParse(analyzeReplayLuck(replay));
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

  return analyzeNufflizerXml(decoded.xml);
}
