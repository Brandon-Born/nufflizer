import {
  lastBoardCheckpointBefore,
  type ReplayBoardCheckpoint
} from "@/domain/replay/boardState";
import { unmodifiedD6Check } from "@/domain/replay/numericCheck";
import {
  sameObservedCell,
  scoreThrough
} from "@/domain/replay/scoreContinuity";
import type { ReplayEvent } from "@/domain/replay/types";
import { validReportedScoreEvidence } from "./committedScoringRush";
import type { DiceRecord } from "./diceEvidence";
import { immediateTouchdownComponents } from "./scoringRushImpact";
import type { LuckEvent, LuckReport } from "./types";

type Bounds = Extract<
  NonNullable<LuckEvent["contextualBounds"]>,
  {
    policy: "final_turn_scoring_rush_envelope";
  }
>;

function finalTurnAttempt(
  event: LuckEvent,
  teamTurns: readonly (number | null)[]
) {
  const m = event.metadata;
  const p = m.preRoll;
  const attempt = p?.scoringAttempt;
  const ownRoster = m.scoringAttemptScore?.ownRoster;
  const turnsPerPeriod = attempt?.turnsPerPeriod;
  if (
    event.scoringStatus !== "scored" ||
    event.actualSuccess !== true ||
    event.probabilitySuccess !== 5 / 6 ||
    event.type !== "movement_risk" ||
    m.probabilityPolicy !== "single_attempt" ||
    m.sourceTag !== "ResultRoll" ||
    m.rollType !== 1 ||
    m.requirement !== 2 ||
    m.difficulty !== 2 ||
    m.stepType !== 1 ||
    m.rerollUsed ||
    m.rerollResource ||
    m.rerollQuestionId ||
    m.rerollDecisionId ||
    m.rerollSkill ||
    m.rerollDraws ||
    (m.modifiers?.length ?? 0) > 0 ||
    !m.movementTouchdown ||
    !sameObservedCell(attempt?.destination, m.movementTouchdown.destination) ||
    p?.phaseCode !== 5 ||
    p.period !== "second_half" ||
    (p.activeTeamId !== null && p.activeTeamId !== event.teamId) ||
    p.actorCarriesBall !== true ||
    p.actorMovementRemaining !== 0 ||
    !turnsPerPeriod ||
    ownRoster === undefined ||
    attempt.turnsRemaining !== 0 ||
    attempt.teamTurn !== 2 * turnsPerPeriod ||
    teamTurns[ownRoster] !== attempt.teamTurn
  )
    return;
  const opposingTurn = teamTurns[1 - ownRoster];
  if (
    opposingTurn !== attempt.teamTurn &&
    opposingTurn !== attempt.teamTurn - 1
  )
    return;
  return attempt.teamTurn - opposingTurn;
}

function upperEndpoint(event: LuckEvent, remaining: number) {
  const { scores, ownRoster } = event.metadata.scoringAttemptScore!;
  const { touchdown, scorePressure } = immediateTouchdownComponents(
    scores[ownRoster],
    scores[1 - ownRoster]!,
    remaining
  );
  // The unobserved failure continuation can return anywhere from zero to
  // the same touchdown value. Each endpoint uses only the first die.
  return (touchdown + scorePressure) / 6;
}

