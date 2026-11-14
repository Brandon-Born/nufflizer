import { z } from "zod";
import type { ObservedBoard, ReplayBoardCheckpoint } from "./boardState";
import { plainBallPolicyKnown } from "./playerTraits";
import type { ReplayEvent } from "./types";
import { unmodifiedD6Check } from "./numericCheck";

const integer = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER - 1);
const cell = z.strictObject({
  x: z.number().int().min(0).max(25),
  y: z.number().int().min(0).max(14)
});
const traits = z.strictObject({
  dataPlayerId: integer,
  playerTypeId: integer,
  innateSkills: z.array(integer).max(64),
  acquiredSkills: z.array(integer).max(64)
});
const player = z.strictObject({
  id: integer,
  cell: z.strictObject({
    x: z.number().int().min(-1).max(25),
    y: z.number().int().min(-1).max(14)
  }),
  status: integer.nullable(),
  situation: integer.nullable(),
  canAct: z.boolean().nullable(),
  tackleZone: z.boolean().nullable(),
  movement: integer.nullable(),
  effectsEmpty: z.literal(true),
  traits
});
const team = z.strictObject({
  teamId: z.string().min(1),
  side: z.union([z.literal(32), z.literal(64)]),
  turn: integer,
  score: integer,
  rerolls: integer.nullable(),
  effectsEmpty: z.literal(true),
  prayersEmpty: z.literal(true),
  transformationsAbsent: z.literal(true),
  players: z.array(player).min(1).max(64)
});
const priorRush = z.strictObject({
  sourceId: z.string().min(1),
  sourceIndex: integer,
  stepSourceId: z.string().min(1),
  stepSourceIndex: integer,
  actionId: z.string().min(1),
  actorId: integer,
  from: cell,
  to: cell,
  face: z.number().int().min(2).max(6)
});
export type ScoringPriorRush = z.infer<typeof priorRush>;

// A complete current profile for this transition, not a way to fill omitted
// observations. Resource, score, clock and effective-skill omissions fail it.
export const ScoringRushStateSchema = z.strictObject({
  policy: z.literal("ordinary_no_retry_scoring_rush"),
  source: z.strictObject({
    kind: z.enum(["initial", "board"]),
    checkpointAfter: integer,
    replayStep: z.number().int().positive().nullable(),
    childIndex: integer.nullable()
  }),
  declarationSourceId: z.string().min(1),
  priorRushes: z.array(priorRush).max(1),
  actorId: integer,
  step: z.strictObject({
    sourceId: z.string().min(1),
    sourceIndex: integer,
    actionId: z.string().min(1),
    skill: z.literal(0),
    evaluation: z.literal(0)
  }),
  rosterIds: z.tuple([
    z.array(integer).min(1).max(64),
    z.array(integer).min(1).max(64)
  ]),
  ownRoster: z.union([z.literal(0), z.literal(1)]),
  destination: cell,
  frame: z.strictObject({
    phase: z.literal(5),
    stable: z.literal(true),
    effectsEmpty: z.literal(true),
    standardPitch: z.literal(true),
    period: z.union([z.literal(0), z.literal(1)]),
    turnsPerPeriod: z.number().int().min(1).max(16),
    activeRoster: z.union([z.literal(0), z.literal(1)]),
    activePlayer: integer,
    ball: z.strictObject({ held: z.literal(true), carrierId: integer, cell }),
    teams: z.tuple([team, team])
  })
});
export type ScoringRushState = z.infer<typeof ScoringRushStateSchema>;

export function ordinaryScoringMoveHeader(
  step: ReplayEvent | undefined
): boolean {
  const p = step?.payload;
  const allowed = [
    "PlayerId",
    "TargetId",
    "TeamId",
    "StepType",
    "Skill",
    "IsEvaluation",
    "State",
    "CellFrom",
    "CellTo"
  ];
  const square = (v: unknown) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return false;
    const c = v as Record<string, unknown>;
    return (
      Object.keys(c).every((k) => k === "X" || k === "Y") &&
      Number.isSafeInteger(c.X) &&
      Number.isSafeInteger(c.Y)
    );
  };
  return (
    !!step &&
    !!p &&
    step.sourceTag === "PlayerStep" &&
    step.stepType === 1 &&
    p.StepType === 1 &&
    p.Skill === 0 &&
    p.IsEvaluation === 0 &&
    p.TargetId === -1 &&
    typeof p.PlayerId === "number" &&
    Number.isSafeInteger(p.PlayerId) &&
    Object.keys(p).every((k) => allowed.includes(k)) &&
    square(p.CellFrom) &&
    square(p.CellTo)
  );
}

