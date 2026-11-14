import { encodedMessage, envelope } from "./replay";
import { mapEncodedInjuryMessages } from "./staffInjuryOriginal";

// Explicit synthetic partial replay. Roster membership is known; learned
// traits/complete legal state are deliberately absent, so no dice is scored.
export function treatmentXml(
  o: {
    stage?: 0 | 1;
    used?: 0 | 1;
    outcome?: number;
    status?: number;
    source?: number;
    spp?: boolean;
    noPrompt?: boolean;
    end?: boolean;
    afterStatus?: number | null;
    canAct?: boolean | null;
    tackleZone?: boolean | null;
    afterController?: 0 | 1 | null;
    emptyController?: boolean;
    emptyTeam?: boolean;
    emptyPaused?: boolean;
    emptyStandby?: boolean;
  } = {}
) {
  const stage = o.stage ?? 1,
    used = o.used ?? 0,
    outcome = o.outcome ?? (stage ? 1 : 2),
    status = o.status ?? 4,
    source = o.source ?? 1;
  const board = (after: boolean) => {
    const observedStatus =
      o.afterStatus === undefined
        ? status === 0
          ? null
          : status
        : o.afterStatus;
    const p = (id: number, body: string) =>
      `<PlayerState><Id>${id}</Id>${body}</PlayerState>`;
    const team = (id: number, players: string) =>
      `<TeamState><Data><TeamId>${id}</TeamId></Data><ListPitchPlayers>${players}</ListPitchPlayers></TeamState>`;
    const coord = after ? "<X>-1</X><Y>-1</Y>" : "<X>5</X><Y>5</Y>";
    const flags = after
      ? `${observedStatus === null ? "" : `<Status>${observedStatus}</Status>`}<Situation>${status === 0 ? 1 : 4}</Situation>${o.canAct == null ? "" : `<CanAct>${Number(o.canAct)}</CanAct>`}${o.tackleZone == null ? "" : `<TackleZone>${Number(o.tackleZone)}</TackleZone>`}`
      : "<Situation>0</Situation>";
    const controller = after
      ? o.afterController === undefined
        ? 1
        : o.afterController
      : 1;
    return `<CurrentPhase>5</CurrentPhase><IsStable>1</IsStable>${controller === null ? "" : `<ActiveGamer>${controller}</ActiveGamer>`}<ListTeams>${team(0, p(13, `<Cell>${coord}</Cell>${flags}`))}${team(1, p(40, "<Cell><X>6</X><Y>5</Y></Cell>"))}</ListTeams>`;
  };
  const header = (state: number) =>
    `<DamageStep><Applied>1</Applied><Probability>100</Probability><Source>${source}</Source><PlayerId>13</PlayerId><TargetId>13</TargetId><IsEvaluation>0</IsEvaluation><StepType>2</StepType><CellTo><X>5</X><Y>5</Y></CellTo><State>${state}</State><CellFrom><X>5</X><Y>5</Y></CellFrom><Skill>0</Skill></DamageStep>`;
  const step = (h: string, ms: string[]) =>
    `<EventExecuteSequence><Sequence><StepResult><Step><MessageData>${encodedMessage(h)}</MessageData></Step><Results>${ms.map((m) => `<StringMessage><MessageData>${encodedMessage(m)}</MessageData></StringMessage>`).join("")}</Results></StepResult></Sequence></EventExecuteSequence>`;
  const q = `<QuestionApothecaryCasualtyUsage><GamerId>0</GamerId><RollInfos><Status>1</Status><Modifiers/><Dice>${stage ? "<Die><DieType>0</DieType><Value>4</Value></Die><Die><DieType>0</DieType><Value>5</Value></Die>" : "<Die><DieType>4</DieType><Value>8</Value></Die>"}</Dice><Source>${source}</Source><RollType>${stage ? 11 : 12}</RollType><Outcome>${stage ? 1 : 2}</Outcome></RollInfos></QuestionApothecaryCasualtyUsage>`;
  const removal = `<ResultPlayerRemoval><PlayerId>13</PlayerId><Situation>${status === 0 ? 1 : 4}</Situation><Reason>0</Reason><Status>${status}</Status></ResultPlayerRemoval>`;
  const result = `<ResultApothecary><PlayerStatus>${status}</PlayerStatus><ApothecaryUsed>${used}</ApothecaryUsed><Casualty>${outcome}</Casualty><IsInjury>${stage}</IsInjury></ResultApothecary>`;
  const controls = `${o.end ? "<EventEndTurn><Reason>2</Reason></EventEndTurn>" : ""}<EventActiveGamerChanged>${o.emptyController ? "" : "<NewActiveGamer>1</NewActiveGamer>"}</EventActiveGamerChanged><EventPauseActiveTimer/><EventActiveTimerChanged><NewTimer><Duration>240</Duration><Type>1</Type><Value>220</Value>${o.emptyTeam ? "" : "<Team>1</Team>"}</NewTimer>${o.emptyPaused ? "" : "<IsPaused>1</IsPaused>"}</EventActiveTimerChanged><EventRulesEngineStandBy><Phase>5</Phase>${o.emptyStandby ? "" : "<ActiveGamer>1</ActiveGamer>"}</EventRulesEngineStandBy>`;
  return envelope(
    `<NotificationGameJoined><InitialBoardState>${board(false)}</InitialBoardState></NotificationGameJoined>${o.noPrompt ? "" : `<ReplayStep>${step(header(1), [q])}</ReplayStep><ReplayStep><EventGamersAreReady/><EventStartActiveTimer/></ReplayStep>`}<ReplayStep>${step(header(stage ? 2 : 3), [...((o.spp ?? !!stage) ? ["<ResultGainSpp><PlayerId>40</PlayerId><SppGained>2</SppGained></ResultGainSpp>"] : []), removal, result])}${controls}<BoardState>${board(true)}</BoardState></ReplayStep>`
  );
}
export const mapTreatmentMessages = mapEncodedInjuryMessages;
export function mapTreatmentAfterBoard(
  xml: string,
  change: (board: string) => string
) {
  return xml.replace(
    /<BoardState>([\s\S]*?)<\/BoardState>/,
    (_m, body: string) => `<BoardState>${change(body)}</BoardState>`
  );
}
