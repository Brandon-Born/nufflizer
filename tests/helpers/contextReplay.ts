import { encodedMessage, envelope, rollXml } from "./replay";

export function contextReplayXml(
  options: {
    type?: 2 | 4;
    remainingTeammates?: number;
    exposed?: boolean;
    omittedAvailability?: boolean;
    interruption?: boolean;
    futureCheckpoint?: boolean;
    duplicateSummary?: boolean;
    insertClock?: boolean;
    movementEvidence?: "verified_roll" | "contradictory_roll" | "wrong_actor";
  } = {}
): string {
  const type = options.type ?? 2;
  const remaining = options.remainingTeammates ?? 2;
  const position = (x: number, y: number) =>
    "<Cell><X>" + x + "</X><Y>" + y + "</Y></Cell>";
  const player = (
    id: number,
    x: number,
    y: number,
    available: boolean | null
  ) =>
    "<PlayerState><Id>" +
    id +
    "</Id>" +
    position(x, y) +
    (available === null ? "" : "<CanAct>" + Number(available) + "</CanAct>") +
    "<MovePoint>5</MovePoint><Status>0</Status><Situation>0</Situation><TackleZone>1</TackleZone></PlayerState>";
  const team = (teamId: number, turn: number, roster: string) =>
    "<TeamState><Data><TeamId>" +
    teamId +
    "</TeamId></Data><GameTurn>" +
    turn +
    "</GameTurn><ListPitchPlayers>" +
    roster +
    "</ListPitchPlayers></TeamState>";
  const board = (available: number) =>
    "<IsStable>1</IsStable><CurrentPhase>5</CurrentPhase><ActiveTeam>0</ActiveTeam><ActivePlayer>10</ActivePlayer><Period>0</Period><TurnsPerPeriod>8</TurnsPerPeriod>" +
    "<Ball><IsHeld>0</IsHeld>" +
    (type === 4 ? position(9, 7) : position(20, 10)) +
    "</Ball><ListTeams>" +
    team(
      0,
      available ? 1 : 8,
      player(10, 8, 7, true) +
        player(11, 3, 4, options.omittedAvailability ? null : available >= 1) +
        player(12, 4, 4, available >= 2)
    ) +
    team(1, 1, player(40, options.exposed ? 11 : 20, 7, true)) +
    "</ListTeams>";
  const move =
    "<PlayerStep><PlayerId>10</PlayerId><TargetId>-1</TargetId><StepType>1</StepType><CellFrom><X>8</X><Y>7</Y></CellFrom><CellTo><X>9</X><Y>7</Y></CellTo></PlayerStep>";
  const roll = (fresh: number) =>
    "<Status>1</Status><NewRoll>" +
    fresh +
    "</NewRoll><Requirement>2</Requirement><Difficulty>2</Difficulty><RollType>" +
    type +
    "</RollType><Outcome>0</Outcome><Dice><Die><DieType>0</DieType><Value>1</Value></Die></Dice>";
  const seq = (messages: string[]) =>
    "<EventExecuteSequence><Sequence><StepResult><Step><MessageData>" +
    encodedMessage(move) +
    "</MessageData></Step><Results>" +
    messages
      .map(
        (m) =>
          "<StringMessage><MessageData>" +
          encodedMessage(m) +
          "</MessageData></StringMessage>"
      )
      .join("") +
    "</Results></StepResult></Sequence></EventExecuteSequence>";
  const question =
    "<QuestionTeamRerollUsage><GamerId>0</GamerId><CanUseTeamReroll>1</CanUseTeamReroll><RollInfos>" +
    roll(1) +
    "</RollInfos></QuestionTeamRerollUsage>";
  const kept = "<ResultRoll>" + roll(0) + "</ResultRoll>";
  return envelope(
    "<NotificationGameJoined><InitialBoardState>" +
      board(remaining) +
      "</InitialBoardState></NotificationGameJoined>" +
      "<ReplayStep><BoardState>" +
      board(remaining) +
      "</BoardState>" +
      (options.interruption ? "<EventUnknownMutation/>" : "") +
      (options.insertClock ? "<Clock><Remaining>120</Remaining></Clock>" : "") +
      seq([
        ...(type === 4
          ? [
              ...(options.movementEvidence === "verified_roll"
                ? [rollXml(2, 6, 2)]
                : options.movementEvidence === "contradictory_roll"
                  ? [
                      rollXml(2, 1, 2).replace(
                        "<Outcome>0</Outcome>",
                        "<Outcome>1</Outcome>"
                      )
                    ]
                  : []),
              options.movementEvidence === "wrong_actor"
                ? "<ResultDoMove><PlayerId>11</PlayerId></ResultDoMove>"
                : "<ResultDoMove/>",
              "<ResultMoveOutcome><Moved>1</Moved></ResultMoveOutcome>"
            ]
          : []),
        question
      ]) +
      "</ReplayStep>" +
      "<ReplayStep>" +
      seq([
        "<ResultTeamRerollUsage><GamerId>0</GamerId><Used>0</Used></ResultTeamRerollUsage>",
        kept,
        ...(options.duplicateSummary ? [kept] : [])
      ]) +
      (options.futureCheckpoint
        ? "<BoardState>" + board(remaining ? 0 : 2) + "</BoardState>"
        : "") +
      "</ReplayStep>"
  );
}
