// Source-specific identity evidence, not a probability/eligibility contract.
// A Pass budget and the executed Throw Team-mate step are different records.
export type ThrowTeamMateRoleEvidence = {
  variant: "typed_thrower_and_mate";
  throwerId: string;
  thrownMateId: string;
  headerSourceId: string;
  headerSourceIndex: number;
  state: 1 | 3;
  headerCellFrom: { x: number; y: number };
  role: "header" | "thrower" | "skill_holder";
  holderId?: string;
  skillId?: number;
  used?: boolean;
};
type ObjectRecord = Record<string, unknown>;
const object = (v: unknown): ObjectRecord | undefined =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as ObjectRecord)
    : undefined;
const integer = (v: unknown, min = 0, max = 1_000_000): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
const fields = (p: ObjectRecord, names: readonly string[]) =>
  Object.keys(p).every((k) => names.includes(k));
function cell(v: unknown, end: boolean) {
  const p = object(v);
  return (
    !!p &&
    fields(p, ["X", "Y"]) &&
    integer(p.X, end ? -1 : 0, end ? 26 : 25) &&
    integer(p.Y, end ? -1 : 0, end ? 15 : 14)
  );
}
export function readThrowTeamMateHeader(
  tag: string,
  p: ObjectRecord,
  version: string | undefined,
  sourceIndex: number
): ThrowTeamMateRoleEvidence | undefined {
  if (
    version !== "1-4-0-0" ||
    tag !== "ThrowTeamMateStep" ||
    !integer(sourceIndex, 1) ||
    p.StepType !== 13 ||
    p.IsEvaluation !== 0 ||
    (p.State !== 1 && p.State !== 3) ||
    !fields(p, [
      "Probability",
      "IsEvaluation",
      "StepType",
      "ThrowerId",
      "ThrownMateId",
      "CellTo",
      "CellFrom",
      "State",
      "Skill"
    ]) ||
    !integer(p.ThrowerId) ||
    !integer(p.ThrownMateId) ||
    p.ThrowerId === p.ThrownMateId ||
    (p.Skill !== undefined && p.Skill !== 0) ||
    (p.Probability !== undefined &&
      (typeof p.Probability !== "number" ||
        !Number.isFinite(p.Probability) ||
        p.Probability < 0 ||
        p.Probability > 100)) ||
    !cell(p.CellFrom, false) ||
    !cell(p.CellTo, true)
  )
    return;
  return {
    variant: "typed_thrower_and_mate",
    throwerId: String(p.ThrowerId),
    thrownMateId: String(p.ThrownMateId),
    headerSourceId: `source-${sourceIndex}`,
    headerSourceIndex: sourceIndex,
    state: p.State,
    headerCellFrom: {
      x: (p.CellFrom as ObjectRecord).X as number,
      y: (p.CellFrom as ObjectRecord).Y as number
    },
    role: "header"
  };
}
const rollFields = [
  "Status",
  "Requirement",
  "Difficulty",
  "Modifiers",
  "Dice",
  "Source",
  "RollType",
  "Outcome",
  "NewRoll",
  "PlayerId",
  "TargetId"
] as const;
function knownRollShape(p: ObjectRecord): boolean {
  if (!fields(p, rollFields)) return false;
  for (const [k, v] of Object.entries(p)) {
    if (k !== "Dice" && k !== "Modifiers" && typeof v === "object")
      return false;
  }
  if (p.Dice !== undefined) {
    const ds = object(p.Dice);
    if (!ds || !fields(ds, ["Die"])) return false;
    const dice = Array.isArray(ds.Die) ? ds.Die : [ds.Die];
    if (
      !dice.length ||
      !dice.every((d) => {
        const die = object(d);
        return (
          die &&
          fields(die, ["DieType", "Value"]) &&
          integer(die.DieType) &&
          integer(die.Value)
        );
      })
    )
      return false;
  }
  if (p.Modifiers !== undefined && p.Modifiers !== "") {
    const ms = object(p.Modifiers);
    if (!ms || !fields(ms, ["Modifier"])) return false;
    const mods = Array.isArray(ms.Modifier) ? ms.Modifier : [ms.Modifier];
    if (
      !mods.every((m) => {
        const x = object(m);
        return (
          x &&
          fields(x, ["PlayerId", "Skill", "Effect", "Value", "ModifierType"]) &&
          Object.values(x).every((v) => typeof v !== "object")
        );
      })
    )
      return false;
  }
  return true;
}
export function readThrowTeamMateMessage(
  header: ThrowTeamMateRoleEvidence | undefined,
  tag: string,
  p: ObjectRecord
): ThrowTeamMateRoleEvidence | undefined {
  if (!header) return;
  if (tag === "ResultSkillUsage") {
    if (
      !fields(p, ["PlayerId", "Skill", "Used"]) ||
      !integer(p.PlayerId) ||
      !integer(p.Skill) ||
      (p.Used !== 0 && p.Used !== 1)
    )
      return;
    return {
      ...header,
      role: "skill_holder",
      holderId: String(p.PlayerId),
      skillId: p.Skill,
      used: p.Used === 1
    };
  }
  if (tag === "ResultTeamRerollUsage") {
    if (
      !fields(p, ["GamerId", "Used"]) ||
      Object.values(p).some((v) => typeof v === "object")
    )
      return;
  } else if (tag === "QuestionTeamRerollUsage") {
    if (
      !fields(p, [
        "GamerId",
        "CanUseTeamReroll",
        "CanUseProReroll",
        "StarSpecialRule",
        "RollInfos"
      ]) ||
      Object.entries(p).some(
        ([k, v]) => k !== "RollInfos" && typeof v === "object"
      ) ||
      object(p.RollInfos)?.RollType !== 41 ||
      !knownRollShape(object(p.RollInfos)!) ||
      (object(p.RollInfos)?.PlayerId !== undefined &&
        (!integer(object(p.RollInfos)!.PlayerId) ||
          String(object(p.RollInfos)!.PlayerId) !== header.throwerId)) ||
      (object(p.RollInfos)?.TargetId !== undefined &&
        (!integer(object(p.RollInfos)!.TargetId) ||
          String(object(p.RollInfos)!.TargetId) !== header.thrownMateId))
    )
      return;
  } else if (tag === "ResultRoll") {
    if (
      p.Dice === undefined ||
      !integer(p.RollType) ||
      ![26, 41, 43, 71].includes(p.RollType) ||
      !knownRollShape(p) ||
      (p.PlayerId !== undefined &&
        (!integer(p.PlayerId) || String(p.PlayerId) !== header.throwerId)) ||
      (p.TargetId !== undefined &&
        (!integer(p.TargetId) || String(p.TargetId) !== header.thrownMateId))
    )
      return;
  } else return;
  return { ...header, role: "thrower" };
}

