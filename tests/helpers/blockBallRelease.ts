import { readFileSync } from "node:fs";
import { encodedMessage, envelope } from "./replay";

type Projection = {
  [key: string]: string | null | Projection | (string | Projection)[];
};
type Step = { step: Projection; messages: Projection[] };
type Frame = {
  replayStep: number;
  children: { tag: string; projection?: Projection | null; steps?: Step[] }[];
};
export type BlockBallCase = {
  id: string;
  sourceFile: string;
  sha256: string;
  originalReplayStep: number;
  bounceStepIndex: number;
  holderId: string;
  final: Projection;
  fromCell: Projection;
  toCell: Projection;
  initialRosters: { teamId: number; players: number[] }[];
  frames: Frame[];
};
export const blockBallCases = JSON.parse(
  readFileSync("tests/fixtures/evidence/bb3-block-ball-release.json", "utf8")
).cases as BlockBallCase[];
function xml(p: Projection): string {
  return Object.entries(p)
    .map(([k, vs]) =>
      (Array.isArray(vs) ? vs : [vs])
        .map(
          (v) =>
            `<${k}>${v === null ? "" : typeof v === "string" ? v : xml(v)}</${k}>`
        )
        .join("")
    )
    .join("");
}
function sequence(steps: Step[]) {
  return `<EventExecuteSequence><Sequence>${steps.map((s) => `<StepResult><Step><MessageData>${encodedMessage(xml(s.step))}</MessageData></Step><Results>${s.messages.map((m) => `<StringMessage><MessageData>${encodedMessage(xml(m))}</MessageData></StringMessage>`).join("")}</Results></StepResult>`).join("")}</Sequence></EventExecuteSequence>`;
}
const roster = (teamId: number, players: number[]) =>
  `<TeamState><Data><TeamId>${teamId}</TeamId></Data><ListPitchPlayers>${players.map((id) => `<PlayerState><Id>${id}</Id></PlayerState>`).join("")}</ListPitchPlayers></TeamState>`;
// Numeric source projections retain order and sequence boundaries. Fragment
// locators are reindexed; original source locators remain in the evidence file.
export function blockBallSourceXml(id = "demo5-196") {
  const c = blockBallCases.find((c) => c.id === id)!;
  const initial = `<NotificationGameJoined><InitialBoardState><ListTeams>${c.initialRosters.map((t) => roster(t.teamId, t.players)).join("")}</ListTeams></InitialBoardState></NotificationGameJoined>`;
  return envelope(
    initial +
      c.frames
        .map(
          (f) =>
            `<ReplayStep>${f.children.map((c) => (c.steps ? sequence(c.steps) : `<${c.tag}>${c.projection ? xml(c.projection) : ""}</${c.tag}>`)).join("")}</ReplayStep>`
        )
        .join("")
  );
}

export function blockBallPlaybackXml(wrestle = false) {
  const c = JSON.parse(
    readFileSync("tests/fixtures/evidence/bb3-ui-playback-025.json", "utf8")
  ).cases.find((c: { id: string }) => c.id === "UI-096") as {
    rawRecords: (Step & { sequence: number })[];
    eventRecords: { replayStep: number; projection: Projection }[];
  };
  const groups = [279, 280, 281].map((n) =>
    c.rawRecords.filter((s) => s.sequence === n)
  );
  if (wrestle) {
    // Explicit synthetic rule variant, not an observed UI-096 Wrestle claim.
    const question = groups[1]![0]!.messages[1]!
      .QuestionBlockDice as Projection;
    question.DiceOutcomes = [{ DiceOutcomesItem: ["2"] }];
    for (const message of groups[2]![0]!.messages) {
      const p = (message.ResultBlockRoll ??
        message.ResultBlockOutcome) as Projection;
      p.Outcome = ["2"];
    }
    groups[2]![0]!.messages.unshift({
      ResultSkillUsage: { PlayerId: ["5"], Skill: ["68"], Used: ["1"] }
    });
    groups[2] = groups[2]!.filter(
      (s) =>
        Object.hasOwn(s.step, "PlayerStep") || Object.hasOwn(s.step, "BallStep")
    );
  }
  const before = c.eventRecords.find((r) => r.replayStep === 401)!.projection;
  const after = c.eventRecords.find(
    (r) => r.replayStep === 402 && Object.hasOwn(r.projection, "BoardState")
  )!.projection;
  const end = c.eventRecords.find((r) =>
    Object.hasOwn(r.projection, "EventEndTurn")
  )!.projection;
  // Synthetic owner scaffold from the independently observed home/away roles.
  // The omitted intervening timer/controller records are NOT reconstructed:
  // isolate the later snapshot in its own frame to prevent an adjacency claim.
  const initial = `<NotificationGameJoined><InitialBoardState><ListTeams>${roster(0, [5])}${roster(1, [48])}</ListTeams></InitialBoardState></NotificationGameJoined>`;
  return envelope(
    `${initial}<ReplayStep>${sequence(groups[0]!)}</ReplayStep><ReplayStep>${sequence(groups[1]!)}${xml(before)}</ReplayStep><ReplayStep>${sequence(groups[2]!)}${xml(end)}</ReplayStep><ReplayStep>${xml(after)}</ReplayStep>`
  );
}
