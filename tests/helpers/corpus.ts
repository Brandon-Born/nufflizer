import { readFileSync, readdirSync } from "node:fs";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
let corpus: ReturnType<typeof load> | undefined;
function load() {
  return readdirSync("demo-replays")
    .filter((file) => file.endsWith(".bbr"))
    .sort()
    .map((file) => {
      const replay = parseReplayXml(
        decodeReplayInput(readFileSync(`demo-replays/${file}`, "utf8")).xml
      );
      return { file, replay, report: analyzeReplayLuck(replay) };
    });
}
export function demoCorpus() {
  return (corpus ??= load());
}
