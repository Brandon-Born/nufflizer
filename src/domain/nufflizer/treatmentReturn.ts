import type { ReplayModel } from "@/domain/replay/types";
import type { OwnershipTimeline } from "@/domain/replay/ownershipTimeline";
import type { LuckEvent, LuckReport } from "./types";
import type { findTreatmentEvidence } from "./treatmentAftermath";
import {
  findReservesReturns,
  validReservesSnapshot,
  isReturnSnapshotAfter,
  isReturnSnapshotAtOrAfter,
  type ReservesReturnSeed
} from "./reservesReturn";

type Trace = NonNullable<LuckEvent["metadata"]["treatmentReturn"]>;
type Snapshot = Extract<Trace, { status: "observed" }>["setup"];
function recorded(s: Omit<Snapshot, "recordedFlags">): Snapshot {
  return {
    ...s,
    recordedFlags: {
      status: s.statusCode !== null,
      situation: s.situationCode !== null,
      canAct: s.canAct !== null,
      tackleZone: s.tackleZone !== null
    }
  };
}

// An applied notification and its independently qualified reserves checkpoint
// seed observation tracking. No successful recovery roll is invented.
export function findTreatmentReturns(
  replay: ReplayModel,
  owners: OwnershipTimeline,
  evidence: ReturnType<typeof findTreatmentEvidence>
) {
  const candidates = [...evidence.aftermath].filter(
    ([, a]) => a.observation.situationCode === 1
  );
  const rawSources = new Map(
    candidates.length
      ? replay.turns.flatMap((t) => t.events).map((e) => [e.id, e])
      : []
  );
  const seeds: ReservesReturnSeed[] = [];
  if (replay.replayVersion === "1-4-0-0")
    for (const [id, a] of candidates) {
      const raw = rawSources.get(id),
        fact = evidence.records.get(id)?.observation;
      if (
        a.observation.situationCode !== 1 ||
        !raw?.playerId ||
        raw.sourceTag !== "ResultApothecary" ||
        !fact ||
        fact.playerStatusCode !== 0 ||
        fact.subjectId !== raw.playerId
      )
        continue;
      const owner = owners.resolve(raw.playerId, raw);
      if (
        owner.status !== "confirmed" ||
        owner.proof.teamId !== fact.subjectTeamId
      )
        continue;
      seeds.push({
        sourceId: id,
        playerId: raw.playerId,
        teamId: owner.proof.teamId,
        identitySourceId: owner.proof.identitySourceId,
        rosterIndex: a.rosterIndex,
        checkpointAfter: a.checkpointAfter,
        replayStep: a.replayStep,
        childIndex: a.childIndex
      });
    }
  const result = findReservesReturns(replay, owners, seeds);
  const traces = new Map<string, Trace>();
  for (const [id, t] of result.traces) {
    if (t.status !== "observed") {
      traces.set(id, t);
      continue;
    }
    const { setup, playing, activation, ...rest } = t;
    traces.set(id, {
      ...rest,
      setup: recorded(setup),
      ...(playing ? { playing: recorded(playing) } : {}),
      ...(activation
        ? { activation: { ...activation, before: recorded(activation.before) } }
        : {})
    });
  }
  return {
    traces,
    activations: new Map(
      [...result.activations].map(([id, { originSourceId, ...a }]) => [
        id,
        { ...a, treatmentSourceId: originSourceId, before: recorded(a.before) }
      ])
    )
  };
}

