import type { ReplayEvent } from "@/domain/replay/types";
import { model } from "./replay";
// Compact synthetic decision tree, independently varied from raw source
// captures. The second face is sampled only when the policy chooses a reroll.
export function numericRerollPolicy(options: {
  family: number;
  target: number;
  first: number;
  second: number;
  use: boolean;
  emitted?: boolean;
  resource?: "team" | "skill";
}) {
  const { family, target, first, second, use } = options,
    resource = options.resource ?? "team",
    stepType = family === 7 ? 4 : 1;
  const result = (face: number, status = 1, newRoll = 1) => ({
    Status: status,
    NewRoll: newRoll,
    RollType: family,
    Requirement: target,
    Difficulty: target,
    Outcome: Number(face >= target),
    Modifiers: "",
    Dice: { Die: { DieType: 0, Value: face } }
  });
  const events: ReplayEvent[] = [];
  const add = (
    tag: string,
    payload: Record<string, unknown>,
    phase: 1 | 2,
    messageIndex: number
  ) =>
    events.push({
      type: tag === "ResultRoll" ? "roll" : "unknown",
      sourceTag: tag,
      id: `source-${events.length + 1}`,
      sourceIndex: events.length + 1,
      playerId: "42",
      teamId: "0",
      actorTeamId: "0",
      actorTeamSource: "explicit",
      stepActorId: "42",
      stepTargetId: "-1",
      targetId: "-1",
      stepTag: "PlayerStep",
      stepType,
      actionId: `step-${resource === "skill" ? 1 : phase}`,
      sequenceId: `sequence-${resource === "skill" ? 1 : phase}`,
      locator: {
        replayStep: resource === "skill" ? 1 : phase,
        childIndex: 1,
        stepIndex: 0,
        messageIndex
      },
      rollType: tag === "ResultRoll" ? family : undefined,
      payload
    });
  if (first >= target) add("ResultRoll", result(first), 1, 0);
  else if (resource === "skill") {
    add("ResultRoll", result(first), 1, 0);
    add(
      "ResultSkillUsage",
      {
        PlayerId: 42,
        Skill: family === 2 ? 7 : family === 4 ? 61 : 6,
        Used: 1
      },
      1,
      1
    );
    add("ResultRoll", result(second, 2), 1, 2);
  } else {
    if (options.emitted) add("ResultRoll", result(first), 1, 0);
    add(
      "QuestionTeamRerollUsage",
      {
        GamerId: 0,
        CanUseTeamReroll: 1,
        CanUseProReroll: 0,
        StarSpecialRule: -1,
        RollInfos: result(first)
      },
      1,
      options.emitted ? 1 : 0
    );
    add("ResultTeamRerollUsage", { GamerId: 0, Used: Number(use) }, 2, 0);
    add(
      "ResultRoll",
      result(use ? second : first, use ? 2 : 1, use ? 1 : 0),
      2,
      1
    );
  }
  const replay = model(events);
  replay.playerOwnershipKeys = ["0:42", "1:7"];
  return replay;
}
