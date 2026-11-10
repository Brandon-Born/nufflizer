import type { ReplayEvent, ReplayModel } from "@/domain/replay/types";
export function encodedMessage(xml: string): string {
  return Buffer.from(Buffer.from(xml).toString("base64")).toString("base64");
}
export function sequence(
  messages: string[],
  player = "42",
  team = "0"
): string {
  return `<EventExecuteSequence><Sequence><StepResult><Step><Name>synthetic</Name><MessageData>${encodedMessage(`<PlayerStep><PlayerId>${player}</PlayerId><TargetId>-1</TargetId><TeamId>${team}</TeamId><StepType>0</StepType></PlayerStep>`)}</MessageData></Step><Results>${messages.map((xml) => `<StringMessage><Name>synthetic</Name><MessageData>${encodedMessage(xml)}</MessageData></StringMessage>`).join("")}</Results></StepResult></Sequence></EventExecuteSequence>`;
}
export function envelope(events = "", root = "Replay"): string {
  return `<${root}><ReplayVersion>1-4-0-0</ReplayVersion><MatchId>synthetic-reference</MatchId><Teams><Team><id>0</id><name>Home</name></Team><Team><id>1</id><name>Away</name></Team></Teams>${events}</${root}>`;
}
export function rollXml(type = 7, face = 1, target = 2): string {
  return `<ResultRoll><Status>1</Status><NewRoll>1</NewRoll><RollType>${type}</RollType><Difficulty>${target}</Difficulty><Outcome>${Number(face >= target)}</Outcome><Dice><Die><DieType>0</DieType><Value>${face}</Value></Die></Dice></ResultRoll>`;
}
export function rollEvent(extra: Partial<ReplayEvent> = {}): ReplayEvent {
  return {
    type: "roll",
    sourceTag: "ResultRoll",
    actorTeamId: "0",
    actorTeamSource: "explicit",
    playerId: "42",
    rollType: 7,
    payload: {
      Status: 1,
      NewRoll: 1,
      Difficulty: 2,
      Outcome: 0,
      Dice: { Die: { DieType: 0, Value: 1 } }
    },
    ...extra
  };
}
export function model(events: ReplayEvent[]): ReplayModel {
  return {
    matchId: "synthetic-reference",
    rootTag: "Replay",
    replayVersion: "1-4-0-0",
    teams: [
      { id: "0", name: "Home" },
      { id: "1", name: "Away" }
    ],
    unknownCodes: [],
    raw: {},
    turns: [
      {
        turnNumber: 1,
        events,
        possibleTurnover: false,
        actionTexts: [],
        eventCount: events.length,
        raw: {}
      }
    ]
  };
}