const onPitch = (
  p: ScoringRushState["frame"]["teams"][number]["players"][number]
) => p.cell.x >= 0 && p.cell.y >= 0;
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export function validScoringRushState(s: ScoringRushState): boolean {
  const f = s.frame,
    own = f.teams[s.ownRoster],
    opponent = f.teams[1 - s.ownRoster]!;
  if (
    f.activeRoster !== s.ownRoster ||
    f.activePlayer !== s.actorId ||
    f.ball.carrierId !== s.actorId ||
    own.teamId === opponent.teamId ||
    own.side === opponent.side ||
    own.rerolls !== 0
  )
    return false;
  const start = f.period * f.turnsPerPeriod,
    end = start + f.turnsPerPeriod;
  if (
    own.turn <= start ||
    own.turn > end ||
    opponent.turn < start ||
    opponent.turn > end ||
    own.turn < opponent.turn ||
    own.turn > opponent.turn + 1
  )
    return false;
  const all = f.teams.flatMap((t) => t.players),
    ids = all.map((p) => p.id);
  if (new Set(ids).size !== ids.length) return false;
  if (
    f.teams.some(
      (t, i) =>
        JSON.stringify(t.players.map((p) => p.id).sort((a, b) => a - b)) !==
        JSON.stringify([...s.rosterIds[i]!].sort((a, b) => a - b))
    )
  )
    return false;
  const actor = own.players.find((p) => p.id === s.actorId);
  if (
    !actor ||
    !onPitch(actor) ||
    actor.status !== 0 ||
    actor.situation !== 0 ||
    actor.canAct !== true ||
    actor.movement !== 0 ||
    actor.tackleZone !== true ||
    distance(actor.cell, f.ball.cell) !== 0 ||
    distance(actor.cell, s.destination) !== 1
  )
    return false;
  for (const p of s.priorRushes)
    if (
      p.actorId !== s.actorId ||
      p.sourceIndex >= s.source.checkpointAfter ||
      p.stepSourceIndex !== p.sourceIndex - 1 ||
      distance(p.from, p.to) !== 1 ||
      distance(p.to, actor.cell) !== 0
    )
      return false;
  const goal = own.side === 32 ? 25 : 0;
  if (s.destination.x !== goal || actor.cell.x === goal) return false;
  const occupied = new Set<string>();
  for (const t of f.teams)
    for (const p of t.players) {
      if (
        p.traits.dataPlayerId !== p.id ||
        new Set(p.traits.innateSkills).size !== p.traits.innateSkills.length ||
        new Set(p.traits.acquiredSkills).size !==
          p.traits.acquiredSkills.length ||
        !plainBallPolicyKnown(p.traits, p.id, "")
      )
        return false;
      if (!onPitch(p)) {
        if (
          p.cell.x !== -1 ||
          p.cell.y !== -1 ||
          p.situation === null ||
          p.situation === 0
        )
          return false;
        continue;
      }
      if (
        p.situation !== 0 ||
        (p.status !== null && p.status > 2) ||
        (p.status !== null && p.status > 0 && p.tackleZone === true)
      )
        return false;
      const key = `${p.cell.x},${p.cell.y}`;
      if (occupied.has(key)) return false;
      occupied.add(key);
      // A later bounce/throw-in must not award either team a touchdown. Plain
      // profiles cannot move reactively; only the failing carrier changes pose.
      const endZone = t.side === 32 ? 25 : 0;
      if (
        p.id !== actor.id &&
        p.cell.x === endZone &&
        (p.status === null || p.status === 0)
      )
        return false;
      // Rush precedes Dodge. A successful Rush is not a touchdown if another
      // check is still needed to leave an opponent's tackle zone.
      if (
        t === opponent &&
        distance(p.cell, actor.cell) === 1 &&
        p.tackleZone !== false
      )
        return false;
    }
  return !occupied.has(`${s.destination.x},${s.destination.y}`);
}

