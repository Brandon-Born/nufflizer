import { encodedMessage, envelope } from "./replay";
export function casualtyTableXml(
  o: {
    kind?: "direct" | "apothecary_original" | "apothecary_replacement";
    face?: number;
    secondary?: number;
    outcome?: number;
    modifiers?: string | null;
    swap?: boolean;
    suffix?: string;
  } = {}
) {
  const kind = o.kind ?? "direct",
    cell = "<X>5</X><Y>5</Y>";
  const team = (id: number, player: number) =>
    `<TeamState><Data><TeamId>${id}</TeamId></Data><ListPitchPlayers><PlayerState><Id>${player}</Id></PlayerState></ListPitchPlayers></TeamState>`;
  const header = `<DamageStep><Applied>1</Applied><Source>1</Source><PlayerId>42</PlayerId><TargetId>42</TargetId><StepType>2</StepType><IsEvaluation>0</IsEvaluation><Skill>0</Skill><State>3</State><CellFrom>${cell}</CellFrom><CellTo>${cell}</CellTo></DamageStep>`;
  const body = `<Status>1</Status>${o.modifiers === null ? "" : `<Modifiers>${o.modifiers ?? ""}</Modifiers>`}<Dice><Die><DieType>4</DieType><Value>${o.face ?? 8}</Value></Die>${o.secondary === undefined ? "" : `<Die><DieType>0</DieType><Value>${o.secondary}</Value></Die>`}</Dice><Source>1</Source><RollType>12</RollType><Outcome>${o.outcome ?? 2}</Outcome>`;
  const roll =
    kind === "direct"
      ? `<ResultCasualtyRoll>${body}</ResultCasualtyRoll>`
      : kind === "apothecary_original"
        ? `<QuestionApothecaryCasualtyUsage><GamerId>${o.swap ? 1 : 0}</GamerId><RollInfos>${body}</RollInfos></QuestionApothecaryCasualtyUsage>`
        : `<QuestionApothecaryCasualtyChoice><GamerId>${o.swap ? 1 : 0}</GamerId><NewRoll>${body}</NewRoll><OriginalRoll>${body}</OriginalRoll></QuestionApothecaryCasualtyChoice>`;
  return envelope(
    `<NotificationGameJoined><InitialBoardState><ListTeams>${team(0, o.swap ? 7 : 42)}${team(1, o.swap ? 42 : 7)}</ListTeams></InitialBoardState></NotificationGameJoined><ReplayStep><EventExecuteSequence><Sequence><StepResult><Step><MessageData>${encodedMessage(header)}</MessageData></Step><Results><StringMessage><MessageData>${encodedMessage(roll)}</MessageData></StringMessage></Results></StepResult></Sequence></EventExecuteSequence>${o.suffix ?? ""}</ReplayStep>`
  );
}
export const decayModifier =
  "<Modifier><PlayerId>42</PlayerId><Skill>81</Skill><Effect>-1</Effect><Value>1</Value><ModifierType>27</ModifierType></Modifier>";
export const nigglingModifier =
  "<Modifier><PlayerId>-1</PlayerId><Skill>-1</Skill><Effect>-1</Effect><Value>1</Value><ModifierType>31</ModifierType></Modifier>";
