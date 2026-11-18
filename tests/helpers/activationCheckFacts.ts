import { execFileSync } from "node:child_process";
import type { ReplayEvent } from "@/domain/replay/types";

type RawCheck = {
  locator: number[];
  sourceTag: string;
  rollType: 33 | 34 | 36;
  status: number;
  newRoll: number;
  actor: string;
  team: string;
  assistant: string | null;
  assistantTeam: string | null;
  prefix: string[];
  skillId: 31 | 51 | 84;
  face: number;
  target: number;
  outcome: number;
  successFaces: number;
  numerator: number;
  animalContinuation: {
    standBy: [number, number];
    following: [number, number, number, number];
    followingPlayerId: string;
    teamTurn: number;
    actorRecordedCanAct: boolean | null;
    victim: {
      beforeRecordedCanAct: boolean | null;
      afterRecordedCanAct: boolean | null;
      afterPitchLocation: "on_pitch" | "off_pitch";
      afterStatusCode: number | null;
      afterSituationCode: number | null;
    } | null;
  } | null;
  continuation: {
    original: number[];
    teamUsed: boolean;
    gate: {
      skill: 44 | 1008;
      target: number;
      face: number;
      passed: boolean;
      accessDelta: [number, number];
      policyChance: [number, number];
    } | null;
  } | null;
};

let sources: { file: string; rows: RawCheck[] }[] | undefined;

export function activationCheckFacts() {
  sources ??= execFileSync(
    "python3",
    ["scripts/extract-activation-checks.py"],
    {
      encoding: "utf8"
    }
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  return sources;
}

export function activationCheckLocator(
  at: NonNullable<ReplayEvent["locator"]>
) {
  return [at.replayStep, at.childIndex, at.stepIndex, at.messageIndex].join();
}

export function activationGateFacts(rows: readonly RawCheck[]) {
  return new Map(
    rows.flatMap((row) => {
      const gate = row.continuation?.gate;
      if (!gate) return [];
      const location = [...row.locator.slice(0, 3), 2].join();
      return [[location, { ...gate, team: row.team }] as const];
    })
  );
}
