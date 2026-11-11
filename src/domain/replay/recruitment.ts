import type { ReplayEvent, ReplayModel } from "./types";
import { observePlayerTraits } from "./playerTraits";

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function number(value: unknown): number | undefined {
  if (typeof value === "string" && /^\d{1,16}$/.test(value))
    value = Number(value);
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}
function list(value: unknown): unknown[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}
export function mercenaryIdentity(event: ReplayEvent) {
  if (!["EventBuyMercenary", "EventRemoveMercenary"].includes(event.sourceTag))
    return;
  const playerId = number(event.payload?.MercenaryId),
    playerTypeId = number(event.payload?.MercenaryType),
    gamerId = number(event.payload?.GamerId);
  if (
    playerId === undefined ||
    playerTypeId === undefined ||
    (gamerId !== 0 && gamerId !== 1)
  )
    return;
  return {
    operation:
      event.sourceTag === "EventBuyMercenary"
        ? ("purchase" as const)
        : ("removal_record" as const),
    playerId: String(playerId),
    playerTypeId,
    gamerId
  };
}

// A selected catalogue entry is not a current complete skill/eligibility set.
// Confirm membership against the first following checkpoint, never a later
// convenient one, and never across a replacement/removal of the same ID.
export function observeRecruitmentPurchases(replay: ReplayModel) {
  const result: {
    sourceId: string;
    sourceIndex: number;
    playerId: string;
    playerTypeId: number;
    gamerId: number;
    candidateTeamId: number | null;
    rosterTeamId: string | null;
    checkpointAfter: number | null;
    checkpointReplayStep: number | null;
    checkpointChildIndex: number | null;
    innateSkills: number[] | null;
    acquiredSkills: number[] | null;
    previousPurchaseSourceId?: string;
    removalSourceId?: string;
  }[] = [];
  if (replay.replayVersion !== "1-4-0-0") return result;
  const events = replay.turns.flatMap((t) => t.events);
  const previous = new Map<string, string>();
  const removal = new Map<string, string>();
  const nextIdentityEvent = new Map<number, number>();
  const next = new Map<string, number>();
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (!["EventBuyMercenary", "EventRemoveMercenary"].includes(e.sourceTag))
      continue;
    const id = number(e.payload?.MercenaryId);
    if (id === undefined) continue;
    const following = next.get(String(id));
    if (following !== undefined) nextIdentityEvent.set(i, following);
    next.set(String(id), e.sourceIndex ?? -1);
  }
  const checkpoints = replay.boardCheckpoints ?? [];
  let cursor = 0;
  for (const [index, event] of events.entries()) {
    const p = event.payload;
    const id = number(p?.MercenaryId);
    if (id === undefined || !event.id || event.sourceIndex === undefined)
      continue;
    const playerId = String(id);
    if (event.sourceTag === "EventRemoveMercenary") {
      removal.set(playerId, event.id);
      continue;
    }
    if (event.sourceTag !== "EventBuyMercenary") continue;
    const type = number(p?.MercenaryType),
      gamer = number(p?.GamerId);
    if (type === undefined || (gamer !== 0 && gamer !== 1)) {
      previous.delete(playerId);
      removal.delete(playerId);
      continue;
    }
    const categories = list(
      object(object(p?.TeamInducementsData)?.InducementsCategories)
        ?.InducementsCategory
    );
    const entries =
      categories.length <= 64
        ? categories.flatMap((category) =>
            list(object(object(category)?.Players)?.PlayerData)
          )
        : [];
    const candidates =
      entries.length <= 64
        ? entries
            .map(object)
            .filter((entry) => entry && number(entry.IdPlayerTypes) === type)
        : [];
    const candidate = candidates.length === 1 ? candidates[0] : undefined;
    const candidateTeam = number(candidate?.TeamId);
    const traits =
      candidate && candidate.Id === undefined
        ? observePlayerTraits(candidate, null)
        : null;
    while (
      cursor < checkpoints.length &&
      checkpoints[cursor]!.afterSourceIndex < event.sourceIndex
    )
      cursor++;
    const checkpoint = checkpoints[cursor];
    const following = nextIdentityEvent.get(index);
    const board =
      checkpoint?.status === "observed" &&
      (following === undefined || following > checkpoint.afterSourceIndex)
        ? checkpoint.board
        : null;
    const members =
      board?.issues.length === 0
        ? board.teams.flatMap((team) =>
            team.players
              .filter((player) => player.id === id)
              .map((player) => ({ team, player }))
          )
        : [];
    const member = members?.length === 1 ? members[0] : undefined;
    const confirmed =
      traits &&
      candidateTeam !== undefined &&
      member?.team.explicitTeamId === candidateTeam &&
      replay.teams.some((team) => team.id === String(candidateTeam)) &&
      (member.player.traits?.playerTypeId == null ||
        member.player.traits.playerTypeId === type) &&
      ["innateSkills", "acquiredSkills"].every((field) => {
        const key = field as "innateSkills" | "acquiredSkills";
        const observed = member.player.traits?.[key];
        return (
          !observed ||
          !traits[key] ||
          (observed.length === traits[key]!.length &&
            observed.every((code) => traits[key]!.includes(code)))
        );
      });
    result.push({
      sourceId: event.id,
      sourceIndex: event.sourceIndex,
      playerId,
      playerTypeId: type,
      gamerId: gamer,
      candidateTeamId: candidateTeam ?? null,
      rosterTeamId: confirmed ? String(member!.team.explicitTeamId) : null,
      checkpointAfter: confirmed ? checkpoint!.afterSourceIndex : null,
      checkpointReplayStep: confirmed ? checkpoint!.replayStep : null,
      checkpointChildIndex: confirmed ? checkpoint!.childIndex : null,
      innateSkills: traits?.innateSkills ?? null,
      acquiredSkills: traits?.acquiredSkills ?? null,
      previousPurchaseSourceId: previous.get(playerId),
      removalSourceId: removal.get(playerId)
    });
    previous.set(playerId, event.id);
    removal.delete(playerId);
  }
  return result;
}
