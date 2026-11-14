import type { LuckEvent, LuckReport } from "./types";

// Validate the exported source graph; this is not authentication of unavailable
// raw XML, an odds model, or a proof that the recorded action was legal.
export function validReportedThrowTeamMate(
  e: LuckEvent,
  sources: ReadonlyMap<string, LuckEvent>,
  report: LuckReport
) {
  const m = e.metadata,
    p = m.throwTeamMate;
  if (!p) return !(m.stepType === 13 && (m.lonerGate || m.teamDiceIdentity));
  const header = sources.get(p.headerSourceId),
    h = header?.metadata.throwTeamMate;
  if (
    !header ||
    !h ||
    h.role !== "header" ||
    header.metadata.sourceTag !== "ThrowTeamMateStep" ||
    m.stepType !== 13 ||
    header.metadata.stepType !== 13 ||
    !m.actionId ||
    !m.sequenceId ||
    m.actionId !== header.metadata.actionId ||
    m.sequenceId !== header.metadata.sequenceId ||
    m.sourceIndex === undefined ||
    p.headerSourceIndex < 1 ||
    p.headerSourceIndex > report.coverage.sourceRecordCount ||
    header.metadata.sourceIndex !== p.headerSourceIndex ||
    h.headerSourceIndex !== p.headerSourceIndex ||
    h.headerSourceId !== p.headerSourceId ||
    p.headerSourceId !== `source-${p.headerSourceIndex}` ||
    p.throwerId === p.thrownMateId ||
    h.throwerId !== p.throwerId ||
    h.thrownMateId !== p.thrownMateId ||
    h.state !== p.state ||
    h.headerCellFrom.x !== p.headerCellFrom.x ||
    h.headerCellFrom.y !== p.headerCellFrom.y ||
    m.targetId !== p.thrownMateId ||
    e.scoringStatus !== "excluded" ||
    e.probabilitySuccess !== null ||
    e.delta !== 0 ||
    e.weightedDelta !== 0 ||
    e.explainability.weight !== 0 ||
    e.contextualImpact ||
    e.contextualBounds ||
    e.possessionBounds ||
    e.catchPossessionBounds
  )
    return false;
  if (
    e.teamId !== "unresolved" &&
    (!m.ownership ||
      m.ownership.role !== "actor" ||
      m.ownership.playerId !== e.playerId ||
      m.ownership.teamId !== e.teamId)
  )
    return false;
  if (
    p.role !== "skill_holder" &&
    (p.holderId !== undefined ||
      p.skillId !== undefined ||
      p.used !== undefined)
  )
    return false;
  if (p.role === "header")
    return (
      m.sourceTag === "ThrowTeamMateStep" &&
      m.sourceId === p.headerSourceId &&
      m.sourceIndex === p.headerSourceIndex &&
      m.locator?.messageIndex === undefined &&
      e.playerId === p.throwerId &&
      e.type === "unknown" &&
      m.isRollCandidate === false &&
      e.actualSuccess === null &&
      m.dice?.length === 0 &&
      m.dieTypes?.length === 0
    );
  if (
    m.locator?.messageIndex === undefined ||
    m.sourceIndex !== p.headerSourceIndex + m.locator.messageIndex + 1 ||
    m.locator.replayStep !== header.metadata.locator?.replayStep ||
    m.locator.childIndex !== header.metadata.locator?.childIndex ||
    m.locator.stepIndex !== header.metadata.locator?.stepIndex
  )
    return false;
  if (p.role === "skill_holder")
    return (
      m.sourceTag === "ResultSkillUsage" &&
      p.holderId === e.playerId &&
      p.skillId !== undefined &&
      p.used !== undefined &&
      m.skillUsage?.skillId === p.skillId &&
      m.skillUsage.used === p.used &&
      e.type === "unknown" &&
      m.isRollCandidate === false &&
      e.actualSuccess === null &&
      m.dice?.length === 0 &&
      m.dieTypes?.length === 0
    );
  if (
    e.playerId !== p.throwerId ||
    (e.teamId !== "unresolved" &&
      header.teamId !== "unresolved" &&
      e.teamId !== header.teamId)
  )
    return false;
  if (m.sourceTag === "ResultTeamRerollUsage")
    return m.isRollCandidate === false && !!m.recordedRerollChoice;
  if (m.sourceTag !== "ResultRoll" && m.sourceTag !== "QuestionTeamRerollUsage")
    return false;
  if (
    m.sourceTag === "ResultRoll" &&
    ![26, 41, 43, 71].includes(m.rollType ?? -1)
  )
    return false;
  if (
    m.sourceTag === "QuestionTeamRerollUsage" &&
    (m.recordedRerollOffer?.rollType !== 41 ||
      (m.rollType !== undefined && m.rollType !== 41))
  )
    return false;
  const path = m.sourceTag === "ResultRoll" ? "Dice" : "RollInfos,Dice";
  const dice = report.diceRecords.filter(
    (d) => d.parentSourceId === m.sourceId && d.parentKind === "event"
  );
  if (m.sourceTag === "QuestionTeamRerollUsage" && dice.length === 0)
    return m.isRollCandidate === false;
  return (
    dice.length === 1 &&
    dice[0]!.path.join() === path &&
    dice[0]!.stepType === 13 &&
    dice[0]!.stepTag === "ThrowTeamMateStep" &&
    dice[0]!.stepActorId === p.throwerId &&
    dice[0]!.stepTargetId === p.thrownMateId &&
    dice[0]!.rollType ===
      (m.sourceTag === "QuestionTeamRerollUsage"
        ? m.recordedRerollOffer?.rollType
        : m.rollType) &&
    dice[0]!.actionId === m.actionId
  );
}
