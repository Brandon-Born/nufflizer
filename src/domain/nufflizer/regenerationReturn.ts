import { validReturnBudget } from "@/domain/replay/activationBudget";
import type { ReplayModel } from "@/domain/replay/types";
import type { OwnershipTimeline } from "@/domain/replay/ownershipTimeline";
import type { LuckEvent, LuckReport } from "./types";
import {
  findReservesReturns,
  validReturnSnapshotSource,
  isReturnSnapshotAfter as after,
  isReturnSnapshotAtOrAfter as sameOrLater,
  type ReservesReturnSeed
} from "./reservesReturn";
export function findRegenerationReturns(
  replay: ReplayModel,
  owners: OwnershipTimeline,
  aftermath: ReadonlyMap<
    string,
    NonNullable<LuckEvent["metadata"]["regenerationAftermath"]>
  >
) {
  const candidates = [...aftermath].filter(
    ([, a]) => a.observation.situationCode === 1
  );
  const rawSources = new Map(
      candidates.length
        ? replay.turns.flatMap((t) => t.events).map((e) => [e.id, e])
        : []
    ),
    seeds: ReservesReturnSeed[] = [];
  if (replay.replayVersion === "1-4-0-0")
    for (const [id, a] of candidates) {
      if (a.observation.situationCode !== 1) continue;
      const raw = rawSources.get(id);
      if (!raw?.playerId || raw.payload?.Outcome !== 1) continue;
      const owner = owners.resolve(raw.playerId, raw);
      if (owner.status !== "confirmed") continue;
      seeds.push({
        sourceId: id,
        playerId: raw.playerId,
        teamId: owner.proof.teamId,
        rosterIndex: a.rosterIndex,
        identitySourceId: owner.proof.identitySourceId,
        checkpointAfter: a.checkpointAfter,
        replayStep: a.replayStep,
        childIndex: a.childIndex
      });
    }
  const result = findReservesReturns(replay, owners, seeds);
  return {
    traces: result.traces,
    activations: new Map(
      [...result.activations].map(([id, { originSourceId, ...a }]) => [
        id,
        { regenerationSourceId: originSourceId, ...a }
      ])
    )
  };
}
export function validReportedRegenerationReturn(
  e: LuckEvent,
  sources: ReadonlyMap<string, LuckEvent>,
  report: LuckReport
) {
  const count = report.coverage.sourceRecordCount;
  const trace = e.metadata.regenerationReturn;
  if (!trace) return true;
  const base = e.metadata.regenerationAftermath;
  if (
    !base ||
    e.actualSuccess !== true ||
    base.observation.situationCode !== 1 ||
    e.scoringStatus !== "scored"
  )
    return false;
  const stop = "stop" in trace ? trace.stop : undefined;
  if (
    stop &&
    stop.sourceIndex !== null &&
    (stop.sourceIndex < base.checkpointAfter || stop.sourceIndex > count)
  )
    return false;
  if (trace.status !== "observed") return true;
  const s = trace.setup,
    p = trace.playing,
    a = trace.activation;
  if (
    !validReturnSnapshotSource(s, e, report, 3, base.rosterIndex) ||
    s.checkpointAfter <= base.checkpointAfter ||
    s.replayStep < base.replayStep ||
    (s.replayStep === base.replayStep && s.childIndex <= base.childIndex) ||
    (p &&
      (!validReturnSnapshotSource(p, e, report, 5, base.rosterIndex) ||
        !after(p, s))) ||
    (stop &&
      stop.sourceIndex !== null &&
      stop.sourceIndex < (p ?? s).checkpointAfter)
  )
    return false;
  if (!a) return true;
  const use = sources.get(a.sourceId),
    marker = use?.metadata.recoveryReturnActivation;
  return (
    !!p &&
    !stop &&
    !!use &&
    !!marker &&
    marker.regenerationSourceId === e.metadata.sourceId &&
    use.playerId === e.playerId &&
    use.teamId === e.teamId &&
    validReportedRecoveryReturnActivation(use, sources, report) &&
    a.stepSourceIndex === marker.stepSourceIndex &&
    a.actionCode === marker.actionCode &&
    JSON.stringify(a.budget) === JSON.stringify(marker.budget) &&
    JSON.stringify(a.before) === JSON.stringify(marker.before) &&
    sameOrLater(a.before, p)
  );
}
export function validReportedRecoveryReturnActivation(
  e: LuckEvent,
  sources: ReadonlyMap<string, LuckEvent>,
  report: LuckReport
) {
  const a = e.metadata.recoveryReturnActivation;
  if (!a) return true;
  const previous = report.rerollResources.flow.clockSnapshots
    .filter(
      (c) =>
        c.source.kind === "board" &&
        c.source.checkpointAfter < a.stepSourceIndex
    )
    .at(-1);
  const regen = sources.get(a.regenerationSourceId),
    trace = regen?.metadata.regenerationReturn;
  return (
    e.explainability.weight === 0 &&
    e.type === "unknown" &&
    e.scoringStatus === "excluded" &&
    !e.metadata.isRollCandidate &&
    e.probabilitySuccess === null &&
    e.actualSuccess === null &&
    e.delta === 0 &&
    e.weightedDelta === 0 &&
    !e.contextualImpact &&
    !e.contextualBounds &&
    !e.possessionBounds &&
    !e.catchPossessionBounds &&
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
    (a.before.replayStep < (e.metadata.locator?.replayStep ?? -1) ||
      (a.before.replayStep === e.metadata.locator?.replayStep &&
        a.before.childIndex < (e.metadata.locator.childIndex ?? -1))) &&
    a.before.canAct !== false &&
    a.before.statusCode !== 2 &&
    !!regen?.metadata.regenerationAftermath &&
    trace?.status === "observed" &&
    !trace.stop &&
    trace.activation?.sourceId === e.metadata.sourceId &&
    !!trace.playing &&
    validReturnSnapshotSource(
      a.before,
      e,
      report,
      5,
      trace.setup.rosterIndex
    ) &&
    sameOrLater(a.before, trace.playing) &&
    regen.playerId === e.playerId &&
    regen.teamId === e.teamId &&
    e.metadata.ownership?.role === "actor" &&
    e.metadata.ownership.playerId === e.playerId &&
    e.metadata.ownership.teamId === e.teamId &&
    !e.metadata.treatmentReturnActivation &&
    validReturnBudget(
      a.actionCode,
      a.budget,
      a.before.cell,
      e.metadata.targetId
    ) &&
    (a.actionCode === 1
      ? e.metadata.targetId === "-1"
      : a.actionCode === 2
        ? !!e.metadata.targetId && e.metadata.targetId !== e.playerId
        : true)
  );
}
