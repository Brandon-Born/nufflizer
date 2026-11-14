import type { ReplayEvent, ReplayModel } from "@/domain/replay/types";
import type {
  OwnershipTimeline,
  OwnershipProof
} from "@/domain/replay/ownershipTimeline";
import {
  lastBoardCheckpointBefore,
  type ReplayBoardCheckpoint
} from "@/domain/replay/boardState";
import { isInertReplayControl } from "@/domain/replay/inertControls";
import { staffInjuryRoll } from "./initialInjurySources";
import type { LuckEvent, LuckReport } from "./types";

type Treatment = NonNullable<LuckEvent["metadata"]["recordedTreatment"]>;
type Control = NonNullable<LuckEvent["metadata"]["treatmentControl"]>;
type Aftermath = NonNullable<LuckEvent["metadata"]["treatmentAftermath"]>;
const fields = (p: Record<string, unknown> | undefined, keys: string[]) =>
  !!p && Object.keys(p).every((k) => keys.includes(k));
const integer = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
const controlInteger = (v: unknown): number | undefined => {
  if (typeof v === "string" && /^(0|[1-9]\d{0,15})$/.test(v)) v = Number(v);
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0
    ? v
    : undefined;
};
const gamer = (v: unknown): 0 | 1 | null =>
  controlInteger(v) === 0 ? 0 : controlInteger(v) === 1 ? 1 : null;
const controlTags = {
  gamer: "EventActiveGamerChanged",
  end: "EventEndTurn",
  pause: "EventPauseActiveTimer",
  timer: "EventActiveTimerChanged",
  standby: "EventRulesEngineStandBy"
} as const;
function readControl(e: ReplayEvent): Control | undefined {
  if (e.attributionConflict || e.actionId || e.stepType !== undefined) return;
  const p = e.payload;
  if (
    e.sourceTag === "EventActiveGamerChanged" &&
    fields(p, ["NewActiveGamer"]) &&
    (p!.NewActiveGamer === undefined || gamer(p!.NewActiveGamer) !== null)
  )
    return {
      kind: "gamer",
      gamerId: gamer(p!.NewActiveGamer),
      recordedGamer: gamer(p!.NewActiveGamer) !== null
    };
  if (
    e.sourceTag === "EventEndTurn" &&
    fields(p, ["Reason", "NextPlayingGamer"]) &&
    controlInteger(p!.Reason) === 2 &&
    (p!.NextPlayingGamer === undefined || gamer(p!.NextPlayingGamer) !== null)
  )
    return {
      kind: "end",
      reason: 2,
      gamerId: gamer(p!.NextPlayingGamer),
      recordedGamer: gamer(p!.NextPlayingGamer) !== null
    };
  if (
    e.sourceTag === "EventRulesEngineStandBy" &&
    fields(p, ["Phase", "ActiveGamer"]) &&
    controlInteger(p!.Phase) === 5 &&
    (p!.ActiveGamer === undefined || gamer(p!.ActiveGamer) !== null)
  )
    return {
      kind: "standby",
      phase: 5,
      gamerId: gamer(p!.ActiveGamer),
      recordedGamer: gamer(p!.ActiveGamer) !== null
    };
  if (e.sourceTag === "EventPauseActiveTimer" && isInertReplayControl(e))
    return { kind: "pause" };
  if (e.sourceTag === "EventActiveTimerChanged" && isInertReplayControl(e)) {
    const t = p!.NewTimer as Record<string, unknown>;
    if (controlInteger(t.Type) !== 1) return;
    return {
      kind: "timer",
      duration: Number(t.Duration),
      timerType: 1,
      value: Number(t.Value),
      team: gamer(t.Team),
      isPaused: gamer(p!.IsPaused),
      recordedFlags: {
        team: gamer(t.Team) !== null,
        isPaused: gamer(p!.IsPaused) !== null
      }
    };
  }
}
// Controller omissions remain null. The bridge certifies ordered observations,
// never a legal turn transition, reset, eligibility or available activation.
function supportedBridge(
  controls: readonly Control[],
  observedGamer: 0 | 1 | null
) {
  const kinds = controls.map((c) => c.kind).join();
  if (
    !["gamer,pause,timer,standby", "end,gamer,pause,timer,standby"].includes(
      kinds
    )
  )
    return false;
  const known = controls.flatMap((c) =>
    c.kind === "gamer" || c.kind === "end" || c.kind === "standby"
      ? c.gamerId === null
        ? []
        : [c.gamerId]
      : c.kind === "timer" && c.team !== null
        ? [c.team]
        : []
  );
  if (observedGamer !== null) known.push(observedGamer);
  return new Set(known).size <= 1;
}
function firstCheckpoint(
  checkpoints: readonly ReplayBoardCheckpoint[],
  index: number
) {
  let low = 0,
    high = checkpoints.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (checkpoints[mid]!.afterSourceIndex < index) low = mid + 1;
    else high = mid;
  }
  return checkpoints[low];
}

