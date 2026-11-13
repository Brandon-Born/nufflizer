import type { ReplayEvent } from "@/domain/replay/types";
import { numericRerollPolicy } from "./numericRerollPolicy";

export function gatedDodgePolicy(
  target = 3,
  first = 1,
  gateFace = 2,
  replacement = 6,
  use = true,
  kind: "loner" | "pro" = "loner",
  gateTarget: 3 | 4 = 4
) {
  const replay = numericRerollPolicy({
    family: 2,
    target,
    first,
    second: replacement,
    use
  });
  if (first >= target) return replay;
  const [q, choice, final] = replay.turns[0]!.events;
  q!.payload!.CanUseTeamReroll = Number(kind === "loner");
  q!.payload!.CanUseProReroll = Number(kind === "pro");
  const header = (state: 1 | 2): ReplayEvent => ({
    type: "step",
    sourceTag: "PlayerStep",
    playerId: "42",
    teamId: "0",
    actorTeamId: "0",
    actorTeamSource: "explicit",
    stepActorId: "42",
    targetId: "-1",
    stepTargetId: "-1",
    stepTag: "PlayerStep",
    stepType: 1,
    actionId: `step-${state}`,
    sequenceId: `sequence-${state}`,
    locator: { replayStep: state, childIndex: 1, stepIndex: 0 },
    payload: {
      Probability: 100,
      PlayerId: 42,
      TargetId: -1,
      IsEvaluation: 0,
      StepType: 1,
      CellFrom: { X: 10, Y: 3 },
      CellTo: { X: 9, Y: 2 },
      State: state,
      Skill: 0
    }
  });
  const control = (
    tag: string,
    payload: Record<string, unknown>,
    mi: number
  ): ReplayEvent => ({
    ...header(2),
    type: tag === "ResultRoll" ? "roll" : "unknown",
    sourceTag: tag,
    locator: { replayStep: 2, childIndex: 1, stepIndex: 0, messageIndex: mi },
    payload,
    rollType: tag === "ResultRoll" ? (kind === "loner" ? 71 : 15) : undefined
  });
  choice!.payload!.Used = Number(use && kind === "loner");
  const threshold = kind === "pro" ? 3 : gateTarget,
    passed = gateFace >= threshold;
  const gate = control(
    "ResultRoll",
    {
      Status: 1,
      NewRoll: 1,
      RollType: kind === "loner" ? 71 : 15,
      Requirement: threshold,
      Difficulty: threshold,
      Outcome: Number(passed),
      Modifiers: "",
      Dice: { Die: { DieType: 0, Value: gateFace } }
    },
    2
  );
  const skill = control(
    "ResultSkillUsage",
    {
      PlayerId: 42,
      Used: 1,
      Skill: kind === "pro" ? 50 : gateTarget === 3 ? 1008 : 44
    },
    1
  );
  const fresh = use && passed;
  final!.payload!.Status = fresh ? 2 : 1;
  final!.payload!.NewRoll = Number(fresh);
  final!.payload!.Outcome = Number(fresh && replacement >= target);
  final!.payload!.Dice = {
    Die: { DieType: 0, Value: fresh ? replacement : first }
  };
  final!.locator!.messageIndex = use ? 3 : 1;
  const events = use
    ? [header(1), q!, header(2), choice!, skill, gate, final!]
    : [header(1), q!, header(2), choice!, final!];
  events.forEach((e, i) => {
    e.sourceIndex = i + 1;
    e.id = `source-${i + 1}`;
  });
  replay.turns[0]!.events = events;
  replay.turns[0]!.eventCount = events.length;
  return replay;
}
