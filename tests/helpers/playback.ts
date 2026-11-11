import { readFileSync } from "node:fs";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { encodedMessage } from "./replay";

interface Projection {
  [key: string]: null | string | Projection | (string | Projection)[];
}
type RecordEvidence = { step: Projection; messages: Projection[] };
function element(
  tag: string,
  values: null | string | Projection | (string | Projection)[]
): string {
  return (Array.isArray(values) ? values : [values])
    .map(
      (value) =>
        `<${tag}>${value === null ? "" : typeof value === "string" ? value : xml(value)}</${tag}>`
    )
    .join("");
}
function xml(value: Projection): string {
  return Object.entries(value)
    .map(([tag, values]) => element(tag, values))
    .join("");
}
// Replay the exact numeric extracts through the production decoder and scorer.
// UI labels and expected probabilities below are independent of runtime maps.
export function playbackFragmentXml(
  source: string,
  id: string,
  home: number[],
  away: number[],
  includeDirect = false
) {
  const evidence = JSON.parse(
    readFileSync(
      `tests/fixtures/evidence/bb3-ui-playback-${source}.json`,
      "utf8"
    )
  );
  const observation = evidence.cases.find((c: { id: string }) => c.id === id);
  const roster = (team: number, ids: number[]) =>
    `<TeamState><Data><TeamId>${team}</TeamId></Data><ListPitchPlayers>${ids.map((player) => `<PlayerState><Id>${player}</Id></PlayerState>`).join("")}</ListPitchPlayers></TeamState>`;
  const steps = observation.rawRecords
    .map(
      (r: RecordEvidence) =>
        `<StepResult><Step><MessageData>${encodedMessage(xml(r.step))}</MessageData></Step><Results>${r.messages.map((m) => `<StringMessage><MessageData>${encodedMessage(xml(m))}</MessageData></StringMessage>`).join("")}</Results></StepResult>`
    )
    .join("");
  const direct: string[][] = [];
  if (includeDirect) {
    for (const record of observation.eventRecords as {
      replayStep: number;
      eventIndex: number;
      projection: Projection;
    }[]) {
      const step = (direct[record.replayStep - 1] ??= []);
      step[record.eventIndex] = xml(record.projection);
    }
  }
  const directXml = Array.from(
    direct,
    (step) =>
      `<ReplayStep>${step ? Array.from(step, (child) => child ?? "<Clock/>").join("") : ""}</ReplayStep>`
  ).join("");
  return `<Replay><ReplayVersion>${evidence.source.replayVersion}</ReplayVersion><Teams><Team><id>0</id><name>Home</name></Team><Team><id>1</id><name>Away</name></Team></Teams><NotificationGameJoined><InitialBoardState><ListTeams>${roster(0, home)}${roster(1, away)}</ListTeams></InitialBoardState></NotificationGameJoined><EventExecuteSequence><Sequence>${steps}</Sequence></EventExecuteSequence>${directXml}</Replay>`;
}

export function playbackFragment(
  ...args: Parameters<typeof playbackFragmentXml>
) {
  return parseReplayXml(playbackFragmentXml(...args));
}
