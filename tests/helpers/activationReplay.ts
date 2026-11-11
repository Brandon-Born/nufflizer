import { encodedMessage, envelope } from "./replay";
import { readFileSync } from "node:fs";
import { projectionXml } from "./playback";

type Projection = Parameters<typeof projectionXml>[0];
type Row = {
  projection?: Projection;
  steps?: { step: Projection; messages: Projection[] }[];
};
export function activationAftermathFragment(
  id: string,
  evidenceFile = "tests/fixtures/evidence/bb3-activation-aftermath.json"
) {
  const evidence = JSON.parse(readFileSync(evidenceFile, "utf8"));
  const c = evidence.cases.find((c: { id: string }) => c.id === id);
  // The source's numeric roster order supplies only an ownership scaffold;
  // fragment locators are renumbered. No omitted state flags are filled.
  const firstBoard = c.records.find((r: Row) => r.projection).projection
    .BoardState;
  const teams = firstBoard.ListTeams[0].TeamState as {
    ListPitchPlayers: { PlayerState: { Id: string[] }[] }[];
  }[];
  const roster = teams
    .map(
      (t, i) =>
        `<TeamState><Data><TeamId>${i}</TeamId></Data><ListPitchPlayers>${t.ListPitchPlayers[0]!.PlayerState.map((p) => `<PlayerState><Id>${p.Id[0]}</Id></PlayerState>`).join("")}</ListPitchPlayers></TeamState>`
    )
    .join("");
  return envelope(
    `<NotificationGameJoined><InitialBoardState><ListTeams>${roster}</ListTeams></InitialBoardState></NotificationGameJoined>` +
      c.records
        .map(
          (r: Row) =>
            `<ReplayStep>${r.projection ? projectionXml(r.projection) : `<EventExecuteSequence><Sequence>${r.steps!.map((s) => stepResult(projectionXml(s.step), s.messages.map(projectionXml))).join("")}</Sequence></EventExecuteSequence>`}</ReplayStep>`
        )
        .join("")
  );
}
function stepResult(step: string, messages: string[]) {
  return `<StepResult><Step><MessageData>${encodedMessage(step)}</MessageData></Step><Results>${messages.map((m) => `<StringMessage><MessageData>${encodedMessage(m)}</MessageData></StringMessage>`).join("")}</Results></StepResult>`;
}
const position = (x: number, y: number) => `<X>${x}</X><Y>${y}</Y>`;
export function activationContextXml(
  kind: "move" | "mental" | "replacement" = "move"
) {
  const player = (
    id: number,
    x: number,
    y: number,
    available: boolean,
    tz = true
  ) =>
    `<PlayerState><Id>${id}</Id><Cell>${position(x, y)}</Cell>${available ? "<CanAct>1</CanAct>" : ""}<Status>0</Status><Situation>0</Situation><MovePoint>5</MovePoint>${tz ? "<TackleZone>1</TackleZone>" : ""}</PlayerState>`;
  const board = (after: boolean) =>
    `<BoardState><IsStable>1</IsStable><CurrentPhase>5</CurrentPhase><ActiveTeam>0</ActiveTeam><Period>0</Period><ListTeams><TeamState><Data><TeamId>0</TeamId></Data><GameTurn>1</GameTurn><ListPitchPlayers>${player(42, kind === "move" && after ? 9 : 8, 7, !after || kind === "move", !after || kind === "move")}${player(43, 4, 4, true)}${player(44, 3, 4, true)}</ListPitchPlayers></TeamState><TeamState><Data><TeamId>1</TeamId></Data><GameTurn>1</GameTurn><ListPitchPlayers>${player(7, kind === "move" ? 10 : 9, 7, true)}</ListPitchPlayers></TeamState></ListTeams><Ball><IsHeld>0</IsHeld><Cell>${position(20, 10)}</Cell></Ball></BoardState>`;
  const step = (
    actor: number,
    type: number,
    x: number,
    y: number,
    tx = x,
    ty = y,
    target = -1
  ) =>
    `<PlayerStep><PlayerId>${actor}</PlayerId><TargetId>${target}</TargetId><StepType>${type}</StepType><IsEvaluation>0</IsEvaluation><Skill>0</Skill><CellFrom>${position(x, y)}</CellFrom><CellTo>${position(tx, ty)}</CellTo></PlayerStep>`;
  const sequence = (step: string, messages: string[]) =>
    `<EventExecuteSequence><Sequence>${stepResult(step, messages)}</Sequence></EventExecuteSequence>`;
  const use = (n: number) =>
    `<ResultUseAction><Action>${n}</Action><TeamId>0</TeamId></ResultUseAction>`;
  let initial: string;
  if (kind === "move")
    initial =
      sequence(step(42, 0, 8, 7), [use(1)]) +
      sequence(step(42, 1, 8, 7, 9, 7), [
        "<ResultDoMove/>",
        "<ResultMoveOutcome><Moved>1</Moved><TentacleUsed>0</TentacleUsed><FumbleRooskieUsed>0</FumbleRooskieUsed></ResultMoveOutcome>"
      ]);
  else if (kind === "mental")
    initial = sequence(step(42, 0, 8, 7, 9, 7, 7), [
      use(2),
      "<ResultSkillUsage><PlayerId>42</PlayerId><Skill>31</Skill><Used>1</Used></ResultSkillUsage>",
      "<ResultRoll><Status>1</Status><NewRoll>1</NewRoll><Requirement>2</Requirement><Difficulty>2</Difficulty><RollType>33</RollType><Outcome>0</Outcome><Dice><Die><DieType>0</DieType><Value>1</Value></Die></Dice></ResultRoll>",
      "<ResultAddPlayerEffect><PlayerId>42</PlayerId><Effect><Durations><DurationsItem>6</DurationsItem><DurationsItem>1</DurationsItem></Durations><ProviderType>4</ProviderType><ProviderId>31</ProviderId><EffectId>44</EffectId></Effect></ResultAddPlayerEffect>"
    ]);
  else {
    const evidence = JSON.parse(
      readFileSync("tests/fixtures/evidence/bb3-ui-playback-001.json", "utf8")
    );
    const records = evidence.cases.find(
      (c: { id: string }) => c.id === "UI-007"
    ).rawRecords;
    // Exact UI-007 messages, with IDs consistently renamed into this synthetic
    // complete-state scaffold. This is not a captured board for source001.
    initial = records
      .map((r: { messages: Projection[] }) =>
        sequence(
          step(42, 0, 8, 7, 9, 7, 7),
          r.messages.map((m) =>
            projectionXml(m)
              .replaceAll("<PlayerId>37</PlayerId>", "<PlayerId>42</PlayerId>")
              .replaceAll("<GamerId>1</GamerId>", "<GamerId>0</GamerId>")
          )
        )
      )
      .join("");
  }
  const check = (fresh: number) =>
    `<Status>1</Status><NewRoll>${fresh}</NewRoll><Requirement>2</Requirement><Difficulty>2</Difficulty><RollType>2</RollType><Outcome>0</Outcome><Dice><Die><DieType>0</DieType><Value>1</Value></Die></Dice>`;
  return envelope(
    `<NotificationGameJoined><InitialBoardState>${board(false).replace(/<\/?BoardState>/g, "")}</InitialBoardState></NotificationGameJoined><ReplayStep>${board(false)}${initial}</ReplayStep><ReplayStep>${board(true)}${sequence(step(43, 0, 4, 4), [use(1)])}${sequence(step(43, 1, 4, 4, 5, 4), [`<QuestionTeamRerollUsage><GamerId>0</GamerId><CanUseTeamReroll>1</CanUseTeamReroll><RollInfos>${check(1)}</RollInfos></QuestionTeamRerollUsage>`])}</ReplayStep><ReplayStep>${sequence(step(43, 1, 4, 4, 5, 4), ["<ResultTeamRerollUsage><GamerId>0</GamerId><Used>0</Used></ResultTeamRerollUsage>", `<ResultRoll>${check(0)}</ResultRoll>`])}</ReplayStep>`
  );
}
