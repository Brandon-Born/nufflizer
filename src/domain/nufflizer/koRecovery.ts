import type { ReplayEvent, ReplayTurn } from "@/domain/replay/types";

function recoveryKey(event: ReplayEvent) {
  return JSON.stringify([event.locator?.replayStep, event.playerId]);
}

// A repeated subject in the same recovery window cannot establish how many
// checks were actually rolled. Preserve those records without scoring them.
export function countKoRecoveryChecks(
  turns: readonly ReplayTurn[]
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const turn of turns) {
    for (const event of turn.events) {
      if (event.sourceTag !== "EventRoll" || event.rollType !== 13) continue;
      const key = recoveryKey(event);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

// UI-040 confirms the direct recovery shape, including a missing DieType
// and an omitted Outcome on failure. This omission rule is family-specific.
export function verifyKoRecovery(
  event: ReplayEvent,
  version: string | undefined,
  checks: ReadonlyMap<string, number>,
  owner: string | undefined,
  resolvedTeam: string
): { subject: string; success: boolean } | undefined {
  const p = event.payload;
  if (
    version !== "1-4-0-0" ||
    event.sourceTag !== "EventRoll" ||
    event.rollType !== 13 ||
    event.actionId ||
    event.locator?.replayStep === undefined ||
    event.locator.childIndex === undefined ||
    checks.get(recoveryKey(event)) !== 1 ||
    !event.playerId ||
    !owner ||
    resolvedTeam !== owner ||
    event.teamId !== owner ||
    p?.PlayerId !== event.playerId ||
    p.TeamId !== owner ||
    p.Requirement !== "4" ||
    p.Difficulty !== "4" ||
    (p.Modifiers !== undefined && p.Modifiers !== "")
  )
    return;
  const die = (
    p.Dice as { Die?: { Value?: unknown; DieType?: unknown } } | undefined
  )?.Die;
  if (
    typeof die?.Value !== "string" ||
    !/^[1-6]$/.test(die.Value) ||
    die.DieType !== undefined
  )
    return;
  const success = Number(die.Value) >= 4;
  if (p.Outcome !== (success ? "1" : undefined)) return;
  return { subject: event.playerId, success };
}
