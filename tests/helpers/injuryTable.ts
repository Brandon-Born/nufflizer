import { encodedMessage, envelope } from "./replay";

// Explicit synthetic current roster/trait scaffold. This is not an inferred
// refresh or a newly captured game replay; full-source witnesses are separate.
export function injuryTableXml(
  options: {
    skills?: number[];
    dice?: [number, number];
    outcome?: number;
    prefix?: string;
  } = {}
) {
  const { skills = [], dice = [3, 6], outcome = 2, prefix = "" } = options;
  const team = (id: number, player: number) =>
    `<TeamState><Data><TeamId>${id}</TeamId></Data><TransformedPlayers/><Effects/><ActivePrayers/><ListPitchPlayers><PlayerState><Id>${player}</Id><Cell><X>5</X><Y>${5 + id}</Y></Cell><Effects/><Data><Id>${player}</Id><TeamId>${id}</TeamId><IdPlayerTypes>8</IdPlayerTypes><InnateSkills>${(id ? [] : skills).map((s) => `<InnateSkillsItem>${s}</InnateSkillsItem>`).join("")}</InnateSkills><AcquiredSkills/></Data></PlayerState></ListPitchPlayers></TeamState>`;
  const board = `<NotificationGameJoined><InitialBoardState><CurrentPhase>5</CurrentPhase><Effects/><ListTeams>${team(0, 42)}${team(1, 7)}</ListTeams></InitialBoardState></NotificationGameJoined>`;
  const step = `<DamageStep><PlayerId>42</PlayerId><TargetId>42</TargetId><Source>1</Source><StepType>2</StepType><Applied>1</Applied><IsEvaluation>0</IsEvaluation><Skill>0</Skill><State>2</State></DamageStep>`;
  const roll = `<ResultInjuryRoll><Status>1</Status><Modifiers/><RollType>11</RollType><Source>1</Source><Outcome>${outcome}</Outcome><Dice>${dice.map((d) => `<Die><DieType>0</DieType><Value>${d}</Value></Die>`).join("")}</Dice></ResultInjuryRoll>`;
  const message = (s: string) =>
    `<StringMessage><MessageData>${encodedMessage(s)}</MessageData></StringMessage>`;
  return envelope(
    `${board}<EventExecuteSequence><Sequence><StepResult><Step><MessageData>${encodedMessage(step)}</MessageData></Step><Results>${prefix ? message(prefix) : ""}${message(roll)}</Results></StepResult></Sequence></EventExecuteSequence>`
  );
}
