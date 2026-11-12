import type { ReplayEvent, ReplayModel } from "@/domain/replay/types";
import type { LuckEvent } from "./types";

export function recordedInjuryName(outcome: "stunned" | "ko" | "casualty") {
  return { stunned: "Stunned", ko: "KO", casualty: "Casualty" }[outcome];
}
export function directInjuryOutcome(
  code: unknown
): "stunned" | "ko" | "casualty" | undefined {
  return code === 0
    ? "stunned"
    : code === 2
      ? "ko"
      : code === 4
        ? "casualty"
        : undefined;
}
const fields = (p: Record<string, unknown> | undefined, keys: string[]) =>
  !!p &&
  typeof p === "object" &&
  !Array.isArray(p) &&
  Object.keys(p).every((k) => keys.includes(k));
function object(p: unknown): Record<string, unknown> | undefined {
  return p && typeof p === "object" && !Array.isArray(p)
    ? (p as Record<string, unknown>)
    : undefined;
}
function observedRoll(roll: Record<string, unknown> | undefined) {
  const dice = object(roll?.Dice),
    faces = dice?.Die;
  const mods = roll?.Modifiers;
  const values = object(mods)?.Modifier;
  const modifiers = Array.isArray(values) ? values : [values];
  return (
    roll?.RollType === 11 &&
    roll.Status === 1 &&
    Number.isSafeInteger(roll.Source) &&
    Number(roll.Source) >= 0 &&
    Number(roll.Source) <= 64 &&
    fields(roll, [
      "Status",
      "Modifiers",
      "Dice",
      "Source",
      "RollType",
      "Outcome"
    ]) &&
    !!dice &&
    Object.keys(dice).join() === "Die" &&
    Array.isArray(faces) &&
    faces.length === 2 &&
    faces.every((x) => {
      const d = object(x);
      return (
        fields(d, ["DieType", "Value"]) &&
        d?.DieType === 0 &&
        Number.isInteger(d.Value) &&
        Number(d.Value) >= 1 &&
        Number(d.Value) <= 6
      );
    }) &&
    (mods === undefined ||
      mods === "" ||
      (fields(object(mods), ["Modifier"]) &&
        modifiers.length <= 16 &&
        modifiers.every((x) => {
          const m = object(x);
          return (
            fields(m, [
              "PlayerId",
              "Skill",
              "Effect",
              "Value",
              "ModifierType"
            ]) &&
            ["PlayerId", "Skill", "Effect", "Value", "ModifierType"].every(
              (k) => Number.isSafeInteger(m?.[k])
            )
          );
        })))
  );
}
// Labels the observed categorical result, never its probability, final posture,
// injury table, freshness of unrelated records or a coach's mitigation choice.
export function attachInjuryObservations(
  replay: ReplayModel,
  sources: ReadonlyMap<string, LuckEvent>
) {
  if (replay.replayVersion !== "1-4-0-0") return;
  for (const turn of replay.turns) {
    const steps = new Map<string, ReplayEvent>(),
      ambiguous = new Set<string>();
    for (const event of turn.events)
      if (event.sourceTag === "DamageStep" && event.actionId) {
        if (steps.has(event.actionId)) ambiguous.add(event.actionId);
        steps.set(event.actionId, event);
      }
    for (const raw of turn.events) {
      const report = sources.get(raw.id ?? ""),
        step = raw.actionId ? steps.get(raw.actionId) : undefined;
      const embedded = raw.sourceTag === "QuestionKORecovery";
      const roll = embedded ? object(raw.payload?.RollInfos) : raw.payload;
      const outcome = directInjuryOutcome(roll?.Outcome);
      if (
        !report ||
        report.scoringStatus !== "excluded" ||
        report.metadata.isRollCandidate !== true ||
        report.type !== "injury" ||
        report.probabilitySuccess !== null ||
        report.actualSuccess !== null ||
        report.metadata.rollType !== 11 ||
        report.metadata.embeddedDamageOriginalId ||
        report.metadata.mergedRerollAnchorId ||
        (!embedded && raw.sourceTag !== "ResultInjuryRoll") ||
        (embedded && outcome !== "ko") ||
        !outcome ||
        !roll ||
        !observedRoll(roll) ||
        !step ||
        !raw.actionId ||
        ambiguous.has(raw.actionId) ||
        !raw.playerId ||
        report.playerId !== raw.playerId ||
        report.teamId === "unresolved" ||
        raw.stepTag !== "DamageStep" ||
        raw.stepType !== 2 ||
        raw.stepActorId !== raw.playerId ||
        raw.stepTargetId !== raw.playerId ||
        raw.targetId !== raw.playerId ||
        raw.attributionConflict ||
        raw.actorTeamSource === "turn_inferred" ||
        raw.actorTeamId !== report.teamId ||
        (raw.teamId && raw.teamId !== report.teamId) ||
        step.attributionConflict ||
        step.actorTeamId !== report.teamId ||
        step.actorTeamSource === "turn_inferred" ||
        step.playerId !== raw.playerId ||
        step.targetId !== raw.playerId ||
        step.stepType !== 2 ||
        step.damageSource !== roll?.Source ||
        raw.damageSource !== roll.Source ||
        step.payload?.Applied !== 1 ||
        step.payload.IsEvaluation !== 0 ||
        step.payload.Skill !== 0 ||
        ![1, 2, 3].includes(Number(step.payload.State)) ||
        !fields(step.payload, [
          "Applied",
          "Probability",
          "Source",
          "PlayerId",
          "TargetId",
          "IsEvaluation",
          "StepType",
          "CellTo",
          "State",
          "CellFrom",
          "Skill"
        ]) ||
        step.sequenceId !== raw.sequenceId ||
        step.sourceIndex === undefined ||
        raw.sourceIndex === undefined ||
        step.sourceIndex >= raw.sourceIndex ||
        report.metadata.outcomeCode !== roll.Outcome ||
        JSON.stringify(report.metadata.dice) !==
          JSON.stringify(
            (object(roll.Dice)!.Die as { Value: number }[]).map((d) => d.Value)
          )
      )
        continue;
      report.metadata.injuryObservation = {
        outcome,
        recordKind: embedded ? "embedded_ko" : "direct",
        subjectId: raw.playerId,
        subjectTeamId: report.teamId,
        sourceCode: Number(roll.Source),
        damageStepSourceIndex: step.sourceIndex
      };
      report.metadata.damage = {
        ...report.metadata.damage,
        subjectId: raw.playerId,
        subjectTeamId: report.teamId,
        sourceCode: Number(roll.Source),
        perspective: "subject_team",
        chainActionId: raw.actionId,
        observedInjury: true
      };
      const name = recordedInjuryName(outcome);
      report.label = `Recorded injury: ${name} (not scored)`;
      report.statusReason =
        "excluded: recorded injury outcome has no verified odds for the applicable trait-dependent distribution";
      report.explainability.target = "categorical injury outcome";
      report.explainability.inputsSummary = `Recorded 2D6 injury [${report.metadata.dice!.join(", ")}] produced ${name}; outcome odds are unverified and no binary threshold is assumed`;
      report.metadata.normalizationFlags =
        report.metadata.normalizationFlags?.filter(
          (f) => f !== "missing_target_threshold"
        );
      report.metadata.normalizationNotes =
        report.metadata.normalizationNotes?.filter(
          (n) => n !== "difficulty and requirement were both missing"
        );
    }
  }
}
