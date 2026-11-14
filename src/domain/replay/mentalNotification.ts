import { recordedMentalEffect } from "./mentalEffects";
import type { ReplayEvent } from "./types";

const integer = (v: unknown, min = 0): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min;
const fields = (v: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(v).every((k) => keys.includes(k));
function cell(v: unknown) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const p = v as Record<string, unknown>;
  return (
    fields(p, ["X", "Y"]) &&
    integer(p.X) &&
    p.X <= 25 &&
    integer(p.Y) &&
    p.Y <= 14
  );
}

// An encoded notification must bind its explicit holder to its own ordinary
// activation header. This preserves other players' learned lists only; neither
// this record nor its header restores the holder's effective/physical state.
export function scopedMentalNotificationHolder(
  e: ReplayEvent,
  header: ReplayEvent | undefined
): string | undefined {
  const p = e.payload,
    h = header?.payload,
    at = e.locator,
    from = header?.locator;
  if (
    !["ResultAddPlayerEffect", "ResultEndPlayerEffect"].includes(e.sourceTag) ||
    !p ||
    !h ||
    !header ||
    !fields(p, ["PlayerId", "Effect"]) ||
    !integer(p.PlayerId) ||
    !recordedMentalEffect(p.Effect) ||
    !fields(h, [
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
    !integer(h.PlayerId) ||
    !integer(h.TargetId, -1) ||
    h.PlayerId !== p.PlayerId ||
    h.IsEvaluation !== 0 ||
    h.StepType !== 0 ||
    h.Skill !== 0 ||
    (h.State !== 1 && h.State !== 2 && h.State !== 3) ||
    (h.TeamId !== undefined && h.TeamId !== 0 && h.TeamId !== 1) ||
    (h.Probability !== undefined &&
      (typeof h.Probability !== "number" ||
        !Number.isFinite(h.Probability) ||
        h.Probability < 0 ||
        h.Probability > 100)) ||
    !cell(h.CellFrom) ||
    !cell(h.CellTo) ||
    header.sourceTag !== "PlayerStep" ||
    !integer(header.sourceIndex, 1) ||
    !integer(e.sourceIndex, 1) ||
    header.id !== `source-${header.sourceIndex}` ||
    e.id !== `source-${e.sourceIndex}` ||
    !header.sequenceId ||
    header.sequenceId !== e.sequenceId ||
    !header.actionId ||
    header.actionId !== e.actionId ||
    !integer(from?.replayStep, 1) ||
    !integer(from?.childIndex) ||
    from?.stepIndex !== 0 ||
    from.messageIndex !== undefined ||
    at?.replayStep !== from.replayStep ||
    at?.childIndex !== from.childIndex ||
    at?.stepIndex !== 0 ||
    !integer(at?.messageIndex) ||
    e.sourceIndex !== header.sourceIndex + at.messageIndex + 1 ||
    [header, e].some(
      (r) =>
        r.attributionConflict ||
        r.stepTag !== "PlayerStep" ||
        r.stepType !== 0 ||
        r.playerId !== String(p.PlayerId) ||
        r.stepActorId !== String(p.PlayerId) ||
        r.targetId !== String(h.TargetId) ||
        r.stepTargetId !== String(h.TargetId)
    )
  )
    return;
  return String(p.PlayerId);
}