export function scoringRushState(
  board: ObservedBoard,
  checkpoint: ReplayBoardCheckpoint,
  declarationSourceId: string,
  actorId: number,
  destination: { x: number; y: number },
  standardPitch: boolean,
  rosterIds: [number[], number[]] | undefined,
  step: ReplayEvent,
  priorRushes: ScoringPriorRush[] | undefined
): ScoringRushState | undefined {
  if (
    !ordinaryScoringMoveHeader(step) ||
    checkpoint.status !== "observed" ||
    board.issues.length ||
    !standardPitch ||
    board.pitchLayout === "small"
  )
    return;
  const parsed = ScoringRushStateSchema.safeParse({
    policy: "ordinary_no_retry_scoring_rush",
    source: {
      kind: checkpoint.kind,
      checkpointAfter: checkpoint.afterSourceIndex,
      replayStep: checkpoint.replayStep,
      childIndex: checkpoint.childIndex
    },
    declarationSourceId,
    priorRushes,
    actorId,
    rosterIds,
    ownRoster: board.activeTeamIndex,
    destination,
    step: {
      sourceId: step.id,
      sourceIndex: step.sourceIndex,
      actionId: step.actionId,
      skill: step.payload?.Skill,
      evaluation: step.payload?.IsEvaluation
    },
    frame: {
      phase: board.phaseCode,
      stable: board.stable,
      effectsEmpty: board.effectsKnownEmpty,
      standardPitch,
      period: board.periodCode,
      turnsPerPeriod: board.turnsPerPeriod,
      activeRoster: board.activeTeamIndex,
      activePlayer: board.activePlayerId,
      ball: {
        held: board.ball.isHeld,
        carrierId: board.ball.carrierId,
        cell: board.ball.cell
      },
      teams: board.teams.map((t) => ({
        teamId: t.explicitTeamId === null ? null : String(t.explicitTeamId),
        side: t.sideCode,
        turn: t.gameTurn,
        score: t.touchdowns,
        rerolls: t.rerolls,
        effectsEmpty: t.effectsKnownEmpty,
        prayersEmpty: t.prayersKnownEmpty,
        transformationsAbsent: t.transformationsKnownAbsent,
        players: t.players.map((p) => ({
          id: p.id,
          cell: p.cell,
          status: p.statusCode,
          situation: p.situationCode,
          canAct: p.canAct,
          tackleZone: p.tackleZone,
          movement: p.movementRemaining,
          effectsEmpty: p.effectsKnownEmpty,
          traits: p.traits
        }))
      }))
    }
  });
  return parsed.success && validScoringRushState(parsed.data)
    ? parsed.data
    : undefined;
}

export function observedScoringRush(
  event: ReplayEvent,
  step: ReplayEvent | undefined
): ScoringPriorRush | undefined {
  if (
    !step ||
    !ordinaryScoringMoveHeader(step) ||
    unmodifiedD6Check(event, 1, 1, true) !== 2 ||
    event.playerId !== step.stepActorId ||
    step.sourceTag !== "PlayerStep" ||
    step.stepType !== 1 ||
    step.payload?.Skill !== 0 ||
    step.payload.IsEvaluation !== 0 ||
    step.sourceIndex !== (event.sourceIndex ?? 0) - 1 ||
    event.locator?.messageIndex !== 0
  )
    return;
  const p = event.payload!,
    value = (p.Dice as { Die: { Value: number } }).Die.Value;
  // Step cells use the source's capitalized coordinates.
  const from = step.payload.CellFrom as { X?: number; Y?: number } | undefined,
    to = step.payload.CellTo as { X?: number; Y?: number } | undefined;
  const normalized = priorRush.safeParse({
    sourceId: event.id,
    sourceIndex: event.sourceIndex,
    stepSourceId: step.id,
    stepSourceIndex: step.sourceIndex,
    actionId: event.actionId,
    actorId: Number(event.playerId),
    from: { x: from?.X, y: from?.Y },
    to: { x: to?.X, y: to?.Y },
    face: value
  });
  return normalized.success ? normalized.data : undefined;
}

export function scoringRushSuccessors(s: ScoringRushState) {
  if (!validScoringRushState(s)) return;
  const own = s.frame.teams[s.ownRoster],
    opponent = s.frame.teams[1 - s.ownRoster]!;
  return {
    success: {
      kind: "touchdown" as const,
      actorCell: s.destination,
      actorStatus: 0 as const,
      ballCarrierId: s.actorId,
      ownScore: own.score + 1,
      opponentScore: opponent.score,
      phase: "drive_end" as const
    },
    failure: {
      kind: "fall_before_damage" as const,
      actorCell: s.destination,
      actorStatus: 1 as const,
      ballCarrierId: null,
      ownScore: own.score,
      opponentScore: opponent.score,
      phase: "turnover_pending" as const,
      pending: ["armor", "ball_bounce"] as ["armor", "ball_bounce"]
    }
  };
}
