import { encodedMessage, envelope } from "./replay";

// Partial prefixes with explicit current posture/traits; not a legal full match.
export function skillBlockXml(
  a: number[],
  d: number[],
  faces: number[],
  outcomes: number[],
  attackerChooses = true,
  tail?: (question: string) => string[],
  teamAvailable = tail !== undefined
) {
  const player = (id: number, x: number, skills: number[]) =>
    `<PlayerState><Id>${id}</Id><Cell><X>${x}</X><Y>5</Y></Cell><Status>0</Status><TackleZone>1</TackleZone><Effects/><Data><Id>${id}</Id><IdPlayerTypes>8</IdPlayerTypes><InnateSkills>${skills.map((s) => `<InnateSkillsItem>${s}</InnateSkillsItem>`).join("")}</InnateSkills><AcquiredSkills/></Data></PlayerState>`;
  const board = `<IsStable>1</IsStable><CurrentPhase>5</CurrentPhase><ActiveTeam>0</ActiveTeam><Effects/><Ball><IsHeld>0</IsHeld><Cell><X>20</X><Y>10</Y></Cell></Ball><ListTeams>${[0, 1].map((i) => `<TeamState><Data><TeamId>${i}</TeamId></Data><Effects/><ActivePrayers/><TransformedPlayers/><ListPitchPlayers>${player(i ? 7 : 42, i ? 6 : 5, i ? d : a)}</ListPitchPlayers></TeamState>`).join("")}</ListTeams>`;
  const step = `<PlayerStep><PlayerId>42</PlayerId><TargetId>7</TargetId><StepType>6</StepType><Skill>0</Skill><IsEvaluation>0</IsEvaluation><State>3</State><CellFrom><X>5</X><Y>5</Y></CellFrom><CellTo><X>6</X><Y>5</Y></CellTo></PlayerStep>`;
  const q = `<QuestionBlockDice><RollType>3</RollType><RollStatus>1</RollStatus><CanChoseDie>1</CanChoseDie><AttackerChoice>${Number(attackerChooses)}</AttackerChoice><GamerId>${attackerChooses ? 0 : 1}</GamerId><CanUseTeamReroll>${Number(teamAvailable)}</CanUseTeamReroll><RolledDiceIndexes>${faces.map((_, i) => `<RolledDiceIndexesItem>${i}</RolledDiceIndexesItem>`).join("")}</RolledDiceIndexes><Dice>${faces.map((f) => `<Die><DieType>2</DieType><Value>${f}</Value></Die>`).join("")}</Dice><DiceOutcomes>${outcomes.map((o) => `<DiceOutcomesItem>${o}</DiceOutcomesItem>`).join("")}</DiceOutcomes></QuestionBlockDice>`;
  const encoded = [q, ...(tail ? tail(q) : [])]
    .map(
      (message) =>
        `<StringMessage><MessageData>${encodedMessage(message)}</MessageData></StringMessage>`
    )
    .join("");
  return envelope(
    `<NotificationGameJoined><InitialBoardState>${board}</InitialBoardState></NotificationGameJoined><ReplayStep><EventExecuteSequence><Sequence><StepResult><Step><MessageData>${encodedMessage(step)}</MessageData></Step><Results>${encoded}</Results></StepResult></Sequence></EventExecuteSequence></ReplayStep>`
  );
}
