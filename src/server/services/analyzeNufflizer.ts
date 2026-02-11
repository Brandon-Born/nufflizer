import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import type { LuckReport } from "@/domain/nufflizer/types";

export type AnalyzeNufflizerOptions = {
  maxDecodedChars?: number;
};

export function analyzeNufflizerXml(xml: string): LuckReport {
  const replay = parseReplayXml(xml);
  return analyzeReplayLuck(replay);
}

export function analyzeNufflizerInput(input: string, options: AnalyzeNufflizerOptions = {}): LuckReport {
  const decoded = decodeReplayInput(input, {
    maxDecodedChars: options.maxDecodedChars
  });

  return analyzeNufflizerXml(decoded.xml);
}