export function observeFinalTurnScoringRush(
  event: LuckEvent,
  checkpoints: readonly ReplayBoardCheckpoint[],
  raw: ReadonlyMap<number, ReplayEvent>,
  teamIds: readonly string[]
): Bounds | undefined {
  const m = event.metadata;
  const score = m.scoringAttemptScore;
  const goal = m.movementTouchdown;
  if (
    !score ||
    !goal ||
    m.sourceIndex === undefined ||
    event.contextualImpact ||
    event.contextualBounds ||
    event.possessionBounds ||
    event.catchPossessionBounds
  )
    return;
  const roll = raw.get(m.sourceIndex);
  const before = lastBoardCheckpointBefore(checkpoints, m.sourceIndex);
  const board = before?.board;
  const owner = board?.teams[score.ownRoster];
  const observedTeamRerolls = owner?.rerolls;
  if (
    !roll ||
    unmodifiedD6Check(roll, 1, 1, true) !== 2 ||
    before?.afterSourceIndex !== score.checkpointAfter ||
    board?.periodCode !== 1 ||
    !board.standardPitchCompatible ||
    board.issues.length ||
    (board.activeTeamIndex !== null &&
      board.activeTeamIndex !== score.ownRoster) ||
    observedTeamRerolls == null ||
    observedTeamRerolls < 1
  )
    return;
  const remaining = finalTurnAttempt(
    event,
    board.teams.map((team) => team.gameTurn)
  );
  if (remaining === undefined) return;

  const confirmed = checkpoints.find(
    (cp) => cp.afterSourceIndex > goal.sourceIndex
  );
  const after =
    confirmed &&
    scoreThrough(checkpoints, raw, confirmed.afterSourceIndex, teamIds);
  const confirmedGoal = after?.touchdowns.at(-1);
  if (
    !after ||
    after.touchdowns.length !== score.touchdowns.length + 1 ||
    confirmedGoal?.sourceIndex !== goal.sourceIndex ||
    confirmedGoal.roster !== score.ownRoster ||
    String(confirmedGoal.scorerId) !== event.playerId
  )
    return;
  return {
    policy: "final_turn_scoring_rush_envelope",
    successChance: 5 / 6,
    observedTeamRerolls,
    confirmedGoal,
    lower: 0,
    upper: upperEndpoint(event, remaining)
  };
}

export function validReportedFinalTurnScoringRush(
  event: LuckEvent,
  report: LuckReport,
  die: DiceRecord | undefined
) {
  const bound = event.contextualBounds;
  if (bound?.policy !== "final_turn_scoring_rush_envelope") return true;
  const m = event.metadata;
  const score = m.scoringAttemptScore;
  if (
    !score ||
    m.sourceIndex === undefined ||
    die?.status !== 1 ||
    die.newRoll !== 1 ||
    die.stepActorId !== event.playerId ||
    die.rollType !== 1 ||
    die.dice.length !== 1 ||
    die.dice[0]?.dieType !== 0 ||
    (die.dice[0]?.value ?? 0) < 2
  )
    return false;
  const snapshots = report.rerollResources.flow.clockSnapshots;
  const beforeIndex = snapshots.findIndex(
    (f) => f.source.checkpointAfter === score.checkpointAfter
  );
  const before = snapshots[beforeIndex];
  const { confirmedGoal } = bound;
  if (
    !before?.clock ||
    before.clock.phaseCode !== 5 ||
    before.clock.periodCode !== 1 ||
    (before.clock.activeTeamIndex !== null &&
      before.clock.activeTeamIndex !== score.ownRoster) ||
    before.counts[score.ownRoster] !== bound.observedTeamRerolls ||
    before.poolNamespaces[score.ownRoster]?.teamId !== event.teamId ||
    snapshots[beforeIndex + 1]?.source.checkpointAfter !==
      confirmedGoal.confirmedCheckpointAfter ||
    confirmedGoal.sourceIndex !== m.movementTouchdown?.sourceIndex ||
    confirmedGoal.roster !== score.ownRoster ||
    String(confirmedGoal.scorerId) !== event.playerId
  )
    return false;
  const remaining = finalTurnAttempt(event, before.clock.teamTurns);
  if (
    remaining === undefined ||
    bound.upper !== upperEndpoint(event, remaining)
  )
    return false;
  const scores: [number, number] = [...score.scores];
  scores[score.ownRoster]!++;
  return validReportedScoreEvidence(
    report,
    {
      scores,
      touchdowns: [...score.touchdowns, confirmedGoal]
    },
    confirmedGoal.confirmedCheckpointAfter
  );
}
