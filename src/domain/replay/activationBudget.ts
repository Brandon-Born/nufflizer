import type { ReplayEvent } from "./types";

// ResultUseAction is an activation-budget declaration. Its header parameters
// do not establish movement, an executed special action or legal eligibility.
const kinds = { 3: "blitz", 4: "pass", 5: "handoff", 6: "foul" } as const;
export type ActivationBudgetEvidence = {
  actionCode: 3 | 4 | 5 | 6;
  kind: "blitz" | "pass" | "handoff" | "foul";
  headerState: 1 | 2 | 3;
  headerTargetId: number;
  headerCellFrom: { x: number; y: number };
  headerCellTo: { x: number; y: number };
};
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | undefined =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Obj)
    : undefined;
const integer = (v: unknown, min = 0, max = 1_000_000): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
const fields = (p: Obj, keys: string[]) =>
  Object.keys(p).every((k) => keys.includes(k));
function cell(v: unknown, xml: boolean) {
  const p = obj(v),
    x = xml ? "X" : "x",
    y = xml ? "Y" : "y";
  if (
    !p ||
    !fields(p, [x, y]) ||
    !integer(p[x], 0, 25) ||
    !integer(p[y], 0, 14)
  )
    return;
  return { x: p[x] as number, y: p[y] as number };
}
export function isActivationBudgetEvidence(
  v: unknown
): v is ActivationBudgetEvidence {
  const p = obj(v);
  return (
    !!p &&
    fields(p, [
      "actionCode",
      "kind",
      "headerState",
      "headerTargetId",
      "headerCellFrom",
      "headerCellTo"
    ]) &&
    integer(p.actionCode, 3, 6) &&
    p.kind === kinds[p.actionCode as 3 | 4 | 5 | 6] &&
    (p.headerState === 1 || p.headerState === 2 || p.headerState === 3) &&
    integer(p.headerTargetId, -1) &&
    !!cell(p.headerCellFrom, false) &&
    !!cell(p.headerCellTo, false)
  );
}
export function readActivationBudget(
  e: ReplayEvent,
  step: ReplayEvent | undefined,
  version: string | undefined
): ActivationBudgetEvidence | undefined {
  const p = step?.payload,
    message = e.payload,
    code = message?.Action;
  if (
    version !== "1-4-0-0" ||
    !integer(code, 3, 6) ||
    !step ||
    !p ||
    !message ||
    !fields(message, ["Action", "TeamId"]) ||
    (message.TeamId !== undefined && !integer(message.TeamId, 0, 1)) ||
    !fields(p, [
      "Probability",
      "PlayerId",
      "TargetId",
      "TeamId",
      "IsEvaluation",
      "StepType",
      "CellTo",
      "State",
      "CellFrom",
      "Skill"
    ]) ||
    !integer(p.PlayerId) ||
    !integer(p.TargetId, -1) ||
    p.StepType !== 0 ||
    p.IsEvaluation !== 0 ||
    p.Skill !== 0 ||
    (p.State !== 1 && p.State !== 2 && p.State !== 3) ||
    (p.TeamId !== undefined && !integer(p.TeamId, 0, 1)) ||
    (p.Probability !== undefined &&
      (typeof p.Probability !== "number" ||
        !Number.isFinite(p.Probability) ||
        p.Probability < 0 ||
        p.Probability > 100)) ||
    step.sourceTag !== "PlayerStep" ||
    e.sourceTag !== "ResultUseAction" ||
    !integer(step.sourceIndex, 1) ||
    !integer(e.sourceIndex, 1) ||
    step.id !== `source-${step.sourceIndex}` ||
    e.id !== `source-${e.sourceIndex}` ||
    e.sourceIndex !== step.sourceIndex + 1 ||
    !e.sequenceId ||
    e.sequenceId !== step.sequenceId ||
    !e.actionId ||
    e.actionId !== step.actionId ||
    !integer(step.locator?.replayStep, 1) ||
    !integer(step.locator?.childIndex) ||
    step.locator?.messageIndex !== undefined ||
    step.locator?.stepIndex !== 0 ||
    e.locator?.stepIndex !== 0 ||
    e.locator.messageIndex !== 0 ||
    e.locator.replayStep !== step.locator.replayStep ||
    e.locator.childIndex !== step.locator.childIndex ||
    [step, e].some(
      (raw) =>
        raw.stepTag !== "PlayerStep" ||
        raw.stepType !== 0 ||
        raw.playerId !== String(p.PlayerId) ||
        raw.stepActorId !== String(p.PlayerId) ||
        raw.targetId !== String(p.TargetId) ||
        raw.stepTargetId !== String(p.TargetId) ||
        raw.attributionConflict
    )
  )
    return;
  const from = cell(p.CellFrom, true),
    to = cell(p.CellTo, true);
  if (!from || !to) return;
  return {
    actionCode: code as 3 | 4 | 5 | 6,
    kind: kinds[code as 3 | 4 | 5 | 6],
    headerState: p.State,
    headerTargetId: p.TargetId,
    headerCellFrom: from,
    headerCellTo: to
  };
}
export function validReturnBudget(
  actionCode: number,
  budget: unknown,
  from: { x: number; y: number },
  targetId: string | undefined
) {
  if (actionCode === 1 || actionCode === 2) return budget === undefined;
  return (
    isActivationBudgetEvidence(budget) &&
    budget.actionCode === actionCode &&
    budget.headerCellFrom.x === from.x &&
    budget.headerCellFrom.y === from.y &&
    String(budget.headerTargetId) === targetId
  );
}
export function returnDeclarationName(actionCode: number): string {
  return actionCode === 1
    ? "Move"
    : actionCode === 2
      ? "Block"
      : ({
          3: "Blitz budget",
          4: "Pass budget",
          5: "Hand-off budget",
          6: "Foul budget"
        }[actionCode] ?? "Unknown budget");
}