function ownedDamage(
  e: ReplayEvent,
  step: ReplayEvent | undefined,
  owners: OwnershipTimeline,
  states: readonly number[]
) {
  if (
    !e.id ||
    !e.playerId ||
    !e.actionId ||
    !e.sequenceId ||
    e.sourceIndex === undefined ||
    !step ||
    step.sourceIndex === undefined ||
    step.sourceIndex >= e.sourceIndex ||
    step.sequenceId !== e.sequenceId
  )
    return;
  const h = step.payload,
    owner = owners.resolve(e.playerId, e);
  if (
    owner.status !== "confirmed" ||
    e.actorTeamId !== owner.proof.teamId ||
    step.actorTeamId !== owner.proof.teamId ||
    [e, step].some(
      (x) =>
        x.attributionConflict ||
        x.actorTeamSource === "turn_inferred" ||
        x.stepType !== 2 ||
        x.stepTag !== "DamageStep" ||
        x.playerId !== e.playerId ||
        x.targetId !== e.playerId ||
        x.stepActorId !== e.playerId ||
        x.stepTargetId !== e.playerId ||
        x.damageSource !== e.damageSource ||
        (x.teamId && x.teamId !== owner.proof.teamId)
    ) ||
    !fields(h, [
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
    h!.Applied !== 1 ||
    h!.IsEvaluation !== 0 ||
    h!.Skill !== 0 ||
    h!.StepType !== 2 ||
    typeof h!.State !== "number" ||
    !states.includes(h!.State) ||
    !integer(h!.Source, 0, 64) ||
    h!.Source !== e.damageSource
  )
    return;
  return { ownership: owner.proof, step };
}

export function findTreatmentEvidence(
  replay: ReplayModel,
  owners: OwnershipTimeline
) {
  const records = new Map<
      string,
      { observation: Treatment; ownership: OwnershipProof }
    >(),
    controls = new Map<string, Control>(),
    aftermath = new Map<string, Aftermath>(),
    initialOriginalIds = new Set<string>();
  if (replay.replayVersion !== "1-4-0-0")
    return { records, controls, aftermath, initialOriginalIds };
  const rawById = new Map<string, ReplayEvent>();
  for (const turn of replay.turns) {
    const headers = new Map<string, ReplayEvent>(),
      ambiguous = new Set<string>();
    for (const e of turn.events)
      if (e.sourceTag === "DamageStep" && e.actionId) {
        if (headers.has(e.actionId)) ambiguous.add(e.actionId);
        headers.set(e.actionId, e);
      }
    for (const e of turn.events) {
      if (!e.id || !e.actionId || ambiguous.has(e.actionId)) continue;
      const step = headers.get(e.actionId);
      const initial = staffInjuryRoll(e);
      if (
        initial &&
        initial.roll.Source === e.damageSource &&
        ownedDamage(e, step, owners, [1, 2, 3])
      )
        initialOriginalIds.add(e.id);
      if (e.sourceTag !== "ResultApothecary") continue;
      const p = e.payload,
        context = ownedDamage(e, step, owners, p?.IsInjury === 1 ? [2] : [3]);
      if (
        !context ||
        !fields(p, [
          "PlayerStatus",
          "ApothecaryUsed",
          "Casualty",
          "IsInjury"
        ]) ||
        !integer(p!.IsInjury, 0, 1) ||
        !integer(p!.ApothecaryUsed, 0, 1) ||
        !integer(p!.Casualty, 0, 10) ||
        !integer(p!.PlayerStatus, 0, 10)
      )
        continue;
      records.set(e.id, {
        observation: {
          stage: p!.IsInjury === 1 ? "initial_injury" : "casualty",
          wireIsInjury: p!.IsInjury as 0 | 1,
          resourceSpent: p!.ApothecaryUsed as 0 | 1,
          appliedOutcomeCode: Number(p!.Casualty),
          playerStatusCode: Number(p!.PlayerStatus),
          subjectId: e.playerId!,
          subjectTeamId: context.ownership.teamId,
          sourceCode: Number(context.step.payload!.Source),
          damageStepSourceIndex: context.step.sourceIndex!
        },
        ownership: context.ownership
      });
      rawById.set(e.id, e);
    }
  }
  if (!records.size)
    return { records, controls, aftermath, initialOriginalIds };
  const all = replay.turns.flatMap((t) => t.events),
    indices = new Map(all.map((e, i) => [e.id, i])),
    checkpoints = replay.boardCheckpoints ?? [],
    teamIds = new Set(replay.teams.map((t) => t.id));
  for (const [id, record] of records) {
    const raw = rawById.get(id)!,
      index = raw.sourceIndex!,
      before = lastBoardCheckpointBefore(checkpoints, index),
      after = firstCheckpoint(checkpoints, index);
    if (
      before?.status !== "observed" ||
      before.board?.phaseCode !== 5 ||
      after?.status !== "observed" ||
      after.board?.phaseCode !== 5 ||
      after.board.stable !== true ||
      after.replayStep !== raw.locator?.replayStep ||
      raw.locator?.childIndex === undefined ||
      after.childIndex === null ||
      after.childIndex === undefined ||
      after.afterSourceIndex <= index ||
      after.afterSourceIndex > index + 5
    )
      continue;
    if (
      after.board.activeGamerId !== null &&
      !integer(after.board.activeGamerId, 0, 1)
    )
      continue;
    const count = after.afterSourceIndex - index,
      globalIndex = indices.get(id)!,
      gap = all.slice(globalIndex + 1, globalIndex + count + 1);
    if (
      gap.length !== count ||
      gap.some(
        (e, i) =>
          !e.id ||
          e.sourceIndex !== index + i + 1 ||
          e.locator?.replayStep !== after.replayStep ||
          e.locator?.childIndex !== raw.locator!.childIndex! + i + 1 ||
          e.actionId ||
          e.stepType !== undefined
      ) ||
      after.childIndex !== raw.locator.childIndex + count + 1
    )
      continue;
    const parsed = gap.map(readControl);
    if (
      parsed.some((c) => !c) ||
      !supportedBridge(parsed as Control[], gamer(after.board.activeGamerId))
    )
      continue;
    const members = (board: NonNullable<typeof before.board>) =>
      board.teams.flatMap((t) =>
        t.players
          .filter((p) => String(p.id) === raw.playerId)
          .map((p) => ({ t, p }))
      );
    const a = members(before.board),
      b = members(after.board),
      team = record.observation.subjectTeamId;
    const compatible = (
      board: NonNullable<typeof before.board>,
      slot: number
    ) => {
      if (board.teams.length !== 2 || ![0, 1].includes(slot)) return false;
      const own = board.teams.find((t) => t.rosterIndex === slot),
        other = board.teams.find((t) => t.rosterIndex === 1 - slot);
      if (!own || !other) return false;
      if (
        [own, other].some(
          (t) =>
            t.explicitTeamId !== null && !teamIds.has(String(t.explicitTeamId))
        )
      )
        return false;
      return own.explicitTeamId === null
        ? other.explicitTeamId !== null && String(other.explicitTeamId) !== team
        : String(own.explicitTeamId) === team &&
            (other.explicitTeamId === null ||
              other.explicitTeamId !== own.explicitTeamId);
    };
    if (
      a.length !== 1 ||
      b.length !== 1 ||
      a[0]!.t.rosterIndex !== b[0]!.t.rosterIndex ||
      !compatible(before.board, a[0]!.t.rosterIndex) ||
      !compatible(after.board, b[0]!.t.rosterIndex) ||
      [...a, ...b].some(
        ({ p }) =>
          (p.traitsDataPlayerId != null &&
            String(p.traitsDataPlayerId) !== raw.playerId) ||
          (p.traitsDataTeamId != null && String(p.traitsDataTeamId) !== team) ||
          (p.traitsDataPresent && p.traitsDataPlayerId == null)
      ) ||
      (a[0]!.p.traitsPlayerTypeId != null &&
        b[0]!.p.traitsPlayerTypeId != null &&
        a[0]!.p.traitsPlayerTypeId !== b[0]!.p.traitsPlayerTypeId)
    )
      continue;
    const p = b[0]!.p,
      status = record.observation.playerStatusCode,
      situation = status === 0 ? 1 : [4, 5].includes(status) ? 4 : undefined;
    if (
      situation === undefined ||
      p.pitchLocation !== "off_pitch" ||
      p.cell.x !== -1 ||
      p.cell.y !== -1 ||
      p.situationCode !== situation ||
      (p.statusCode !== null && p.statusCode !== status)
    )
      continue;
    aftermath.set(id, {
      beforeCheckpointAfter: before.afterSourceIndex,
      checkpointAfter: after.afterSourceIndex,
      replayStep: after.replayStep!,
      childIndex: after.childIndex,
      rosterIndex: b[0]!.t.rosterIndex as 0 | 1,
      controlSourceIds: gap.map((e) => e.id!),
      observedActiveGamerId: gamer(after.board.activeGamerId),
      recordedFlags: {
        status: p.statusCode !== null,
        canAct: p.canAct !== null,
        tackleZone: p.tackleZone !== null
      },
      observation: {
        cell: { x: -1, y: -1 },
        situationCode: situation,
        statusCode: p.statusCode,
        canAct: p.canAct,
        tackleZone: p.tackleZone
      }
    });
    gap.forEach((e, i) => controls.set(e.id!, parsed[i]!));
  }
  return { records, controls, aftermath, initialOriginalIds };
}

export function validReportedTreatmentControl(e: LuckEvent) {
  const c = e.metadata.treatmentControl;
  if (!c) return true;
  return (
    e.metadata.sourceTag === controlTags[c.kind] &&
    ("gamerId" in c
      ? c.recordedGamer === (c.gamerId !== null)
      : c.kind === "timer"
        ? c.recordedFlags.team === (c.team !== null) &&
          c.recordedFlags.isPaused === (c.isPaused !== null)
        : true) &&
    !e.metadata.actionId &&
    e.metadata.stepType === undefined &&
    e.metadata.locator?.stepIndex === undefined &&
    e.metadata.locator?.messageIndex === undefined &&
    e.scoringStatus === "excluded" &&
    e.metadata.isRollCandidate === false &&
    e.probabilitySuccess === null &&
    e.actualSuccess === null &&
    e.delta === 0 &&
    e.weightedDelta === 0 &&
    e.explainability.weight === 0 &&
    !e.contextualImpact &&
    !e.contextualBounds &&
    !e.possessionBounds &&
    !e.catchPossessionBounds
  );
}
export function validReportedTreatment(
  e: LuckEvent,
  sources: ReadonlyMap<string, LuckEvent>,
  report: LuckReport
) {
  const r = e.metadata.recordedTreatment,
    a = e.metadata.treatmentAftermath;
  if (!r) return !a;
  const m = e.metadata,
    index = m.sourceIndex,
    owner = m.ownership;
  if (
    m.sourceTag !== "ResultApothecary" ||
    r.stage !== (r.wireIsInjury === 1 ? "initial_injury" : "casualty") ||
    e.type !== "injury" ||
    e.scoringStatus !== "excluded" ||
    m.isRollCandidate !== false ||
    e.probabilitySuccess !== null ||
    e.actualSuccess !== null ||
    e.delta !== 0 ||
    e.weightedDelta !== 0 ||
    e.explainability.weight !== 0 ||
    !owner ||
    owner.role !== "subject" ||
    owner.playerId !== e.playerId ||
    owner.teamId !== e.teamId ||
    r.subjectId !== e.playerId ||
    r.subjectTeamId !== e.teamId ||
    m.targetId !== e.playerId ||
    m.stepType !== 2 ||
    !m.actionId ||
    !m.sequenceId ||
    index === undefined ||
    r.damageStepSourceIndex >= index ||
    m.dice?.length !== 0 ||
    m.dieTypes?.length !== 0 ||
    m.modifiers?.length !== 0 ||
    m.modifiersSum !== 0 ||
    m.rollType !== undefined ||
    e.contextualImpact ||
    e.contextualBounds ||
    e.possessionBounds ||
    e.catchPossessionBounds
  )
    return false;
  const selection = m.apothecary;
  if (
    selection &&
    (r.resourceSpent !== selection.resourceSpent ||
      r.appliedOutcomeCode !== selection.appliedCasualty ||
      r.playerStatusCode !== selection.playerStatus ||
      r.stage !==
        (["injury_treatment", "injury_original"].includes(selection.applied)
          ? "initial_injury"
          : "casualty"))
  )
    return false;
  if (selection?.treatmentSppSourceId) {
    const spp = sources.get(selection.treatmentSppSourceId);
    if (!spp?.metadata.treatmentSpp || !validReportedTreatmentSpp(spp, sources))
      return false;
  }
  if (!a) return true;
  const snapshots = report.rerollResources.flow.clockSnapshots;
  const next = snapshots.find((s) => s.source.checkpointAfter >= index),
    previous = [...snapshots]
      .reverse()
      .find((s) => s.source.checkpointAfter < index);
  if (!next?.clock || !previous?.clock) return false;
  if (
    !next ||
    !previous ||
    previous.source.checkpointAfter !== a.beforeCheckpointAfter ||
    next.source.checkpointAfter !== a.checkpointAfter ||
    next.source.kind !== "board" ||
    next.source.replayStep !== a.replayStep ||
    next.source.childIndex !== a.childIndex ||
    next.clock.phaseCode !== 5 ||
    previous.clock.phaseCode !== 5 ||
    next.clock.activeGamerId !== a.observedActiveGamerId ||
    a.replayStep !== m.locator?.replayStep ||
    m.locator?.childIndex === undefined ||
    a.beforeCheckpointAfter >= index ||
    a.checkpointAfter <= index ||
    a.checkpointAfter > report.coverage.sourceRecordCount ||
    a.checkpointAfter !== index + a.controlSourceIds.length ||
    a.childIndex !== m.locator.childIndex + a.controlSourceIds.length + 1
  )
    return false;
  const id = Number(e.playerId),
    slot = a.rosterIndex,
    team = e.teamId;
  const roster = (s: typeof next) =>
    s.identityStructureObserved &&
    s.rosterCount === 2 &&
    s.playerIds.flat().filter((p) => p === id).length === 1 &&
    s.playerIds[slot]?.includes(id) &&
    (s.explicitTeamIds[slot] === null
      ? s.explicitTeamIds[1 - slot] !== null &&
        String(s.explicitTeamIds[1 - slot]) !== team
      : String(s.explicitTeamIds[slot]) === team &&
        (s.explicitTeamIds[1 - slot] === null ||
          s.explicitTeamIds[1 - slot] !== s.explicitTeamIds[slot]));
  if (!roster(previous) || !roster(next)) return false;
  const gap = a.controlSourceIds.map((id) => sources.get(id));
  if (
    new Set(a.controlSourceIds).size !== gap.length ||
    gap.some(
      (e, i) =>
        !e ||
        !e.metadata.treatmentControl ||
        !validReportedTreatmentControl(e) ||
        e.metadata.sourceIndex !== index + i + 1 ||
        e.metadata.locator?.replayStep !== a.replayStep ||
        e.metadata.locator?.childIndex !== m.locator!.childIndex! + i + 1
    ) ||
    !supportedBridge(
      gap.map((e) => e!.metadata.treatmentControl!),
      a.observedActiveGamerId
    )
  )
    return false;
  const situation =
    r.playerStatusCode === 0
      ? 1
      : [4, 5].includes(r.playerStatusCode)
        ? 4
        : undefined;
  return (
    situation !== undefined &&
    a.recordedFlags.status === (a.observation.statusCode !== null) &&
    a.recordedFlags.canAct === (a.observation.canAct !== null) &&
    a.recordedFlags.tackleZone === (a.observation.tackleZone !== null) &&
    a.observation.situationCode === situation &&
    (a.observation.statusCode === null ||
      a.observation.statusCode === r.playerStatusCode)
  );
}

export function validReportedTreatmentSpp(
  e: LuckEvent,
  sources: ReadonlyMap<string, LuckEvent>
) {
  const s = e.metadata.treatmentSpp;
  if (!s) return true;
  const result = sources.get(s.treatmentSourceId),
    r = result?.metadata.recordedTreatment,
    selection = result?.metadata.apothecary,
    original = sources.get(s.originalSourceId),
    index = e.metadata.sourceIndex;
  return (
    !!result &&
    !!r &&
    !!selection &&
    r.stage === "initial_injury" &&
    r.sourceCode === 1 &&
    ["injury_original", "injury_treatment"].includes(selection.applied) &&
    selection.treatmentSppSourceId === e.metadata.sourceId &&
    selection.originalSourceId === s.originalSourceId &&
    original?.metadata.sourceTag === "QuestionApothecaryCasualtyUsage" &&
    original.metadata.rollType === 11 &&
    original.metadata.outcomeCode === 1 &&
    e.metadata.sourceTag === "ResultGainSpp" &&
    e.type === "unknown" &&
    e.metadata.isRollCandidate === false &&
    e.scoringStatus === "excluded" &&
    e.probabilitySuccess === null &&
    e.actualSuccess === null &&
    e.delta === 0 &&
    e.weightedDelta === 0 &&
    e.explainability.weight === 0 &&
    e.metadata.ownership?.role === "actor" &&
    e.metadata.ownership.playerId === e.playerId &&
    e.metadata.ownership.teamId === e.teamId &&
    e.teamId !== result.teamId &&
    e.playerId !== result.playerId &&
    e.metadata.targetId === result.playerId &&
    e.metadata.stepType === 2 &&
    e.metadata.actionId === result.metadata.actionId &&
    e.metadata.sequenceId === result.metadata.sequenceId &&
    index !== undefined &&
    index === r.damageStepSourceIndex + 1 &&
    index < result.metadata.sourceIndex! &&
    (original.metadata.sourceIndex ?? Infinity) < r.damageStepSourceIndex &&
    !e.contextualImpact &&
    !e.contextualBounds &&
    !e.possessionBounds &&
    !e.catchPossessionBounds &&
    !e.metadata.recordedSpp
  );
}
