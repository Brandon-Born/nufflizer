import { readFileSync } from "node:fs";
import { encodedMessage, envelope } from "./replay";
import { projectionXml } from "./playback";
type Projection = Parameters<typeof projectionXml>[0];
export type ThrowFragment = {
  header: Projection;
  messages: { tag: string; payload: Projection }[];
};
// Serialized numeric source fragments; no application enums or derived roles.
export function throwTeamMateXml(
  edit?: (rows: ThrowFragment[]) => void,
  rosterEdit?: (teams: number[][]) => void
) {
  const f = JSON.parse(
    readFileSync(
      "tests/fixtures/evidence/bb3-throw-team-mate-roles.json",
      "utf8"
    )
  );
  const rows = f.headers.filter(
    (h: { file: string }) => h.file === "demo1.bbr"
  ) as ThrowFragment[];
  edit?.(rows);
  const teams = [[1], [37, 50]];
  rosterEdit?.(teams);
  const roster = teams
    .map(
      (ids, i) =>
        `<TeamState><Data><TeamId>${i}</TeamId></Data><GameTurn>16</GameTurn><ListPitchPlayers>${ids.map((id) => `<PlayerState><Id>${id}</Id><Cell><X>13</X><Y>${id === 50 ? 8 : 7}</Y></Cell><CanAct>1</CanAct></PlayerState>`).join("")}</ListPitchPlayers></TeamState>`
    )
    .join("");
  const board = `<CurrentPhase>5</CurrentPhase><Period>1</Period><ActiveGamer>1</ActiveGamer><ListTeams>${roster}</ListTeams>`;
  const seq = (r: ThrowFragment) =>
    `<EventExecuteSequence><Sequence><StepResult><Step><MessageData>${encodedMessage(projectionXml({ ThrowTeamMateStep: r.header }))}</MessageData></Step><Results>${r.messages.map((m) => `<StringMessage><MessageData>${encodedMessage(projectionXml({ [m.tag]: m.payload }))}</MessageData></StringMessage>`).join("")}</Results></StepResult></Sequence></EventExecuteSequence>`;
  return envelope(
    `<NotificationGameJoined><InitialBoardState>${board}</InitialBoardState></NotificationGameJoined>` +
      rows
        .map(
          (r) =>
            `<ReplayStep>${seq(r)}<BoardState>${board}</BoardState></ReplayStep>`
        )
        .join("")
  );
}
