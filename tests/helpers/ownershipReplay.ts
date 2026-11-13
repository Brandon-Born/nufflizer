import { encodedMessage, envelope } from "./replay";
export type OwnershipReplayOptions = {
  kind?: "numeric" | "block" | "armor" | "both_down";
  initialActor?: 0 | 1 | "missing" | "overlap";
  actorTeam?: 0 | 1;
  initialDefender?: 0 | 1;
  defenderTeam?: 0 | 1;
  purchase?: "numeric" | "opaque" | "missing";
  buyerNumeric?: 0 | 1;
  candidate?: boolean;
  currentData?: boolean;
  wrongDataId?: boolean;
  unknownEffects?: boolean;
  unknownTransformations?: boolean;
  unknownAfter?: boolean;
  renewAfterUnknown?: boolean;
  omittedAfterConflict?: boolean;
  futureOnly?: boolean;
  unknownCells?: boolean;
  defenderChooses?: boolean;
  recipient?: 0 | 1;
  canChoose?: boolean;
  names?: boolean;
  version?: string;
};
export function ownershipReplayXml(o: OwnershipReplayOptions = {}) {
  const kind = o.kind ?? "numeric",
    acting = o.actorTeam ?? 0,
    defending = o.defenderTeam ?? 1;
  const initial = o.initialActor ?? 0,
    initialDefender = o.initialDefender ?? 1;
  const cells = (id: number) =>
    o.unknownCells ? "" : `<Cell><X>${id === 42 ? 5 : 6}</X><Y>5</Y></Cell>`;
  const player = (id: number, team: number, physical: boolean) =>
    `<PlayerState><Id>${id}</Id>${physical ? cells(id) + "<CanAct>1</CanAct><Status>0</Status><Situation>0</Situation><TackleZone>1</TackleZone><MovePoint>5</MovePoint>" : ""}${!physical || o.currentData !== false ? `<Data><Id>${o.wrongDataId && physical && id === 42 ? 999 : id}</Id><TeamId>${team}</TeamId><IdPlayerTypes>${physical && id === 42 && o.purchase ? 9 : 8}</IdPlayerTypes><InnateSkills/><AcquiredSkills/>${o.names ? `<Name>Initial ${id}</Name>` : ""}</Data>` : ""}${o.unknownEffects && physical ? "<Effects><PlayerEffect><EffectId>999</EffectId></PlayerEffect></Effects>" : "<Effects/>"}</PlayerState>`;
  const team = (id: number, physical: boolean) =>
    `<TeamState><Data><TeamId>${id}</TeamId></Data><GameTurn>1</GameTurn><Effects/><ActivePrayers/>${o.unknownTransformations && physical ? "<TransformedPlayers><PlayerState><Id>42</Id></PlayerState></TransformedPlayers>" : "<TransformedPlayers/>"}<ListPitchPlayers>${physical ? (acting === id ? player(42, id, true) : "") + (defending === id ? player(7, id, true) : "") : (initial === id || initial === "overlap" ? player(42, id, false) : "") + (initialDefender === id ? player(7, id, false) : "")}</ListPitchPlayers></TeamState>`;
  const board = (physical: boolean) =>
    `<CurrentPhase>5</CurrentPhase><IsStable>1</IsStable><ActiveTeam>${acting}</ActiveTeam><ActivePlayer>42</ActivePlayer><Period>0</Period><TurnsPerPeriod>8</TurnsPerPeriod><Effects/><ListTeams>${team(0, physical)}${team(1, physical)}</ListTeams>`;
  const buy = o.purchase
    ? `<EventBuyMercenary><MercenaryId>42</MercenaryId><MercenaryType>9</MercenaryType>${o.purchase === "missing" ? "" : `<GamerId>${o.purchase === "numeric" ? (o.buyerNumeric ?? acting) : "opaque-buyer-identifier"}</GamerId>`}${o.candidate === false ? "" : `<TeamInducementsData><InducementsCategories><InducementsCategory><Players><PlayerData><IdPlayerTypes>9</IdPlayerTypes><TeamId>${acting}</TeamId><InnateSkills/><AcquiredSkills/></PlayerData></Players></InducementsCategory></InducementsCategories></TeamInducementsData>`}</EventBuyMercenary>`
    : "";
  const step = (root: string, body: string, messages: string[]) =>
    `<StepResult><Step><MessageData>${encodedMessage(`<${root}>${body}</${root}>`)}</MessageData></Step><Results>${messages.map((m) => `<StringMessage><MessageData>${encodedMessage(m)}</MessageData></StringMessage>`).join("")}</Results></StepResult>`;
  const move = step(
    "PlayerStep",
    "<PlayerId>42</PlayerId><TargetId>-1</TargetId><StepType>1</StepType><Skill>0</Skill><IsEvaluation>0</IsEvaluation><CellFrom><X>5</X><Y>5</Y></CellFrom><CellTo><X>6</X><Y>5</Y></CellTo>",
    [
      "<ResultRoll><Status>1</Status><NewRoll>1</NewRoll><Requirement>3</Requirement><Difficulty>3</Difficulty><RollType>2</RollType><Outcome>1</Outcome><Dice><Die><DieType>0</DieType><Value>6</Value></Die></Dice></ResultRoll>"
    ]
  );
  const armor = (id: number, source: number) =>
    step(
      "DamageStep",
      `<Applied>1</Applied><Source>${source}</Source><PlayerId>${id}</PlayerId><TargetId>${id}</TargetId><IsEvaluation>0</IsEvaluation><StepType>2</StepType><Skill>0</Skill><State>2</State><CellFrom><X>${id === 42 ? 5 : 6}</X><Y>5</Y></CellFrom><CellTo><X>${id === 42 ? 5 : 6}</X><Y>5</Y></CellTo>`,
      [
        "<ResultRoll><Status>1</Status><Requirement>8</Requirement><Difficulty>8</Difficulty><Modifiers/><Dice><Die><DieType>0</DieType><Value>6</Value></Die><Die><DieType>0</DieType><Value>6</Value></Die></Dice><RollType>10</RollType><Outcome>1</Outcome><NewRoll>1</NewRoll></ResultRoll>"
      ]
    );
  const face = kind === "both_down" ? 1 : 0,
    chosen = face === 1 ? 1 : 0;
  const block = step(
    "PlayerStep",
    "<PlayerId>42</PlayerId><TargetId>7</TargetId><StepType>6</StepType><Skill>0</Skill><IsEvaluation>0</IsEvaluation><State>3</State><CellFrom><X>5</X><Y>5</Y></CellFrom><CellTo><X>6</X><Y>5</Y></CellTo>",
    [
      `<QuestionBlockDice><RolledDiceIndexes><RolledDiceIndexesItem>0</RolledDiceIndexesItem></RolledDiceIndexes><Dice><Die><DieType>2</DieType><Value>${face}</Value></Die></Dice><CanChoseDie>${o.canChoose === false ? 0 : 1}</CanChoseDie><GamerId>${o.recipient ?? (o.defenderChooses ? defending : acting)}</GamerId><DiceOutcomes><DiceOutcomesItem>${chosen}</DiceOutcomesItem></DiceOutcomes><CanUseTeamReroll>0</CanUseTeamReroll><AttackerChoice>${o.defenderChooses ? 0 : 1}</AttackerChoice><RollType>3</RollType><RollStatus>1</RollStatus></QuestionBlockDice>`,
      `<ResultBlockRoll><RollStatus>1</RollStatus><Die><DieType>2</DieType><Value>${face}</Value></Die><RollType>3</RollType><Outcome>${chosen}</Outcome><NewRoll>1</NewRoll></ResultBlockRoll>`,
      `<ResultBlockOutcome><AttackerId>42</AttackerId><DefenderId>7</DefenderId><Outcome>${chosen}</Outcome><Follow>0</Follow></ResultBlockOutcome>`
    ]
  );
  const sequence = `<EventExecuteSequence><Sequence>${kind === "numeric" ? move : kind === "armor" ? armor(42, 0) : block + (kind === "both_down" ? armor(42, 1) + armor(7, 1) : "")}</Sequence></EventExecuteSequence>`;
  let fresh = board(true);
  if (o.omittedAfterConflict)
    fresh += `</BoardState><EventRulesEngineStandBy><Phase>5</Phase></EventRulesEngineStandBy><BoardState><CurrentPhase>5</CurrentPhase><ListTeams><TeamState/><TeamState/></ListTeams>`;
  const input = `<NotificationGameJoined><InitialBoardState>${board(false)}</InitialBoardState></NotificationGameJoined><ReplayStep><EventMatchStart/>${buy}${o.futureOnly ? sequence : ""}<BoardState>${fresh}</BoardState>${o.unknownAfter ? "<EventUnknownMutation/>" + (o.renewAfterUnknown ? `<BoardState>${board(true)}</BoardState>` : "") : ""}${o.futureOnly ? "" : sequence}</ReplayStep>`;
  return envelope(input).replace(
    "<ReplayVersion>1-4-0-0</ReplayVersion>",
    `<ReplayVersion>${o.version ?? "1-4-0-0"}</ReplayVersion>`
  );
}