// Recheck derived annotations for domain callers that supply partial models.
// The original payload and ordered source graph remain authoritative. This
// also prevents stale typed roles surviving a changed or unindexed header.
export function canonicalizeThrowTeamMateParticipants(
  replay: import("./types").ReplayModel
): import("./types").ReplayModel {
  const events = replay.turns.flatMap((t) => t.events);
  if (
    !events.some(
      (e) =>
        e.stepTag === "ThrowTeamMateStep" || e.sourceTag === "ThrowTeamMateStep"
    )
  )
    return replay;
  const headers = new Map<string, import("./types").ReplayEvent | null>();
  for (const e of events)
    if (e.sourceTag === "ThrowTeamMateStep" && e.actionId) {
      headers.set(e.actionId, headers.has(e.actionId) ? null : e);
    }
  return {
    ...replay,
    turns: replay.turns.map((turn) => ({
      ...turn,
      events: turn.events.map((e) => {
        if (
          e.stepTag !== "ThrowTeamMateStep" &&
          e.sourceTag !== "ThrowTeamMateStep"
        )
          return e;
        const h = e.actionId ? headers.get(e.actionId) : undefined;
        let header =
          h?.payload &&
          h.sourceIndex !== undefined &&
          h.id === `source-${h.sourceIndex}` &&
          h.sequenceId &&
          h.locator?.stepIndex !== undefined
            ? readThrowTeamMateHeader(
                h.sourceTag,
                h.payload,
                replay.replayVersion,
                h.sourceIndex
              )
            : undefined;
        if (
          h !== e &&
          (!h ||
            e.sequenceId !== h.sequenceId ||
            e.locator?.replayStep !== h.locator?.replayStep ||
            e.locator?.childIndex !== h.locator?.childIndex ||
            e.locator?.stepIndex !== h.locator?.stepIndex ||
            e.locator?.messageIndex === undefined ||
            e.sourceIndex !== h.sourceIndex! + e.locator.messageIndex + 1 ||
            e.id !== `source-${e.sourceIndex}`)
        )
          header = undefined;
        const role =
          h === e
            ? header
            : readThrowTeamMateMessage(header, e.sourceTag, e.payload ?? {});
        const explicit = (v: unknown, min = 0) =>
          integer(v, min) ? String(v) : undefined;
        const player = role
          ? (role.holderId ?? role.throwerId)
          : e.sourceTag === "ThrowTeamMateStep"
            ? undefined
            : explicit(e.payload?.PlayerId ?? e.payload?.PushedPlayerId);
        const target = role
          ? role.thrownMateId
          : e.sourceTag === "ThrowTeamMateStep"
            ? undefined
            : explicit(e.payload?.TargetId, -1);
        return {
          ...e,
          playerId: player,
          targetId: target,
          stepActorId: role?.throwerId,
          stepTargetId: role?.thrownMateId,
          throwTeamMate: role,
          ...(player !== e.playerId && e.actorTeamSource !== "explicit"
            ? { actorTeamId: undefined, actorTeamSource: undefined }
            : {})
        };
      })
    }))
  };
}
