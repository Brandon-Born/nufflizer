import type { LuckEvent, LuckReport } from "./types";

export function indexIdentityMutations(events: readonly LuckEvent[]) {
  const result = new Map<string, LuckEvent[]>();
  for (const event of events) {
    const id = event.metadata.identityMutation?.playerId;
    if (!id) continue;
    const values = result.get(id) ?? [];
    values.push(event);
    result.set(id, values);
  }
  for (const values of result.values())
    values.sort(
      (a, b) =>
        (a.metadata.sourceIndex ?? Infinity) -
        (b.metadata.sourceIndex ?? Infinity)
    );
  return result;
}

export function validReportedOwnership(
  event: LuckEvent,
  report: LuckReport,
  sources: ReadonlyMap<string, LuckEvent>,
  identityMutations: ReturnType<typeof indexIdentityMutations>
) {
  const {
    ownership,
    ownershipConflict: conflict,
    identityMutation: mutation
  } = event.metadata;
  const teams = new Set(report.teams.map((t) => t.teamId)),
    index = event.metadata.sourceIndex;
  if (event.metadata.mercenary && !mutation) return false;
  function latest(playerId: string) {
    const values = identityMutations.get(playerId) ?? [];
    let low = 0,
      high = values.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if ((values[mid]!.metadata.sourceIndex ?? Infinity) < (index ?? -1))
        low = mid + 1;
      else high = mid;
    }
    return low ? values[low - 1]!.metadata.sourceId : undefined;
  }
  if (mutation) {
    if (
      event.metadata.sourceTag !==
        (mutation.operation === "purchase"
          ? "EventBuyMercenary"
          : "EventRemoveMercenary") ||
      (mutation.buyerIdKind === "small_numeric") !==
        (mutation.gamerId !== undefined)
    )
      return false;
    const old = event.metadata.mercenary;
    if (
      old &&
      (old.playerId !== mutation.playerId ||
        old.playerTypeId !== mutation.playerTypeId ||
        old.operation !== mutation.operation ||
        old.gamerId !== mutation.gamerId)
    )
      return false;
  }
  if (conflict) {
    if (
      event.scoringStatus !== "excluded" ||
      event.teamId !== "unresolved" ||
      ownership ||
      !event.metadata.normalizationFlags?.includes(
        "ambiguous_team_attribution"
      ) ||
      (conflict.role === "defender"
        ? event.metadata.sourceTag !== "QuestionBlockDice" ||
          event.metadata.targetId !== conflict.playerId
        : event.playerId !== conflict.playerId) ||
      (conflict.initialTeamId !== undefined &&
        !teams.has(conflict.initialTeamId)) ||
      (conflict.observedTeamId !== undefined &&
        !teams.has(conflict.observedTeamId)) ||
      (conflict.checkpointAfter !== undefined &&
        conflict.checkpointAfter >= (index ?? -1))
    )
      return false;
    if (conflict.identitySourceId) {
      if (latest(conflict.playerId) !== conflict.identitySourceId) return false;
      const source = sources.get(conflict.identitySourceId);
      if (
        source?.metadata.identityMutation?.playerId !== conflict.playerId ||
        (source.metadata.sourceIndex ?? Infinity) >= (index ?? -1)
      )
        return false;
    }
    if (conflict.reason === "pending_identity" && !conflict.identitySourceId)
      return false;
  }
  if (!ownership)
    return event.scoringStatus !== "scored" && !event.metadata.block;
  if (
    (event.scoringStatus !== "scored" &&
      !event.metadata.block &&
      !event.metadata.casualtyObservation &&
      !event.metadata.recordedSpp) ||
    conflict ||
    !teams.has(ownership.teamId) ||
    ownership.teamId !== event.teamId ||
    ownership.playerId !== event.playerId ||
    ownership.role !==
      (event.metadata.damage || event.metadata.casualtyObservation ? "subject" : event.playerId ? "actor" : "team")
  )
    return false;
  type Proof = Omit<typeof ownership, "defender" | "role">;
  function proof(p: Proof) {
    if (!teams.has(p.teamId)) return false;
    const identity = p.playerId ? latest(p.playerId) : undefined;
    if (identity !== p.identitySourceId) return false;
    if (p.basis === "explicit_team")
      return (
        p.sourceTeamId === p.teamId &&
        !p.identitySourceId &&
        p.checkpointAfter === undefined &&
        p.playerTypeId === undefined &&
        event.metadata.sourceTag === "ResultRoll" &&
        [1, 2, 4, 7].includes(event.metadata.rollType ?? -1)
      );
    if (!p.playerId || p.sourceTeamId !== undefined) return false;
    if (p.basis === "initial_roster")
      return (
        p.checkpointAfter === undefined &&
        !p.identitySourceId &&
        p.playerTypeId === undefined
      );
    if (p.checkpointAfter === undefined || p.checkpointAfter >= (index ?? -1))
      return false;
    if (p.identitySourceId) {
      const source = sources.get(p.identitySourceId);
      if (
        source?.metadata.identityMutation?.playerId !== p.playerId ||
        (source.metadata.sourceIndex ?? Infinity) > p.checkpointAfter
      )
        return false;
    }
    if (p.basis === "confirmed_recruitment") {
      const selected = report.recruitments.find(
        (r) => r.sourceId === p.identitySourceId
      );
      return (
        !!selected &&
        selected.playerId === p.playerId &&
        selected.playerTypeId === p.playerTypeId &&
        selected.rosterTeamId === p.teamId &&
        selected.checkpointAfter === p.checkpointAfter
      );
    }
    return p.basis === "current_roster" && p.playerTypeId === undefined;
  }
  if (!proof(ownership)) return false;
  const block = event.metadata.block;
  if (!block) return ownership.defender === undefined;
  const defender = ownership.defender;
  return (
    ownership.role === "actor" &&
    ownership.playerId === block.attackerId &&
    !!defender &&
    defender.playerId === block.defenderId &&
    defender.teamId === block.defenderTeamId &&
    defender.teamId !== ownership.teamId &&
    (block.chooserGamerId === undefined ||
      String(block.chooserGamerId) === block.chooserTeamId) &&
    proof(defender)
  );
}
