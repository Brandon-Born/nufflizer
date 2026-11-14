import type { ReplayEvent, ReplayModel } from "@/domain/replay/types";
import type { OwnershipTimeline } from "@/domain/replay/ownershipTimeline";
import type { DiceRecord } from "./diceEvidence";
import type { LuckEvent } from "./types";

// Installed NetGameplayCasualty namespace, independently joined to the
// BB2020 p61 tables and paired playback. A copied OriginalRoll is not a result.
export const CASUALTY_NAMES = {
  no_injury: "No injury",
  badly_hurt: "Badly Hurt",
  seriously_hurt: "Seriously Hurt",
  serious_injury: "Serious Injury",
  lasting_injury: "Lasting Injury",
  smashed_knee: "Smashed Knee",
  head_injury: "Head Injury",
  broken_arm: "Broken Arm",
  neck_injury: "Neck Injury",
  dislocated_shoulder: "Dislocated Shoulder",
  dead: "Dead"
} as const;
type CasualtyOutcome = keyof typeof CASUALTY_NAMES;
export function casualtyOutcome(
  code: unknown,
  replacement = false
): CasualtyOutcome | undefined {
  if (code === 0) return replacement ? "no_injury" : undefined;
  if (
    typeof code !== "number" ||
    !Number.isInteger(code) ||
    code < 1 ||
    code > 10
  )
    return;
  return (
    {
      1: "badly_hurt",
      2: "seriously_hurt",
      3: "serious_injury",
      4: "lasting_injury",
      5: "smashed_knee",
      6: "head_injury",
      7: "broken_arm",
      8: "neck_injury",
      9: "dislocated_shoulder",
      10: "dead"
    } as const
  )[code as 1];
}
const kinds = {
  ResultCasualtyRoll: "direct",
  QuestionApothecaryCasualtyUsage: "apothecary_original",
  QuestionApothecaryCasualtyChoice: "apothecary_replacement"
} as const;
function object(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}
function fields(p: Record<string, unknown> | undefined, keys: string[]) {
  return !!p && Object.keys(p).every((k) => keys.includes(k));
}
function observedRoll(roll: Record<string, unknown> | undefined) {
  const dice = object(roll?.Dice),
    raw = dice?.Die;
  const faces = Array.isArray(raw) ? raw : [raw];
  const values = object(roll?.Modifiers)?.Modifier;
  const modifiers = Array.isArray(values) ? values : [values];
  return (
    roll?.RollType === 12 &&
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
    fields(dice, ["Die"]) &&
    faces.length >= 1 &&
    faces.length <= 2 &&
    faces.every((x, i) => {
      const d = object(x);
      return (
        fields(d, ["DieType", "Value"]) &&
        d?.DieType === (i ? 0 : 4) &&
        Number.isInteger(d.Value) &&
        Number(d.Value) >= 1 &&
        Number(d.Value) <= (i ? 6 : 16)
      );
    }) &&
    (roll.Modifiers === undefined ||
      roll.Modifiers === "" ||
      (fields(object(roll.Modifiers), ["Modifier"]) &&
        modifiers.length <= 16 &&
        modifiers.every((x) => {
          const m = object(x),
            keys = ["PlayerId", "Skill", "Effect", "Value", "ModifierType"];
          return (
            fields(m, keys) && keys.every((k) => Number.isSafeInteger(m?.[k]))
          );
        })))
  );
}

