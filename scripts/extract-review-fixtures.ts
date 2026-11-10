// Bounded extraction from an already sanitized fixture. This is source provenance, not a rules oracle.
import { readFileSync, writeFileSync } from "node:fs";
import { decodeReplayInput } from "../src/domain/replay/decodeReplay";
import { parseReplayXml } from "../src/domain/replay/parseXml";
const xml = decodeReplayInput(
  readFileSync("demo-replays/demo1.bbr", "utf8")
).xml;
const replay = parseReplayXml(xml);
const sequences = [
  ...xml.matchAll(/<EventExecuteSequence>[\s\S]*?<\/EventExecuteSequence>/g)
].map((m) => m[0]);
const header =
  "<Replay><ReplayVersion>1-4-0-0</ReplayVersion><MatchId>sanitized-review-fragment</MatchId><Teams><Team><id>0</id><name>Home</name></Team><Team><id>1</id><name>Away</name></Team></Teams><NotificationGameJoined><InitialBoardState><ListTeams><TeamState><Data><TeamId>1</TeamId></Data><ListPitchPlayers>" +
  [37, 42, 50]
    .map(
      (id) =>
        `<PlayerState><Id>${id}</Id><Data><TeamId>1</TeamId></Data></PlayerState>`
    )
    .join("") +
  "</ListPitchPlayers></TeamState></ListTeams></InitialBoardState></NotificationGameJoined>";
const selfSequences = [
  ...new Set(
    replay.turns[11]!.events.filter((e) => e.playerId === "50").map((e) =>
      Number(e.sequenceId?.split("-")[1])
    )
  )
].filter(Number.isFinite);
const injurySequence = Number(
  replay.turns
    .flatMap((t) => t.events)
    .find((e) => e.sourceTag === "ResultInjuryRoll")
    ?.sequenceId?.split("-")[1]
);
const fragments: { name: string; sequences: number[] }[] = [
  { name: "reroll-cross-link", sequences: [69, 70, 72, 73, 74, 75, 76] },
  { name: "self-damage", sequences: selfSequences },
  { name: "real-block-injury", sequences: [7, injurySequence] }
];
for (const fragment of fragments)
  writeFileSync(
    `tests/fixtures/remediation/${fragment.name}.xml`,
    header +
      fragment.sequences.map((i) => sequences[i - 1]).join("") +
      "</Replay>"
  );
writeFileSync(
  "tests/fixtures/remediation/fragments-provenance.json",
  JSON.stringify(
    {
      source: "demo-replays/demo1.bbr",
      sequenceIndex:
        "one-based EventExecuteSequence order in original decoded source",
      header:
        "Synthetic minimal envelope/unnamed ownership records; embedded messages retained verbatim from sanitized source",
      fragments
    },
    null,
    2
  ) + "\n"
);