function snapshotMatches(
  s: Snapshot,
  e: LuckEvent,
  report: LuckReport,
  phase: 3 | 5,
  slot: number
) {
  if (
    !validReservesSnapshot(s, phase, slot, report.coverage.sourceRecordCount) ||
    s.recordedFlags.status !== (s.statusCode !== null) ||
    s.recordedFlags.situation !== (s.situationCode !== null) ||
    s.recordedFlags.canAct !== (s.canAct !== null) ||
    s.recordedFlags.tackleZone !== (s.tackleZone !== null)
  )
    return false;
  const cp = report.rerollResources.flow.clockSnapshots.find(
    (c) =>
      c.source.checkpointAfter === s.checkpointAfter &&
      c.source.replayStep === s.replayStep &&
      c.source.childIndex === s.childIndex &&
      c.source.kind === "board"
  );
  if (
    !cp?.clock ||
    !cp.identityStructureObserved ||
    cp.rosterCount !== 2 ||
    cp.clock.phaseCode !== phase ||
    cp.clock.activeGamerId !== s.activeGamerId ||
    cp.clock.periodCode !== s.periodCode ||
    cp.clock.teamTurns[slot] !== s.teamTurn ||
    cp.playerIds.flat().filter((id) => String(id) === e.playerId).length !==
      1 ||
    !cp.playerIds[slot]?.some((id) => String(id) === e.playerId)
  )
    return false;
  const teams = new Set(report.teams.map((t) => t.teamId));
  return (
    cp.explicitTeamIds.every((id) => id === null || teams.has(String(id))) &&
    (cp.explicitTeamIds[slot] === null ||
      String(cp.explicitTeamIds[slot]) === e.teamId) &&
    (cp.explicitTeamIds[1 - slot] === null ||
      String(cp.explicitTeamIds[1 - slot]) !== e.teamId)
  );
}
function noValue(e: LuckEvent) {
  return (
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
export function validReportedTreatmentReturn(
  e: LuckEvent,
  sources: ReadonlyMap<string, LuckEvent>,
  report: LuckReport
) {
  const t = e.metadata.treatmentReturn,
    a = e.metadata.treatmentAftermath;
  if (!t) return a?.observation.situationCode !== 1;
  if (
    !a ||
    !e.metadata.recordedTreatment ||
    a.observation.situationCode !== 1 ||
    !noValue(e)
  )
    return false;
  const stop = "stop" in t ? t.stop : undefined;
  if (
    stop?.sourceIndex !== undefined &&
    stop.sourceIndex !== null &&
    (stop.sourceIndex < a.checkpointAfter ||
      stop.sourceIndex > report.coverage.sourceRecordCount)
  )
    return false;
  if (t.status !== "observed") return true;
  if (
    !snapshotMatches(t.setup, e, report, 3, a.rosterIndex) ||
    t.setup.checkpointAfter <= a.checkpointAfter ||
    t.setup.replayStep < a.replayStep ||
    (t.setup.replayStep === a.replayStep &&
      t.setup.childIndex <= a.childIndex) ||
    (t.playing &&
      (!snapshotMatches(t.playing, e, report, 5, a.rosterIndex) ||
        !isReturnSnapshotAfter(t.playing, t.setup))) ||
    (stop?.sourceIndex !== undefined &&
      stop.sourceIndex !== null &&
      stop.sourceIndex < (t.playing ?? t.setup).checkpointAfter)
  )
    return false;
  if (!t.activation) return true;
  const use = sources.get(t.activation.sourceId),
    marker = use?.metadata.treatmentReturnActivation;
  return (
    !!t.playing &&
    !stop &&
    !!use &&
    !!marker &&
    marker.treatmentSourceId === e.metadata.sourceId &&
    use.playerId === e.playerId &&
    use.teamId === e.teamId &&
    validReportedTreatmentReturnActivation(use, sources, report) &&
    t.activation.stepSourceIndex === marker.stepSourceIndex &&
    t.activation.actionCode === marker.actionCode &&
    JSON.stringify(t.activation.before) === JSON.stringify(marker.before) &&
    isReturnSnapshotAtOrAfter(t.activation.before, t.playing)
  );
}
export function validReportedTreatmentReturnActivation(
  e: LuckEvent,
  sources: ReadonlyMap<string, LuckEvent>,
  report: LuckReport
) {
  const a = e.metadata.treatmentReturnActivation;
  if (!a) return true;
  const origin = sources.get(a.treatmentSourceId),
    t = origin?.metadata.treatmentReturn;
  const previous = report.rerollResources.flow.clockSnapshots
    .filter(
      (c) =>
        c.source.kind === "board" &&
        c.source.checkpointAfter < a.stepSourceIndex
    )
    .at(-1);
  return (
    noValue(e) &&
    e.type === "unknown" &&
    e.metadata.sourceTag === "ResultUseAction" &&
    e.metadata.stepType === 0 &&
    e.metadata.actionCode === a.actionCode &&
    !!e.metadata.actionId &&
    !!e.metadata.sequenceId &&
    e.metadata.locator?.stepIndex === 0 &&
    e.metadata.locator.messageIndex === 0 &&
    e.metadata.sourceIndex === a.stepSourceIndex + 1 &&
    a.before.checkpointAfter < a.stepSourceIndex &&
    previous?.source.checkpointAfter === a.before.checkpointAfter &&
    (a.before.replayStep < (e.metadata.locator.replayStep ?? -1) ||
      (a.before.replayStep === e.metadata.locator.replayStep &&
        a.before.childIndex < (e.metadata.locator.childIndex ?? -1))) &&
    a.before.canAct !== false &&
    a.before.statusCode !== 2 &&
    !!origin?.metadata.treatmentAftermath &&
    t?.status === "observed" &&
    !t.stop &&
    t.activation?.sourceId === e.metadata.sourceId &&
    !!t.playing &&
    snapshotMatches(a.before, e, report, 5, t.setup.rosterIndex) &&
    isReturnSnapshotAtOrAfter(a.before, t.playing) &&
    origin.playerId === e.playerId &&
    origin.teamId === e.teamId &&
    e.metadata.ownership?.role === "actor" &&
    e.metadata.ownership.playerId === e.playerId &&
    e.metadata.ownership.teamId === e.teamId &&
    (a.actionCode === 1
      ? e.metadata.targetId === "-1"
      : !!e.metadata.targetId && e.metadata.targetId !== e.playerId) &&
    !e.metadata.recoveryReturnActivation
  );
}