// Names only the reported categorical result. Missing modifiers do not prove
// an unmodified table, nor do these observations prove treatment/availability.
export function attachCasualtyObservations(
  replay: ReplayModel,
  sources: ReadonlyMap<string, LuckEvent>,
  owners: OwnershipTimeline
) {
  if (replay.replayVersion !== "1-4-0-0") return;
  for (const turn of replay.turns) {
    const steps = new Map<string, ReplayEvent>(),
      ambiguous = new Set<string>();
    for (const e of turn.events)
      if (e.sourceTag === "DamageStep" && e.actionId) {
        if (steps.has(e.actionId)) ambiguous.add(e.actionId);
        steps.set(e.actionId, e);
      }
    for (const raw of turn.events) {
      const kind = kinds[raw.sourceTag as keyof typeof kinds];
      if (!kind) continue;
      const event = sources.get(raw.id ?? ""),
        step = steps.get(raw.actionId ?? "");
      const roll =
        kind === "direct"
          ? raw.payload
          : object(
              raw.payload?.[
                kind === "apothecary_original" ? "RollInfos" : "NewRoll"
              ]
            );
      const outcome = casualtyOutcome(
        roll?.Outcome,
        kind === "apothecary_replacement"
      );
      if (
        !event ||
        event.scoringStatus !== "excluded" ||
        event.type !== "injury" ||
        event.metadata.isRollCandidate !== true ||
        event.probabilitySuccess !== null ||
        event.actualSuccess !== null ||
        event.metadata.rollType !== 12 ||
        event.metadata.embeddedDamageOriginalId ||
        event.metadata.mergedRerollAnchorId ||
        event.metadata.repeatedDiceSourceId ||
        !outcome ||
        !roll ||
        !observedRoll(roll) ||
        (kind !== "direct" &&
          (!fields(
            raw.payload,
            kind === "apothecary_original"
              ? ["GamerId", "RollInfos"]
              : ["GamerId", "NewRoll", "OriginalRoll"]
          ) ||
            ![0, 1].includes(Number(raw.payload?.GamerId)) ||
            typeof raw.payload?.GamerId !== "number")) ||
        !step ||
        !raw.actionId ||
        ambiguous.has(raw.actionId) ||
        !raw.playerId ||
        event.playerId !== raw.playerId ||
        event.teamId === "unresolved" ||
        raw.stepTag !== "DamageStep" ||
        raw.stepType !== 2 ||
        raw.stepActorId !== raw.playerId ||
        raw.stepTargetId !== raw.playerId ||
        raw.targetId !== raw.playerId ||
        raw.attributionConflict ||
        raw.actorTeamSource === "turn_inferred" ||
        raw.actorTeamId !== event.teamId ||
        (raw.teamId && raw.teamId !== event.teamId) ||
        step.attributionConflict ||
        step.actorTeamId !== event.teamId ||
        step.actorTeamSource === "turn_inferred" ||
        step.playerId !== raw.playerId ||
        step.targetId !== raw.playerId ||
        step.stepType !== 2 ||
        step.damageSource !== roll.Source ||
        raw.damageSource !== roll.Source ||
        step.payload?.Applied !== 1 ||
        step.payload.IsEvaluation !== 0 ||
        step.payload.Skill !== 0 ||
        !Number.isSafeInteger(step.payload.State) ||
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
        event.metadata.outcomeCode !== roll.Outcome ||
        JSON.stringify(event.metadata.dice) !==
          JSON.stringify(
            (Array.isArray(object(roll.Dice)!.Die)
              ? (object(roll.Dice)!.Die as unknown[])
              : [object(roll.Dice)!.Die]
            ).map((d) => object(d)!.Value)
          )
      )
        continue;
      const owner = owners.resolve(raw.playerId, raw);
      if (owner.status !== "confirmed" || owner.proof.teamId !== event.teamId)
        continue;
      event.metadata.ownership = { ...owner.proof, role: "subject" };
      event.metadata.casualtyObservation = {
        outcome,
        recordKind: kind,
        subjectId: raw.playerId,
        subjectTeamId: event.teamId,
        sourceCode: Number(roll.Source),
        damageStepSourceIndex: step.sourceIndex
      };
      event.label = `Recorded casualty: ${CASUALTY_NAMES[outcome]} (not scored)`;
      event.statusReason =
        "excluded: recorded casualty outcome has no verified probability or current-match value policy";
      event.explainability.target = "categorical casualty outcome";
      event.explainability.inputsSummary = `Recorded casualty dice [${event.metadata.dice!.join(", ")}] produced ${CASUALTY_NAMES[outcome]}; this is not a binary success or current-match impact score`;
      event.metadata.normalizationFlags =
        event.metadata.normalizationFlags?.filter(
          (f) => f !== "missing_target_threshold"
        );
      event.metadata.normalizationNotes =
        event.metadata.normalizationNotes?.filter(
          (n) => n !== "difficulty and requirement were both missing"
        );
    }
  }
}

