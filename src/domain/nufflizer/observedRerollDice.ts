import { observedActorRoster } from "@/domain/replay/observedActorRoster";
import { lastBoardCheckpointBefore } from "@/domain/replay/boardState";
import type { ReplayEvent, ReplayModel } from "@/domain/replay/types";
import { checkpointClockEpochs } from "@/domain/replay/boardState";
import type { DicePath } from "./diceEvidence";
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | undefined =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Obj)
    : undefined;
function die(roll: Obj | undefined) {
  const d = obj(obj(roll?.Dice)?.Die);
  return d?.DieType === 0 &&
    Number.isInteger(d.Value) &&
    Number(d.Value) >= 1 &&
    Number(d.Value) <= 6
    ? Number(d.Value)
    : undefined;
}
const samePolicy = (a: Obj, b: Obj) =>
  JSON.stringify([
    a.RollType,
    a.Requirement,
    a.Difficulty,
    a.Modifiers ?? null
  ]) ===
  JSON.stringify([
    b.RollType,
    b.Requirement,
    b.Difficulty,
    b.Modifiers ?? null
  ]);
const geometry = (e: ReplayEvent) => {
  const a = obj(e.payload?.CellFrom),
    b = obj(e.payload?.CellTo);
  return a && b && [a.X, a.Y, b.X, b.Y].every((v) => Number.isInteger(v))
    ? [a.X, a.Y, b.X, b.Y]
    : undefined;
};
export type ObservedRerollDice = {
  teamId: string;
  ownershipCheckpointAfter: number;
  kind: "skill" | "star";
  ruleId: 47 | 34;
  used: boolean;
  gamerId: 0 | 1;
  question: ReplayEvent;
  choice: ReplayEvent;
  final: ReplayEvent;
  original: Obj;
  originalPath: DicePath;
  originalDie: number;
  finalDie: number;
  directOriginal?: ReplayEvent;
  duplicates: ReplayEvent[];
};
// These are identity/resource observations, not probability or game-value
// contracts. In particular, a used star reroll can emit NewRoll0 and can
// reproduce the same face. Those flags/values cannot decide freshness alone.
export function findObservedRerollDice(replay: ReplayModel) {
  const found: ObservedRerollDice[] = [];
  if (replay.replayVersion !== "1-4-0-0") return found;
  const events = replay.turns.flatMap((t) => t.events),
    steps = new Map(
      events
        .filter((e) => e.sourceTag === "PlayerStep")
        .map((e) => [e.actionId, e])
    );
  const cps = replay.boardCheckpoints ?? [],
    epochs = checkpointClockEpochs(cps),
    epochBySource = new Map<number, number>();
  let cursor = 0,
    epoch = 0;
  for (const e of events) {
    if (e.sourceIndex === undefined) continue;
    while (cursor < cps.length && cps[cursor]!.afterSourceIndex < e.sourceIndex)
      epoch = epochs.get(cps[cursor++]!)!;
    epochBySource.set(e.sourceIndex, epoch);
  }
  const owner = (e: ReplayEvent) => {
    if (e.sourceIndex === undefined || !e.playerId || e.attributionConflict)
      return;
    const cp = lastBoardCheckpointBefore(cps, e.sourceIndex),
      b = cp?.board;
    const team = b?.teams.find((t) =>
      t.players.some((p) => String(p.id) === e.playerId)
    );
    if (!cp || !b || !team || b.issues.length) return;
    const known = replay.teams.map((t) => t.id),
      other = b.teams.find((t) => t !== team);
    const candidate =
      team.explicitTeamId !== null
        ? String(team.explicitTeamId)
        : other?.explicitTeamId !== null
          ? known.find((id) => id !== String(other?.explicitTeamId))
          : undefined;
    if (
      !candidate ||
      !observedActorRoster(b, Number(e.playerId), candidate, known) ||
      (e.actorTeamSource !== "turn_inferred" && e.actorTeamId !== candidate)
    )
      return;
    return { teamId: candidate, checkpoint: cp.afterSourceIndex };
  };
  for (let i = 0; i < events.length; i++) {
    const q = events[i]!,
      star =
        q.sourceTag === "QuestionStarSpecialRuleUsage" &&
        q.payload?.StarSpecialRule === 34 &&
        q.stepType === 31;
    const skill =
      q.sourceTag === "QuestionSkillUsage" &&
      q.payload?.Skill === 47 &&
      q.payload.StarSpecialRule === -1 &&
      q.stepType === 11;
    if (!star && !skill) continue;
    const ownership = owner(q);
    const originalPath: DicePath = star
      ? ["RollsInfos", "ResultRoll", "Dice"]
      : ["RollInfos", "Dice"];
    const container = star
        ? obj(q.payload?.RollsInfos)?.ResultRoll
        : q.payload?.RollInfos,
      original = obj(container),
      first = die(original);
    const step = steps.get(q.actionId),
      cells = step && geometry(step),
      gamer = q.payload?.GamerId;
    if (
      !q.id ||
      q.sourceIndex === undefined ||
      !original ||
      first === undefined ||
      !cells ||
      q.stepTag !== "PlayerStep" ||
      !q.playerId ||
      q.stepActorId !== q.playerId ||
      q.payload?.PlayerId !== Number(q.playerId) ||
      q.attributionConflict ||
      !ownership ||
      ![0, 1].includes(Number(gamer)) ||
      ownership.teamId !== String(gamer) ||
      step?.payload?.IsEvaluation !== 0 ||
      original.Status !== 1 ||
      (star
        ? original.RollType !== 87 ||
          original.NewRoll !== 0 ||
          original.Outcome !== 2 ||
          original.Requirement !== 0 ||
          original.Difficulty !== 0
        : original.RollType !== 5 ||
          original.NewRoll !== 1 ||
          original.Outcome !== 0)
    )
      continue;
    const same = (e: ReplayEvent) =>
      e.stepTag === "PlayerStep" &&
      e.stepType === q.stepType &&
      e.stepActorId === q.stepActorId &&
      e.stepTargetId === q.stepTargetId &&
      e.playerId === q.playerId &&
      owner(e)?.teamId === ownership.teamId &&
      !e.attributionConflict;
    const matchingGeometry = (e: ReplayEvent) => {
      const current = geometry(e);
      if (!current) return false;
      if (!star) return JSON.stringify(current) === JSON.stringify(cells);
      return (
        current[0] === cells[0] &&
        current[1] === cells[1] &&
        [current, cells].every(
          (c) =>
            Math.max(
              Math.abs(Number(c[2]) - Number(c[0])),
              Math.abs(Number(c[3]) - Number(c[1]))
            ) === 1
        )
      );
    };
    const next = (from: number) => {
      for (let j = from + 1; j < Math.min(events.length, from + 17); j++) {
        const e = events[j]!;
        if (
          e.checkpointCarrier ||
          [
            "EventActiveGamerChanged",
            "EventPauseActiveTimer",
            "EventActiveTimerChanged",
            "EventGamersAreReady",
            "EventStartActiveTimer",
            "EventRulesEngineStandBy"
          ].includes(e.sourceTag)
        )
          continue;
        if (
          e.sourceTag === "PlayerStep" &&
          same(e) &&
          e.payload?.IsEvaluation === 0 &&
          matchingGeometry(e)
        )
          continue;
        return j;
      }
      return -1;
    };
    const ci = next(i);
    if (ci < 0) continue;
    const choice = events[ci]!,
      fi = next(ci);
    if (fi < 0) continue;
    const final = events[fi]!,
      p = choice.payload,
      roll = final.payload,
      last = die(roll);
    const used = p?.Used === 1;
    if (
      !choice.id ||
      !final.id ||
      !same(choice) ||
      !same(final) ||
      !samePolicy(original, roll ?? {}) ||
      last === undefined ||
      choice.sourceTag !==
        (star ? "ResultStarSpecialRuleUsage" : "ResultSkillUsage") ||
      p?.PlayerId !== Number(q.playerId) ||
      p[star ? "StarSpecialRule" : "Skill"] !== (star ? 34 : 47) ||
      (p.Used !== 0 && p.Used !== 1) ||
      Object.keys(p).some(
        (k) =>
          ![
            "PlayerId",
            "Used",
            "TargetId",
            star ? "StarSpecialRule" : "Skill"
          ].includes(k)
      ) ||
      final.sourceTag !== "ResultRoll" ||
      epochBySource.get(final.sourceIndex ?? -1) !==
        epochBySource.get(q.sourceIndex) ||
      !roll ||
      (star
        ? roll.Status !== 1 || roll.NewRoll !== 0 || roll.Outcome !== 2
        : roll.Status !== (used ? 2 : 1) || roll.NewRoll !== (used ? 1 : 0)) ||
      (!used && last !== first)
    )
      continue;
    const directOriginal = events
      .slice(Math.max(0, i - 16), i)
      .find(
        (e) =>
          e.sourceTag === "ResultRoll" &&
          e.actionId === q.actionId &&
          same(e) &&
          JSON.stringify(e.payload) === JSON.stringify(original)
      );
    const duplicates: ReplayEvent[] = [];
    for (let j = fi + 1; j < Math.min(events.length, fi + 17); j++) {
      const e = events[j]!;
      if (e.checkpointCarrier) continue;
      if (
        e.sourceTag !== "ResultRoll" ||
        e.actionId !== final.actionId ||
        !same(e) ||
        JSON.stringify(e.payload) !== JSON.stringify(roll)
      )
        break;
      duplicates.push(e);
    }
    found.push({
      teamId: ownership.teamId,
      ownershipCheckpointAfter: ownership.checkpoint,
      kind: star ? "star" : "skill",
      ruleId: star ? 34 : 47,
      used,
      gamerId: Number(gamer) as 0 | 1,
      question: q,
      choice,
      final,
      original,
      originalPath,
      originalDie: first,
      finalDie: last,
      directOriginal,
      duplicates
    });
  }
  return found;
}
