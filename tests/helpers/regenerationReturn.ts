import { regenerationStateXml } from "./regenerationState";
import { encodedMessage } from "./replay";
export function regenerationReturnXml(
  o: {
    noReturn?: boolean;
    noPlaying?: boolean;
    noActivation?: boolean;
    gap?: string;
    playingGap?: string;
    activationGap?: string;
    future?: string;
    action?: number;
    missingFlags?: boolean;
    missingGamer?: boolean;
  } = {}
) {
  const board = (phase: number) =>
    `<BoardState><CurrentPhase>${phase}</CurrentPhase><IsStable>1</IsStable>${o.missingGamer ? "" : "<ActiveGamer>0</ActiveGamer>"}<ListTeams><TeamState><Data><TeamId>0</TeamId></Data><GameTurn>1</GameTurn><ListPitchPlayers><PlayerState><Id>42</Id><Cell><X>4</X><Y>5</Y></Cell>${phase === 3 || !o.missingFlags ? "<CanAct>1</CanAct><TackleZone>1</TackleZone>" : ""}</PlayerState></ListPitchPlayers></TeamState><TeamState><Data><TeamId>1</TeamId></Data><ListPitchPlayers><PlayerState><Id>7</Id><Cell><X>5</X><Y>5</Y></Cell></PlayerState></ListPitchPlayers></TeamState></ListTeams></BoardState>`;
  const action = o.action ?? 1,
    target = action === 2 ? 7 : -1;
  const step = `<PlayerStep><PlayerId>42</PlayerId><TargetId>${target}</TargetId><IsEvaluation>0</IsEvaluation><StepType>0</StepType><CellFrom><X>4</X><Y>5</Y></CellFrom><CellTo><X>${action === 2 ? 5 : 4}</X><Y>5</Y></CellTo><State>3</State><Skill>0</Skill></PlayerStep>`;
  const declaration = `<EventExecuteSequence><Sequence><StepResult><Step><MessageData>${encodedMessage(step)}</MessageData></Step><Results><StringMessage><MessageData>${encodedMessage(`<ResultUseAction><Action>${action}</Action><TeamId>0</TeamId></ResultUseAction>`)}</MessageData></StringMessage></Results></StepResult></Sequence></EventExecuteSequence>`;
  const future =
    (o.gap ?? "") +
    (o.noReturn
      ? ""
      : `<EventNewGamePhase><Phase>3</Phase></EventNewGamePhase>${board(3)}${o.playingGap ?? ""}${o.noPlaying ? "" : `<EventNewGamePhase><Phase>4</Phase></EventNewGamePhase><EventNewGamePhase><Phase>5</Phase></EventNewGamePhase>${board(5)}${o.activationGap ?? ""}${o.noActivation ? "" : declaration}`}`) +
    (o.future ?? "");
  return regenerationStateXml({ future, missingGamer: o.missingGamer });
}