// The physical field path prevents OriginalRoll copies or an unrelated die
// from certifying an original/replacement observation in an exported report.
export function validReportedCasualtyObservation(
  event: LuckEvent,
  dice: DiceRecord | undefined
) {
  const o = event.metadata.casualtyObservation,
    m = event.metadata;
  if (!o) return true;
  const tag =
    o.recordKind === "direct"
      ? "ResultCasualtyRoll"
      : o.recordKind === "apothecary_original"
        ? "QuestionApothecaryCasualtyUsage"
        : "QuestionApothecaryCasualtyChoice";
  const path =
    o.recordKind === "direct"
      ? ["Dice"]
      : [
          o.recordKind === "apothecary_original" ? "RollInfos" : "NewRoll",
          "Dice"
        ];
  return (
    event.type === "injury" &&
    event.scoringStatus === "excluded" &&
    m.isRollCandidate === true &&
    event.probabilitySuccess === null &&
    event.actualSuccess === null &&
    event.delta === 0 &&
    event.weightedDelta === 0 &&
    !event.contextualImpact &&
    !event.contextualBounds &&
    !event.possessionBounds &&
    !event.catchPossessionBounds &&
    !m.injuryObservation &&
    !m.injuryTable &&
    !m.injuryScoring &&
    !m.embeddedDamageOriginalId &&
    !m.mergedRerollAnchorId &&
    !m.repeatedDiceSourceId &&
    m.sourceTag === tag &&
    m.rollType === 12 &&
    m.stepType === 2 &&
    !!m.actionId &&
    !!m.sequenceId &&
    m.sourceIndex !== undefined &&
    o.damageStepSourceIndex < m.sourceIndex &&
    event.playerId === o.subjectId &&
    event.teamId === o.subjectTeamId &&
    event.teamId !== "unresolved" &&
    m.ownership?.role === "subject" &&
    m.ownership.playerId === event.playerId &&
    m.ownership.teamId === event.teamId &&
    m.targetId === event.playerId &&
    casualtyOutcome(
      m.outcomeCode,
      o.recordKind === "apothecary_replacement"
    ) === o.outcome &&
    !!dice &&
    dice.parentKind === "event" &&
    dice.parentEventId === event.id &&
    dice.parentSourceId === m.sourceId &&
    dice.parentSourceIndex === m.sourceIndex &&
    dice.parentSourceTag === tag &&
    dice.actionId === m.actionId &&
    dice.stepTag === "DamageStep" &&
    dice.stepType === 2 &&
    dice.stepActorId === event.playerId &&
    dice.stepTargetId === event.playerId &&
    dice.damageSource === o.sourceCode &&
    dice.status === 1 &&
    dice.quality === "complete" &&
    dice.disposition === "unscored_roll" &&
    !dice.aliasOf &&
    dice.rollType === 12 &&
    JSON.stringify(dice.path) === JSON.stringify(path) &&
    dice.dice.length >= 1 &&
    dice.dice.length <= 2 &&
    dice.dice.every(
      (d, i) =>
        d.dieType === (i ? 0 : 4) &&
        Number.isInteger(d.value) &&
        d.value! >= 1 &&
        d.value! <= (i ? 6 : 16)
    ) &&
    JSON.stringify(dice.dice.map((d) => d.value)) === JSON.stringify(m.dice) &&
    JSON.stringify(dice.dice.map((d) => d.dieType)) ===
      JSON.stringify(m.dieTypes)
  );
}
