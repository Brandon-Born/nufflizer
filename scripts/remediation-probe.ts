import { readFileSync, readdirSync } from "node:fs";
import { decodeReplayInput } from "../src/domain/replay/decodeReplay";
import { parseReplayXml } from "../src/domain/replay/parseXml";
import { analyzeNufflizerInput } from "../src/server/services/analyzeNufflizer";

const xml = decodeReplayInput(
  readFileSync("demo-replays/demo1.bbr", "utf8")
).xml;
for (const [name, input] of [
  ["original", xml],
  ["declaration", '<?xml version="1.0"?>' + xml],
  ["whitespace", xml.replaceAll("><", ">\n<")],
  ["junk", "<hello>world</hello>"],
  [
    "zero-event-smoke",
    readFileSync("tests/fixtures/replays/sample-basic.xml", "utf8")
  ]
]) {
  try {
    const report = analyzeNufflizerInput(input!);
    console.log(
      JSON.stringify({
        name,
        events: report.events.length,
        verdict: report.verdict,
        coverage: report.coverage.rollCandidates
      })
    );
  } catch (error) {
    console.log(JSON.stringify({ name, error: String(error) }));
  }
}
for (const file of readdirSync("demo-replays")
  .filter((file) => file.endsWith(".bbr"))
  .sort()) {
  const input = readFileSync(`demo-replays/${file}`, "utf8");
  const replay = parseReplayXml(decodeReplayInput(input).xml);
  const report = analyzeNufflizerInput(input);
  console.log(
    JSON.stringify({
      file,
      version: replay.replayVersion,
      teams: replay.teams.length,
      turns: replay.turns.length,
      events: report.events.length,
      coverage: report.coverage.rollCandidates,
      scoredByType: report.coverage.scoredByType
    })
  );
}
