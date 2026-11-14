import { encodedMessage, envelope } from "./replay";
// Complete, explicitly synthetic current traits; actual source witnesses and
// their unchanged hashes are tested separately.
export function categoricalInjuryXml(
  o: {
    dice?: [number, number];
    outcome?: number;
    skills?: number[];
    attackerSkills?: number[];
    self?: boolean;
    swapTeams?: boolean;
    fall?: boolean;
    interruption?: string | string[];
    aftermath?: string;
    armorMightyBlow?: boolean;
    state?: number;
  } = {}
) {
  const dice = o.dice ?? [3, 6],
    code = o.outcome ?? 2;
  const c = (x: number, y: number) => `<X>${x}</X><Y>${y}</Y>`;
  const player = (id: number, x: number, skills: number[]) =>
    `<PlayerState><Id>${id}</Id><Cell>${c(x, 5)}</Cell><TackleZone>1</TackleZone><CanAct>1</CanAct><Effects/><Data><Id>${id}</Id><IdPlayerTypes>8</IdPlayerTypes><InnateSkills>${skills.map((s) => `<InnateSkillsItem>${s}</InnateSkillsItem>`).join("")}</InnateSkills><AcquiredSkills/></Data></PlayerState>`;
  const team = (id: number, body: string) =>
    `<TeamState><Data><TeamId>${id}</TeamId></Data><Effects/><ActivePrayers/><TransformedPlayers/><ListPitchPlayers>${body}</ListPitchPlayers></TeamState>`;
  const board = `<NotificationGameJoined><InitialBoardState><CurrentPhase>5</CurrentPhase><Effects/><ListTeams>${o.swapTeams ? team(0, player(7, 6, o.attackerSkills ?? [])) + team(1, player(42, 5, o.skills ?? [])) : team(0, player(42, 5, o.skills ?? [])) + team(1, player(7, 6, o.attackerSkills ?? []))}</ListTeams></InitialBoardState></NotificationGameJoined>`;
  const step = (s: string, ms: string[]) =>
    `<StepResult><Step><MessageData>${encodedMessage(s)}</MessageData></Step><Results>${ms.map((m) => `<StringMessage><MessageData>${encodedMessage(m)}</MessageData></StringMessage>`).join("")}</Results></StepResult>`;
  const attacker = o.self ? 42 : 7,
    target = o.self ? 7 : 42,
    face = o.self ? 0 : 4,
    out = o.self ? 0 : 6;
  const fields = `<PlayerId>${attacker}</PlayerId><TargetId>${target}</TargetId><StepType>6</StepType><Skill>0</Skill><IsEvaluation>0</IsEvaluation><CellFrom>${c(o.self ? 5 : 6, 5)}</CellFrom><CellTo>${c(o.self ? 6 : 5, 5)}</CellTo>`;
  const push =
    "<ResultPushBack><CellFrom><X>5</X><Y>5</Y></CellFrom><CellTo><X>4</X><Y>5</Y></CellTo><Resolution>3</Resolution><PushedPlayerId>42</PushedPlayerId></ResultPushBack>";
  const block = step(`<PlayerStep>${fields}</PlayerStep>`, [
    `<QuestionBlockDice><RolledDiceIndexes><RolledDiceIndexesItem>0</RolledDiceIndexesItem></RolledDiceIndexes><Dice><Die><DieType>2</DieType><Value>${face}</Value></Die></Dice><DiceOutcomes><DiceOutcomesItem>${out}</DiceOutcomesItem></DiceOutcomes><AttackerChoice>1</AttackerChoice><CanChoseDie>1</CanChoseDie><GamerId>${(o.self ? 0 : 1) ^ (o.swapTeams ? 1 : 0)}</GamerId><RollType>3</RollType><RollStatus>1</RollStatus></QuestionBlockDice>`,
    `<ResultBlockRoll><RollStatus>1</RollStatus><Die><DieType>2</DieType><Value>${face}</Value></Die><RollType>3</RollType><Outcome>${out}</Outcome><NewRoll>1</NewRoll></ResultBlockRoll>`,
    ...(o.self ? [] : [push]),
    `<ResultBlockOutcome><AttackerId>${attacker}</AttackerId><DefenderId>${target}</DefenderId><Outcome>${out}</Outcome><Pushbacks>${o.self ? "" : push}</Pushbacks><Follow>0</Follow></ResultBlockOutcome>`
  ]);
  const fall = step(
    `<PlayerStep><PlayerId>42</PlayerId><TargetId>-1</TargetId><StepType>1</StepType><Skill>0</Skill><IsEvaluation>0</IsEvaluation><CellFrom>${c(5, 5)}</CellFrom><CellTo>${c(5, 6)}</CellTo></PlayerStep>`,
    [
      "<ResultRoll><Status>1</Status><Requirement>2</Requirement><Difficulty>2</Difficulty><Modifiers/><Dice><Die><DieType>0</DieType><Value>1</Value></Die></Dice><RollType>1</RollType><Outcome>0</Outcome><NewRoll>1</NewRoll></ResultRoll>",
      "<ResultDoMove/>",
      "<ResultMoveOutcome><Moved>1</Moved><TentacleUsed>0</TentacleUsed><FumbleRooskieUsed>0</FumbleRooskieUsed><Rolls><RollSummary><RollType>1</RollType><Outcome>0</Outcome></RollSummary></Rolls></ResultMoveOutcome>"
    ]
  );
  const source = o.fall ? 9 : 1,
    x = o.fall || o.self ? 5 : 4;
  const damage = step(
    `<DamageStep><Applied>1</Applied><Source>${source}</Source><PlayerId>42</PlayerId><TargetId>42</TargetId><StepType>2</StepType><IsEvaluation>0</IsEvaluation><Skill>0</Skill><State>${o.state ?? (code === 4 ? 3 : 2)}</State><CellFrom>${c(x, 5)}</CellFrom><CellTo>${c(x, 5)}</CellTo></DamageStep>`,
    [
      ...(o.armorMightyBlow
        ? [
            `<ResultSkillUsage><PlayerId>${attacker}</PlayerId><Skill>13</Skill><Used>1</Used></ResultSkillUsage>`
          ]
        : []),
      `<ResultRoll><Status>1</Status><Requirement>8</Requirement><Difficulty>${o.armorMightyBlow ? 7 : 8}</Difficulty><Modifiers>${o.armorMightyBlow ? `<Modifier><PlayerId>${attacker}</PlayerId><Skill>13</Skill><Effect>-1</Effect><Value>1</Value><ModifierType>27</ModifierType></Modifier>` : ""}</Modifiers><Dice><Die><DieType>0</DieType><Value>${o.armorMightyBlow ? 3 : 6}</Value></Die><Die><DieType>0</DieType><Value>${o.armorMightyBlow ? 4 : 6}</Value></Die></Dice><RollType>10</RollType><Outcome>1</Outcome><NewRoll>1</NewRoll></ResultRoll>`,
      ...(Array.isArray(o.interruption)
        ? o.interruption
        : o.interruption
          ? [o.interruption]
          : []),
      `<ResultInjuryRoll><Status>1</Status><Modifiers/><Dice>${dice.map((d) => `<Die><DieType>0</DieType><Value>${d}</Value></Die>`).join("")}</Dice><Source>${source}</Source><RollType>11</RollType><Outcome>${code}</Outcome></ResultInjuryRoll>`,
      ...(o.aftermath ? [o.aftermath] : [])
    ]
  );
  return envelope(
    `${board}<ReplayStep><EventExecuteSequence><Sequence>${o.fall ? fall : block}${damage}</Sequence></EventExecuteSequence>${o.fall ? "<EventEndTurn><Reason>2</Reason><FinishingTurnType>0</FinishingTurnType></EventEndTurn>" : ""}</ReplayStep>`
  );
}
