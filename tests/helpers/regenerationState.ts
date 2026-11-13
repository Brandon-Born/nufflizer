import { encodedMessage, envelope } from "./replay";
export function regenerationStateXml(
  o: {
    die?: number;
    turnBridge?: boolean;
    missingGamer?: boolean;
    gap?: string;
    future?: string;
  } = {}
) {
  const die = o.die ?? 6,
    success = die >= 4;
  const board = (after: boolean) =>
    `<CurrentPhase>5</CurrentPhase><IsStable>1</IsStable>${o.missingGamer ? "" : `<ActiveGamer>${o.turnBridge && after ? 1 : 0}</ActiveGamer>`}<ListTeams><TeamState><Data><TeamId>0</TeamId></Data><ListPitchPlayers><PlayerState><Id>42</Id><Cell><X>${after ? -1 : 4}</X><Y>${after ? -1 : 5}</Y></Cell>${after ? `<Situation>${success ? 1 : 4}</Situation>${success ? "" : "<Status>4</Status>"}` : ""}</PlayerState></ListPitchPlayers></TeamState><TeamState><Data><TeamId>1</TeamId></Data><ListPitchPlayers><PlayerState><Id>7</Id><Cell><X>6</X><Y>5</Y></Cell></PlayerState></ListPitchPlayers></TeamState></ListTeams>`;
  const messages = [
    "<ResultRoll><Status>1</Status><Requirement>8</Requirement><Difficulty>8</Difficulty><Modifiers/><Dice><Die><DieType>0</DieType><Value>6</Value></Die><Die><DieType>0</DieType><Value>6</Value></Die></Dice><RollType>10</RollType><Outcome>1</Outcome><NewRoll>1</NewRoll></ResultRoll>",
    "<ResultInjuryRoll><Status>1</Status><Modifiers/><Dice><Die><DieType>0</DieType><Value>6</Value></Die><Die><DieType>0</DieType><Value>6</Value></Die></Dice><Source>1</Source><RollType>11</RollType><Outcome>4</Outcome></ResultInjuryRoll>",
    "<ResultCasualtyRoll><Status>1</Status><Source>1</Source><RollType>12</RollType><Outcome>1</Outcome><Dice><Die><DieType>4</DieType><Value>2</Value></Die></Dice></ResultCasualtyRoll>",
    "<ResultPlayerRemoval><PlayerId>42</PlayerId><Situation>4</Situation><Status>4</Status><Reason>0</Reason></ResultPlayerRemoval>",
    "<ResultSkillUsage><PlayerId>42</PlayerId><Skill>19</Skill><Used>1</Used></ResultSkillUsage>",
    `<ResultRoll><Status>1</Status><Requirement>4</Requirement><Difficulty>4</Difficulty><NewRoll>1</NewRoll><RollType>46</RollType><Outcome>${Number(success)}</Outcome><Modifiers/><Dice><Die><DieType>0</DieType><Value>${die}</Value></Die></Dice></ResultRoll>`
  ];
  const step =
    "<DamageStep><PlayerId>42</PlayerId><TargetId>42</TargetId><StepType>2</StepType><Source>1</Source><Applied>1</Applied><IsEvaluation>0</IsEvaluation><Skill>0</Skill><State>3</State></DamageStep>";
  const controls = o.turnBridge
    ? "<EventEndTurn><Reason>2</Reason><NextPlayingGamer>1</NextPlayingGamer></EventEndTurn><EventActiveGamerChanged><NewActiveGamer>1</NewActiveGamer></EventActiveGamerChanged><EventPauseActiveTimer/><EventActiveTimerChanged><NewTimer><Duration>240</Duration><Type>1</Type><Value>240</Value><Team>1</Team></NewTimer><IsPaused>1</IsPaused></EventActiveTimerChanged>"
    : "";
  return envelope(
    `<NotificationGameJoined><InitialBoardState>${board(false)}</InitialBoardState></NotificationGameJoined><ReplayStep><EventExecuteSequence><Sequence><StepResult><Step><MessageData>${encodedMessage(step)}</MessageData></Step><Results>${messages.map((m) => `<StringMessage><MessageData>${encodedMessage(m)}</MessageData></StringMessage>`).join("")}</Results></StepResult></Sequence></EventExecuteSequence>${o.gap ?? ""}${controls}<EventRulesEngineStandBy><Phase>5</Phase>${o.missingGamer ? "" : `<ActiveGamer>${o.turnBridge ? 1 : 0}</ActiveGamer>`}</EventRulesEngineStandBy><BoardState>${board(true)}</BoardState>${o.future ?? ""}</ReplayStep>`
  );
}
