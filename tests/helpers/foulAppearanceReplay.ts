import { readFileSync } from "node:fs";
import { projectionXml } from "./playback";
import { encodedMessage, envelope } from "./replay";

export function foulAppearancePlaybackXml() {
  const evidence = JSON.parse(
    readFileSync("tests/fixtures/evidence/bb3-ui-playback-016.json", "utf8")
  );
  const sample = evidence.cases.find((c: { id: string }) => c.id === "UI-099");
  const step = (sequence: number, stepIndex: number) => {
    const record = sample.rawRecords.find(
      (r: { sequence: number; stepIndex: number }) =>
        r.sequence === sequence && r.stepIndex === stepIndex
    );
    return `<StepResult><Step><MessageData>${encodedMessage(projectionXml(record.step))}</MessageData></Step><Results>${record.messages.map((m: Parameters<typeof projectionXml>[0]) => `<StringMessage><MessageData>${encodedMessage(projectionXml(m))}</MessageData></StringMessage>`).join("")}</Results></StepResult>`;
  };
  const sequence = (...steps: string[]) =>
    `<EventExecuteSequence><Sequence>${steps.join("")}</Sequence></EventExecuteSequence>`;
  const board = (index: number) =>
    projectionXml(sample.eventRecords[index].projection);
  const roster = (team: number, ids: number[]) =>
    `<TeamState><Data><TeamId>${team}</TeamId></Data><ListPitchPlayers>${ids.map((id) => `<PlayerState><Id>${id}</Id></PlayerState>`).join("")}</ListPitchPlayers></TeamState>`;
  // Minimal numeric fragment in the UI-annotated before/after order. Source
  // sequences254–257 and boards304–307 keep their exact numeric projections;
  // fragment ReplayStep/sequence locators are deliberately renumbered.
  return envelope(
    `<NotificationGameJoined><InitialBoardState><ListTeams>${roster(0, [10])}${roster(1, [37, 42, 43, 44])}</ListTeams></InitialBoardState></NotificationGameJoined>` +
      [
        board(0),
        sequence(step(254, 0)),
        board(1),
        sequence(step(255, 0)),
        board(2),
        sequence(step(256, 0)),
        board(3),
        sequence(step(257, 0), step(257, 1))
      ]
        .map((child) => `<ReplayStep>${child}</ReplayStep>`)
        .join("")
  );
}

export function foulAppearanceContextXml(
  options: {
    interrupt?: boolean;
    nextTurn?: boolean;
    explicitAvailable?: boolean;
  } = {}
) {
  const position = (x: number, y: number) => `<X>${x}</X><Y>${y}</Y>`;
  const player = (
    id: number,
    x: number,
    y: number,
    available: boolean | null
  ) =>
    `<PlayerState><Id>${id}</Id>${id !== 7 ? `<Data><Id>${id}</Id><InnateSkills/><AcquiredSkills/></Data><Effects/>` : ""}<Cell>${position(x, y)}</Cell>${available === null ? "" : `<CanAct>${Number(available)}</CanAct>`}<Status>0</Status><Situation>0</Situation><MovePoint>5</MovePoint></PlayerState>`;
  const board = (after: boolean) =>
    `<BoardState><IsStable>1</IsStable><CurrentPhase>5</CurrentPhase><ActiveTeam>0</ActiveTeam><Period>0</Period><TurnsPerPeriod>8</TurnsPerPeriod><Ball><IsHeld>0</IsHeld><Cell>${position(20, 10)}</Cell></Ball><ListTeams>` +
    `<TeamState><Data><TeamId>0</TeamId></Data><GameTurn>${after && options.nextTurn ? 2 : 1}</GameTurn><ListPitchPlayers>${player(42, 8, 7, after && !options.explicitAvailable ? null : true)}${player(43, 4, 4, true)}${player(44, 3, 4, true)}</ListPitchPlayers></TeamState>` +
    `<TeamState><Data><TeamId>1</TeamId></Data><GameTurn>1</GameTurn><ListPitchPlayers>${player(7, 9, 7, true)}</ListPitchPlayers></TeamState></ListTeams></BoardState>`;
  const step = (
    actor: number,
    target: number,
    type: number,
    x: number,
    y: number,
    toX = x,
    toY = y
  ) =>
    `<PlayerStep><PlayerId>${actor}</PlayerId><TargetId>${target}</TargetId><StepType>${type}</StepType><IsEvaluation>0</IsEvaluation><Skill>0</Skill><CellFrom>${position(x, y)}</CellFrom><CellTo>${position(toX, toY)}</CellTo></PlayerStep>`;
  const sequence = (declaration: string, messages: string[]) =>
    `<EventExecuteSequence><Sequence><StepResult><Step><MessageData>${encodedMessage(declaration)}</MessageData></Step><Results>${messages.map((m) => `<StringMessage><MessageData>${encodedMessage(m)}</MessageData></StringMessage>`).join("")}</Results></StepResult></Sequence></EventExecuteSequence>`;
  const gate = `<ResultRoll><Status>1</Status><NewRoll>1</NewRoll><Requirement>2</Requirement><Difficulty>2</Difficulty><RollType>37</RollType><Outcome>0</Outcome><Dice><Die><DieType>0</DieType><Value>1</Value></Die></Dice></ResultRoll>`;
  const check = (fresh: number) =>
    `<Status>1</Status><NewRoll>${fresh}</NewRoll><Requirement>2</Requirement><Difficulty>2</Difficulty><RollType>2</RollType><Outcome>0</Outcome><Dice><Die><DieType>0</DieType><Value>1</Value></Die></Dice>`;
  return envelope(
    `<NotificationGameJoined><InitialBoardState>${board(false).replace(/<\/?BoardState>/g, "")}</InitialBoardState></NotificationGameJoined>` +
      `<ReplayStep>${board(false)}${sequence(step(42, 7, 0, 8, 7, 9, 7), ["<ResultUseAction><Action>2</Action><TeamId>0</TeamId></ResultUseAction>", "<ResultSkillUsage><PlayerId>7</PlayerId><Skill>10</Skill><Used>1</Used></ResultSkillUsage>", gate])}</ReplayStep>` +
      `<ReplayStep>${board(true)}${options.interrupt ? "<EventUnknownMutation/>" : ""}${sequence(step(43, -1, 0, 4, 4), ["<ResultUseAction><Action>1</Action><TeamId>0</TeamId></ResultUseAction>"])}${sequence(step(43, -1, 1, 4, 4, 5, 4), [`<QuestionTeamRerollUsage><GamerId>0</GamerId><CanUseTeamReroll>1</CanUseTeamReroll><RollInfos>${check(1)}</RollInfos></QuestionTeamRerollUsage>`])}</ReplayStep>` +
      `<ReplayStep>${sequence(step(43, -1, 1, 4, 4, 5, 4), ["<ResultTeamRerollUsage><GamerId>0</GamerId><Used>0</Used></ResultTeamRerollUsage>", `<ResultRoll>${check(0)}</ResultRoll>`])}</ReplayStep>`
  );
}
