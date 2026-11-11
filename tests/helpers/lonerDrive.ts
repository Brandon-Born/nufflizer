import { readFileSync } from "node:fs";
import { projectionXml } from "./playback";
import { envelope, encodedMessage } from "./replay";
type Projection = Parameters<typeof projectionXml>[0];
type Row = {
  replayStep: number;
  childIndex: number;
  projection?: Projection;
  steps?: { step: Projection; messages: Projection[] }[];
};
export function lonerDriveXml(
  id: string,
  evidencePath = "tests/fixtures/evidence/bb3-loner-drive.json"
) {
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  const sample = evidence.cases.find((c: { id: string }) => c.id === id);
  const first = sample.records.find((r: Row) => r.projection?.BoardState)
    .projection.BoardState;
  const teams = first.ListTeams[0].TeamState as {
    ListPitchPlayers: { PlayerState: { Id: string[] }[] }[];
  }[];
  const scaffold = teams
    .map(
      (team, i) =>
        `<TeamState><Data><TeamId>${i}</TeamId></Data><ListPitchPlayers>${team.ListPitchPlayers[0]!.PlayerState.map((p) => `<PlayerState><Id>${p.Id[0]}</Id></PlayerState>`).join("")}</ListPitchPlayers></TeamState>`
    )
    .join("");
  const rows = new Map<number, string[]>();
  for (const record of sample.records as Row[]) {
    const children = rows.get(record.replayStep) ?? [];
    while (children.length <= record.childIndex) children.push("<Clock/>");
    children[record.childIndex] = record.projection
      ? projectionXml(record.projection)
      : `<EventExecuteSequence><Sequence>${record.steps!.map((s) => `<StepResult><Step><MessageData>${encodedMessage(projectionXml(s.step))}</MessageData></Step><Results>${s.messages.map((m) => `<StringMessage><MessageData>${encodedMessage(projectionXml(m))}</MessageData></StringMessage>`).join("")}</Results></StepResult>`).join("")}</Sequence></EventExecuteSequence>`;
    rows.set(record.replayStep, children);
  }
  return envelope(
    `<NotificationGameJoined><InitialBoardState><ListTeams>${scaffold}</ListTeams></InitialBoardState></NotificationGameJoined>` +
      [...rows.values()]
        .map((children) => `<ReplayStep>${children.join("")}</ReplayStep>`)
        .join("")
  );
}
