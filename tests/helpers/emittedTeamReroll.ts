import { lonerDriveXml } from "./lonerDrive";
import type { projectionXml } from "./playback";
type Projection = Parameters<typeof projectionXml>[0];
// Synthetic serialization variation of the independently extracted ordinary
// Rush transaction. It is not another game capture or a new source policy.
export function emittedTeamRerollXml(
  options: {
    includeOriginal?: boolean;
    first?: number;
    replacement?: number;
    target?: number;
  } = {}
) {
  const first = options.first ?? 1,
    replacement = options.replacement ?? 3,
    target = options.target ?? 2;
  return lonerDriveXml(
    "numeric_rush_spent",
    "tests/fixtures/evidence/bb3-reroll-counters.json",
    (records) => {
      for (const row of records)
        for (const step of row.steps ?? []) {
          const question = step.messages.find((m) => m.QuestionTeamRerollUsage)
            ?.QuestionTeamRerollUsage as Projection | undefined;
          if (question) {
            const original = (question.RollInfos as Projection[])[0]!;
            original.Requirement = [String(target)];
            original.Difficulty = [String(target)];
            original.Dice = [
              { Die: [{ DieType: ["0"], Value: [String(first)] }] }
            ];
            if (options.includeOriginal !== false) {
              const index = step.messages.findIndex(
                (m) => m.QuestionTeamRerollUsage
              );
              step.messages.splice(index, 0, {
                ResultRoll: structuredClone(original)
              });
            }
          }
          const final = step.messages.find((m) => m.ResultRoll)?.ResultRoll as
            Projection | undefined;
          if (final && (final.Status as string[])[0] === "2") {
            final.Requirement = [String(target)];
            final.Difficulty = [String(target)];
            final.Outcome = [String(Number(replacement >= target))];
            final.Dice = [
              { Die: [{ DieType: ["0"], Value: [String(replacement)] }] }
            ];
          }
        }
    }
  );
}
