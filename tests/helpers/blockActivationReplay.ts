import { encodedMessage, envelope } from "./replay";
export function blockActivationReplayXml(
  options: {
    commit?: boolean;
    follow?: boolean;
    following?: number;
    interruption?: string;
    unknownClock?: boolean;
    missingActor?: boolean;
    changedPosition?: boolean;
    nextTurn?: boolean;
    action?: number;
  } = {}
) {
  const pos = (x: number, y: number) => `<Cell><X>${x}</X><Y>${y}</Y></Cell>`;
  const player = (id: number, x: number, y: number) =>
    `<PlayerState><Id>${id}</Id>${pos(x, y)}<CanAct>1</CanAct><TackleZone>1</TackleZone><Status>0</Status><Situation>0</Situation><MovePoint>5</MovePoint><Effects/><Data><Id>${id}</Id><IdPlayerTypes>8</IdPlayerTypes><InnateSkills/><AcquiredSkills/></Data></PlayerState>`;
  const board = (after: boolean) =>
    `<IsStable>1</IsStable><Effects/><CurrentPhase>5</CurrentPhase><ActiveTeam>0</ActiveTeam><ActiveGamer>0</ActiveGamer><ActivePlayer>42</ActivePlayer>${after && options.unknownClock ? "" : "<Period>1</Period>"}<TurnsPerPeriod>8</TurnsPerPeriod><Ball><IsHeld>0</IsHeld>${pos(20, 10)}</Ball><ListTeams><TeamState><Data><TeamId>0</TeamId></Data><GameTurn>${after && options.nextTurn ? 10 : 9}</GameTurn><Effects/><ActivePrayers/><TransformedPlayers/><ListPitchPlayers>${after && options.missingActor ? "" : player(42, after && options.changedPosition ? 9 : after && options.follow ? 6 : 5, 5)}${player(43, 4, 4)}${player(44, 8, 8)}</ListPitchPlayers></TeamState><TeamState><Data><TeamId>1</TeamId></Data><GameTurn>8</GameTurn><Effects/><ActivePrayers/><TransformedPlayers/><ListPitchPlayers>${player(7, after && options.commit !== false ? 7 : 6, 5)}</ListPitchPlayers></TeamState></ListTeams>`;
  const step = (
    id: number,
    target: number,
    type: number,
    from: [number, number],
    to: [number, number],
    messages: string[]
  ) =>
    `<StepResult><Step><MessageData>${encodedMessage(`<PlayerStep><PlayerId>${id}</PlayerId><TargetId>${target}</TargetId><StepType>${type}</StepType><Skill>0</Skill><IsEvaluation>0</IsEvaluation><CellFrom><X>${from[0]}</X><Y>${from[1]}</Y></CellFrom><CellTo><X>${to[0]}</X><Y>${to[1]}</Y></CellTo></PlayerStep>`)}</MessageData></Step><Results>${messages.map((m) => `<StringMessage><MessageData>${encodedMessage(m)}</MessageData></StringMessage>`).join("")}</Results></StepResult>`;
  const sequence = (s: string) =>
    `<EventExecuteSequence><Sequence>${s}</Sequence></EventExecuteSequence>`;
  const pushes =
    "<ResultPushBack><CellFrom><X>6</X><Y>5</Y></CellFrom><CellTo><X>7</X><Y>5</Y></CellTo><Resolution>3</Resolution><PushedPlayerId>7</PushedPlayerId></ResultPushBack>";
  const final = `<ResultBlockOutcome><AttackerId>42</AttackerId><DefenderId>7</DefenderId><Outcome>4</Outcome><Pushbacks>${pushes}</Pushbacks><Follow>${Number(options.follow ?? false)}</Follow></ResultBlockOutcome>`;
  const question =
    "<QuestionBlockDice><RolledDiceIndexes><RolledDiceIndexesItem>0</RolledDiceIndexesItem></RolledDiceIndexes><Dice><Die><DieType>2</DieType><Value>2</Value></Die></Dice><DiceOutcomes><DiceOutcomesItem>4</DiceOutcomesItem></DiceOutcomes><AttackerChoice>1</AttackerChoice><CanChoseDie>1</CanChoseDie><GamerId>0</GamerId><CanUseTeamReroll>0</CanUseTeamReroll><RollType>3</RollType><RollStatus>1</RollStatus></QuestionBlockDice>";
  const applied =
    options.commit === false
      ? ""
      : step(
          42,
          7,
          6,
          [5, 5],
          [6, 5],
          [
            question,
            "<ResultBlockRoll><RollStatus>1</RollStatus><Die><DieType>2</DieType><Value>2</Value></Die><RollType>3</RollType><Outcome>4</Outcome><NewRoll>1</NewRoll></ResultBlockRoll>",
            pushes,
            `<ResultFollowUp><Follow>${Number(options.follow ?? false)}</Follow><CellFrom><X>5</X><Y>5</Y></CellFrom><CellTo><X>6</X><Y>5</Y></CellTo></ResultFollowUp>`,
            final
          ]
        );
  const follower = options.following ?? 43;
  const failed = (fresh: number) =>
    `<Status>1</Status><NewRoll>${fresh}</NewRoll><Requirement>2</Requirement><Difficulty>2</Difficulty><RollType>2</RollType><Outcome>0</Outcome><Modifiers/><Dice><Die><DieType>0</DieType><Value>1</Value></Die></Dice>`;
  const move = step(
    follower,
    -1,
    1,
    [4, 4],
    [4, 5],
    [
      `<QuestionTeamRerollUsage><GamerId>0</GamerId><CanUseTeamReroll>1</CanUseTeamReroll><RollInfos>${failed(1)}</RollInfos></QuestionTeamRerollUsage>`
    ]
  );
  const terminal = step(
    follower,
    -1,
    1,
    [4, 4],
    [4, 5],
    [
      "<ResultTeamRerollUsage><GamerId>0</GamerId><Used>0</Used></ResultTeamRerollUsage>",
      `<ResultRoll>${failed(0)}</ResultRoll>`
    ]
  );
  return envelope(
    `<NotificationGameJoined><InitialBoardState>${board(false)}</InitialBoardState></NotificationGameJoined><ReplayStep><BoardState>${board(false)}</BoardState>${sequence(step(42, 7, 0, [5, 5], [6, 5], [`<ResultUseAction><Action>${options.action ?? 2}</Action><TeamId>0</TeamId></ResultUseAction>`]) + applied)}${options.interruption ?? ""}<EventRulesEngineStandBy><Phase>5</Phase><ActiveGamer>0</ActiveGamer></EventRulesEngineStandBy><BoardState>${board(true)}</BoardState>${sequence(step(follower, -1, 0, follower === 42 ? [5, 5] : [4, 4], follower === 42 ? [5, 5] : [4, 4], ["<ResultUseAction><Action>1</Action><TeamId>0</TeamId></ResultUseAction>"]) + move)}</ReplayStep><ReplayStep>${sequence(terminal)}</ReplayStep>`
  );
}
