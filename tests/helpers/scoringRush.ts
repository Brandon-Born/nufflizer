import { encodedMessage, envelope } from "./replay";

// Complete, explicitly synthetic pre-roll states. No omitted field supplies a
// zero, empty skill list, legal resource, score or clock observation.
export function scoringRushXml(
  o: {
    face?: number;
    priorRushes?: 0 | 1 | 2;
    side?: 32 | 64;
    ownRoster?: 0 | 1;
    early?: boolean;
    ownTurn?: number;
    opponentTurn?: number;
    period?: 0 | 1;
    ownScore?: number;
    opponentScore?: number;
    teamRerolls?: number;
    actorSkills?: number[];
    opponentNear?: boolean;
    otherScorer?: boolean;
    opponentScorer?: boolean;
    future?: boolean;
    aftermath?: boolean;
    omitCurrentPlayer?: number;
    unknown?: string;
    stepSkill?: number;
    evaluation?: number;
    headerExtra?: string;
    repeatDeclaration?: boolean;
  } = {}
) {
  const side = o.side ?? 32,
    from = { x: side === 32 ? 24 : 1, y: 7 },
    to = { x: side === 32 ? 25 : 0, y: 7 },
    face = o.face ?? 1;
  const point = (p: { x: number; y: number }) =>
    `<Cell><X>${p.x}</X><Y>${p.y}</Y></Cell>`;
  const player = (
    id: number,
    p: { x: number; y: number },
    movement: number,
    skills: number[] = []
  ) =>
    `<PlayerState><Id>${id}</Id>${point(p)}<Status>0</Status><Situation>0</Situation><CanAct>1</CanAct><TackleZone>1</TackleZone><MovePoint>${movement}</MovePoint><Effects/><Data><Id>${id}</Id><IdPlayerTypes>8</IdPlayerTypes><InnateSkills>${skills.map((s) => `<InnateSkillsItem>${s}</InnateSkillsItem>`).join("")}</InnateSkills><AcquiredSkills/></Data></PlayerState>`;
  const team = (id: number, roster: string) =>
    `<TeamState><Data><TeamId>${id}</TeamId></Data><Side>${id ? (side === 32 ? 64 : 32) : side}</Side><GameTurn>${id ? (o.opponentTurn ?? (o.early ? 0 : 16)) : (o.ownTurn ?? (o.early ? 1 : 16))}</GameTurn><Touchdown>${id ? (o.opponentScore ?? 0) : (o.ownScore ?? 0)}</Touchdown><RerollNumber>${id ? 3 : (o.teamRerolls ?? 0)}</RerollNumber><Effects/><ActivePrayers/><TransformedPlayers/><ListPitchPlayers>${roster}</ListPitchPlayers></TeamState>`;
  let board = `<UseSmallPitch>0</UseSmallPitch><PitchZones>${[0, 25].map((x) => `<PitchZone><ZoneType>1</ZoneType><BottomLeft><X>${x}</X><Y>0</Y></BottomLeft><TopRight><X>${x}</X><Y>14</Y></TopRight></PitchZone>`).join("")}</PitchZones><CurrentPhase>5</CurrentPhase><IsStable>1</IsStable><Period>${o.period ?? (o.early ? 0 : 1)}</Period><TurnsPerPeriod>8</TurnsPerPeriod><ActiveTeam>0</ActiveTeam><ActivePlayer>10</ActivePlayer><Effects/><Ball><IsHeld>1</IsHeld><Carrier>10</Carrier>${point(from)}</Ball><ListTeams>${team(0, player(10, from, 0, o.actorSkills) + player(11, { x: o.otherScorer ? to.x : 5, y: 3 }, 5))}${team(1, player(40, { x: o.opponentNear ? from.x : 12, y: o.opponentNear ? 6 : 7 }, 5) + (o.opponentScorer ? player(41, { x: side === 32 ? 0 : 25, y: 4 }, 5) : ""))}</ListTeams>`;
  if (o.unknown)
    board = board
      .replace(new RegExp(`<${o.unknown}>[^<]*</${o.unknown}>`, "g"), "")
      .replaceAll(`<${o.unknown}/>`, "");
  if (o.ownRoster === 1) {
    const teams = board.match(/<TeamState>[\s\S]*?<\/TeamState>/g)!;
    board = board
      .replace(teams.join(""), [...teams].reverse().join(""))
      .replace("<ActiveTeam>0</ActiveTeam>", "<ActiveTeam>1</ActiveTeam>");
  }
  const step = (body: string, messages: string[], skill = 0, evaluation = 0) =>
    `<StepResult><Step><MessageData>${encodedMessage(`<PlayerStep><PlayerId>10</PlayerId><TargetId>-1</TargetId><Skill>${skill}</Skill><IsEvaluation>${evaluation}</IsEvaluation>${body}</PlayerStep>`)}</MessageData></Step><Results>${messages.map((m) => `<StringMessage><MessageData>${encodedMessage(m)}</MessageData></StringMessage>`).join("")}</Results></StepResult>`;
  const direction = side === 32 ? 1 : -1;
  const base = { x: from.x - direction * (o.priorRushes ?? 0), y: 7 };
  const start = { x: base.x - direction, y: 7 };
  const initial = board
    .replaceAll(point(from), point(start))
    .replace("<MovePoint>0</MovePoint>", "<MovePoint>1</MovePoint>");
  const current =
    o.omitCurrentPlayer === undefined
      ? board
      : board.replace(
          /<PlayerState><Id>(\d+)<\/Id>[\s\S]*?<\/PlayerState>/g,
          (xml, id) => (Number(id) === o.omitCurrentPlayer ? "" : xml)
        );
  const declare = step(
    `<StepType>0</StepType><CellFrom><X>${start.x}</X><Y>7</Y></CellFrom>`,
    ["<ResultUseAction><Action>1</Action><TeamId>0</TeamId></ResultUseAction>"]
  );
  const ordinary = step(
    `<StepType>1</StepType><CellFrom><X>${start.x}</X><Y>7</Y></CellFrom><CellTo><X>${base.x}</X><Y>7</Y></CellTo>`,
    [
      "<ResultDoMove/>",
      "<ResultMoveOutcome><Moved>1</Moved><TentacleUsed>0</TentacleUsed><FumbleRooskieUsed>0</FumbleRooskieUsed></ResultMoveOutcome>"
    ]
  );
  const previous = Array.from({ length: o.priorRushes ?? 0 }, (_, i) =>
    step(
      `<StepType>1</StepType><CellFrom><X>${base.x + direction * i}</X><Y>7</Y></CellFrom><CellTo><X>${base.x + direction * (i + 1)}</X><Y>7</Y></CellTo>`,
      [
        "<ResultRoll><Status>1</Status><NewRoll>1</NewRoll><RollType>1</RollType><Requirement>2</Requirement><Difficulty>2</Difficulty><Outcome>1</Outcome><Dice><Die><DieType>0</DieType><Value>6</Value></Die></Dice><Modifiers/></ResultRoll>",
        "<ResultDoMove/>",
        "<ResultMoveOutcome><Moved>1</Moved><TentacleUsed>0</TentacleUsed><FumbleRooskieUsed>0</FumbleRooskieUsed></ResultMoveOutcome>"
      ]
    )
  ).join("");
  const move = step(
    `<StepType>1</StepType><State>3</State>${o.headerExtra ?? ""}<CellFrom><X>${from.x}</X><Y>7</Y></CellFrom><CellTo><X>${to.x}</X><Y>7</Y></CellTo>`,
    [
      `<ResultRoll><Status>1</Status><NewRoll>1</NewRoll><RollType>1</RollType><Requirement>2</Requirement><Difficulty>2</Difficulty><Outcome>${Number(face >= 2)}</Outcome><Dice><Die><DieType>0</DieType><Value>${face}</Value></Die></Dice><Modifiers/></ResultRoll>`,
      ...(o.aftermath && face >= 2
        ? [
            "<ResultDoMove/>",
            "<ResultMoveOutcome><Moved>1</Moved><TentacleUsed>0</TentacleUsed><FumbleRooskieUsed>0</FumbleRooskieUsed><Rolls><RollSummary><RollType>1</RollType><Outcome>1</Outcome></RollSummary></Rolls></ResultMoveOutcome>",
            "<ResultGainSpp><PlayerId>10</PlayerId><SppGained>3</SppGained></ResultGainSpp>"
          ]
        : [])
    ],
    o.stepSkill ?? 0,
    o.evaluation ?? 0
  );
  return envelope(
    `<NotificationGameJoined><InitialBoardState>${initial}</InitialBoardState></NotificationGameJoined><ReplayStep><BoardState>${initial}</BoardState><EventExecuteSequence><Sequence>${declare}${ordinary}${previous}</Sequence></EventExecuteSequence><BoardState>${current}</BoardState><EventExecuteSequence><Sequence>${o.repeatDeclaration ? step(`<StepType>0</StepType><CellFrom><X>${from.x}</X><Y>7</Y></CellFrom>`, ["<ResultUseAction><Action>1</Action><TeamId>0</TeamId></ResultUseAction>"]) : ""}${move}</Sequence></EventExecuteSequence>${o.aftermath && face >= 2 ? `<EventTouchdown><PlayerId>10</PlayerId>${point(to)}</EventTouchdown><EventEndTurn><Reason>4</Reason></EventEndTurn>` : ""}</ReplayStep>${o.future ? `<ReplayStep><EventMatchEnd/><BoardState>${board.replaceAll("<Touchdown>0</Touchdown>", "<Touchdown>9</Touchdown>")}</BoardState></ReplayStep>` : ""}`
  );
}
