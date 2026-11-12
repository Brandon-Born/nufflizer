import { currentMoveActor, isDeterministicMoveResult, preservesCurrentMoveEnd } from "./currentMoveActor";
import { buildPlayerOwnershipIndex } from "./attribution";
import { unmodifiedD6Check } from "./numericCheck";
import {
  findCombinedMovements,
  type CombinedMovement
} from "./combinedMovement";
import type { ObservedPickupAfterMovement } from "./pickupAfterMovement";
import {
  recordedZoneD6Check,
  observedZoneMarkers,
  type RecordedZoneCheck
} from "./zoneD6Check";
import { observedActorRoster } from "./observedActorRoster";
import {
  failedMovementOffer,
  sameMovementActor,
  actualMoveGeometry,
  type ObservedTeamRerollMovement
} from "./teamRerollMovement";
import {
  pickupBounceSuccessors,
  plainPickupMoveOutcome,
  plainBounceSettlementKnown,
  type PickupBounceSuccessors
} from "./pickupSuccessors";
import {
  unmodifiedDodgeDie,
  successfulDodgeMoveOutcome,
  successfulSingleCheckMoveOutcome,
  type ObservedDodgeMovement
} from "./dodgeMovement";
import {
  activeMoveAfterDodge,
  type ActiveMoveContinuation
} from "./activeMoveContinuation";
import {
  ordinaryMovesAfterSuccess,
  ordinaryMovesAtPickup,
  type OrdinaryMoveCandidates,
  type OrdinaryMoveAvailability
} from "./ordinaryMoveAvailability";
import { checkpointClockEpochs } from "./boardState";
import {
  applyObservedMentalEffects,
  recordedMentalEffect,
  mentalTraitTest,
  type MentalEffectEnd
} from "./mentalEffects";
import {
  applyActivationEnds,
  findMentalActivationEnds,
  sameActivationClock,
  type ActivationEnd
} from "./activationEnds";
import type {
  ObservedBoard,
  ObservedCell,
  ObservedPlayer,
  ReplayBoardCheckpoint
} from "./boardState";
import type { ReplayEvent, ReplayModel } from "./types";
import {
  applyKnownActivationLosses,
  findConfirmedActivationLosses,
  type ConfirmedActivationLoss
} from "./activationLosses";

type Cell = { x: number; y: number };
export type PreRollEvidence = {
  pickupSuccessors?: PickupBounceSuccessors;
  pickupMoveAvailability?: OrdinaryMoveCandidates;
  pickupSettlementKnown?: boolean;
  actorDodgeMoveSourceId?: string;
  activeMoveContinuation?: ActiveMoveContinuation;
  ordinaryMoveAvailability?: OrdinaryMoveAvailability;
  suppressedTackleZones?: {
    playerId: string;
    rosterIndex: number;
    teamId: string | null;
    providerSkillId: 31 | 51;
  }[];
  actorMentalEffectEnd?: { sourceId: string; providerSkillId: 31 | 51 };
  endedActivationSourceIds?: string[];
  actorTackleZone?: boolean | null;
  actorRosterTeamId?: string;
  actorTraits?: NonNullable<ObservedPlayer["traits"]>;
  targetTraits?: NonNullable<ObservedPlayer["traits"]>;
  checkpointAfter: number;
  checkpointReplayStep?: number;
  phaseCode: number | null;
  period: "first_half" | "second_half" | "extra_time" | null;
  activeTeamId: string | null;
  teamTurn: number | null;
  turnsRemaining: number | null;
  activationId: string | null;
  actorCell: Cell | null;
  actorStandUpSourceIndex?: number;
  actorMovementRemaining?: number;
  actorPickupSourceId?: string;
  scoringAttempt?: {
    destination: Cell;
    sideCode: 32 | 64;
    teamTurn: number | null;
    turnsRemaining: number | null;
    turnsPerPeriod: number | null;
  };
  teammateCarrierMove?: {
    carrierCell: Cell;
    destination: Cell;
    effect: "approach" | "leave";
  };
  actorCarriesBall: boolean | null;
  carriedBallCell?: Cell;
  movementCheckLinked: boolean;
  otherUsefulActivations: number | null;
  pickupBounceExposure: number | null;
};

const NORMAL_TURN = 5;
const STANDING = 0;
const PRONE = 1;
function cell(value: ObservedCell | undefined): Cell | null {
  return value && value.x !== null && value.y !== null
    ? { x: value.x, y: value.y }
    : null;
}
function same(a: Cell | null, b: Cell | null): boolean {
  return !!a && !!b && a.x === b.x && a.y === b.y;
}
function pitch(p: Cell): boolean {
  return p.x >= 0 && p.x <= 25 && p.y >= 0 && p.y <= 14;
}
function neighbors(p: Cell): Cell[] {
  return [-1, 0, 1].flatMap((x) =>
    [-1, 0, 1]
      .filter((y) => x !== 0 || y !== 0)
      .map((y) => ({ x: p.x + x, y: p.y + y }))
  );
}
function distance(a: Cell, b: Cell): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
function key(p: Cell): number {
  return p.x * 15 + p.y;
}
function stepCell(value: unknown): Cell | null {
  const raw = value as { X?: unknown; Y?: unknown } | null | undefined;
  return typeof raw?.X === "number" &&
    Number.isInteger(raw.X) &&
    typeof raw.Y === "number" &&
    Number.isInteger(raw.Y)
    ? { x: raw.X, y: raw.Y }
    : null;
}
function id(value: string | undefined): number | null {
  return value && /^\d{1,12}$/.test(value) ? Number(value) : null;
}

function verifiedMovementSuccess(event: ReplayEvent): boolean {
  const p = event.payload;
  const die = (
    p?.Dice as { Die?: { Value?: unknown; DieType?: unknown } } | undefined
  )?.Die;
  const face = die?.Value;
  const target = p?.Difficulty;
  return (
    p?.Outcome === 1 &&
    p.NewRoll === 1 &&
    p.Status === 1 &&
    die?.DieType === 0 &&
    typeof face === "number" &&
    Number.isInteger(face) &&
    typeof target === "number" &&
    Number.isInteger(target) &&
    target >= 2 &&
    face <= 6 &&
    face >= target
  );
}

function changePlayer(
  board: ObservedBoard,
  playerId: number,
  update: (p: ObservedPlayer) => ObservedPlayer
): ObservedBoard {
  return {
    ...board,
    teams: board.teams.map((t) =>
      t.players.some((p) => p.id === playerId)
        ? {
            ...t,
            players: t.players.map((p) => (p.id === playerId ? update(p) : p))
          }
        : t
    )
  };
}

function summarize(
  board: ObservedBoard,
  checkpoint: ReplayBoardCheckpoint,
  event: ReplayEvent,
  step: ReplayEvent | undefined,
  activationId: string | null,
  activationActionCode: number | undefined,
  standardPitch: boolean,
  smallPitchObserved: boolean,
  standUpSourceIndex: number | undefined,
  pickupSourceId: string | undefined,
  ordinaryMoveDeclaration: string | undefined,
  pickupMoveDeclaration: string | undefined,
  lastMoveSource: { id: string; index: number } | undefined,
  pickupGeometryTrusted: boolean,
  knownTeamIds: readonly string[]
): PreRollEvidence {
  const actorId = id(event.playerId);
  const active = board.teams.find(
    (t) => t.rosterIndex === board.activeTeamIndex
  );
  const activeTeamId =
    active?.explicitTeamId === null || active?.explicitTeamId === undefined
      ? null
      : String(active.explicitTeamId);
  const actorTeam = board.teams.find(
    (t) => actorId !== null && t.players.some((p) => p.id === actorId)
  );
  const actor = actorTeam?.players.find((p) => p.id === actorId);
  const targetId = id(event.targetId);
  const targetTeam = board.teams.find(
    (t) => targetId !== null && t.players.some((p) => p.id === targetId)
  );
  const target = targetTeam?.players.find((p) => p.id === targetId);
  const actorObserved =
    actorTeam?.explicitTeamId !== null &&
    actorTeam?.explicitTeamId !== undefined &&
    String(actorTeam.explicitTeamId) === event.actorTeamId &&
    !event.attributionConflict;
  const actorTraits = actorObserved ? (actor?.traits ?? undefined) : undefined;
  const actorCell =
    actor?.pitchLocation === "on_pitch" ? cell(actor.cell) : null;
  const owned =
    active &&
    actorTeam === active &&
    activeTeamId !== null &&
    event.actorTeamId === activeTeamId &&
    event.actorTeamSource !== "turn_inferred" &&
    !event.attributionConflict;
  const normal = board.phaseCode === NORMAL_TURN && board.stable === true;
  const period =
    board.periodCode === 0
      ? "first_half"
      : board.periodCode === 1
        ? "second_half"
        : board.periodCode === 2
          ? "extra_time"
          : null;
  const teamTurn =
    normal && owned && active.gameTurn !== null && active.gameTurn > 0
      ? active.gameTurn
      : null;
  const endOfPeriod =
    board.periodCode !== null &&
    board.periodCode <= 2 &&
    board.turnsPerPeriod &&
    board.turnsPerPeriod <= 16
      ? (board.periodCode + 1) * board.turnsPerPeriod
      : null;
  const turnsRemaining =
    teamTurn !== null &&
    endOfPeriod !== null &&
    teamTurn <= endOfPeriod &&
    teamTurn > endOfPeriod - board.turnsPerPeriod!
      ? endOfPeriod - teamTurn
      : null;
  const allPlayers = board.teams.flatMap((t) => t.players);
  const positionsKnown =
    allPlayers.length > 0 &&
    allPlayers.every((p) => p.id !== null && p.pitchLocation !== "unknown");
  const occupied = new Set(
    allPlayers.flatMap((p) =>
      p.pitchLocation === "on_pitch" ? [key(cell(p.cell)!)] : []
    )
  );
  const consistentGeometry =
    !smallPitchObserved &&
    positionsKnown &&
    occupied.size ===
      allPlayers.filter((p) => p.pitchLocation === "on_pitch").length;
  let otherUsefulActivations: number | null = null;
  if (normal && owned && consistentGeometry && actorCell) {
    otherUsefulActivations = 0;
    for (const player of active.players) {
      if (
        player.id === actorId ||
        player.pitchLocation === "off_pitch" ||
        player.canAct === false ||
        (player.situationCode !== null && player.situationCode !== 0)
      )
        continue;
      if (player.mentalEffect) {
        otherUsefulActivations = null;
        break;
      }
      // These count ordinary standing movement opportunities only. Unknown
      // posture/availability cannot be interpreted as a spent activation.
      if (
        player.ordinaryMovePolicyKnown !== true ||
        player.canAct === null ||
        player.statusCode === null ||
        player.situationCode === null ||
        (player.canAct &&
          player.statusCode === STANDING &&
          player.movementRemaining === null)
      ) {
        otherUsefulActivations = null;
        break;
      }
      if (
        player.canAct &&
        player.statusCode === STANDING &&
        (player.movementRemaining ?? 0) > 0 &&
        neighbors(cell(player.cell)!).some(
          (p) => pitch(p) && !occupied.has(key(p))
        )
      )
        otherUsefulActivations++;
    }
  }
  let pickupBounceExposure: number | null = null;
  const rollType =
    event.rollType ??
    (event.payload?.RollInfos as { RollType?: unknown } | undefined)?.RollType;
  if (
    rollType === 4 &&
    pickupGeometryTrusted &&
    normal &&
    owned &&
    consistentGeometry &&
    actorCell &&
    board.ball.possession === "not_held" &&
    same(cell(board.ball.cell), actorCell) &&
    same(stepCell(step?.payload?.CellTo), actorCell)
  ) {
    const landings = neighbors(actorCell);
    const opponents = board.teams
      .filter((t) => t !== active)
      .flatMap((t) => t.players)
      .filter((p) => p.pitchLocation === "on_pitch");
    if (
      plainBounceSettlementKnown(board) &&
      landings.every((p) => pitch(p) && !occupied.has(key(p))) &&
      opponents.every((p) => p.tackleZone !== null)
    ) {
      pickupBounceExposure =
        landings.filter((p) =>
          opponents.some(
            (opponent) =>
              opponent.tackleZone === true &&
              Math.max(
                Math.abs(p.x - opponent.cell.x!),
                Math.abs(p.y - opponent.cell.y!)
              ) === 1
          )
        ).length / 8;
    }
  }
  const pickupSuccessors =
    rollType === 4 &&
    pickupGeometryTrusted &&
    actorId !== null &&
    actorCell &&
    pickupMoveDeclaration &&
    lastMoveSource &&
    lastMoveSource.index === event.sourceIndex! - 1 &&
    !smallPitchObserved &&
    event.actorTeamId !== undefined &&
    event.actorTeamSource !== "turn_inferred" &&
    !event.attributionConflict &&
    step?.sourceTag === "PlayerStep" &&
    step.stepType === 1 &&
    step.stepActorId === event.playerId &&
    step.actionId === event.actionId &&
    step.payload?.Skill === 0 &&
    step.payload.IsEvaluation === 0 &&
    same(stepCell(step.payload.CellTo), actorCell)
      ? pickupBounceSuccessors(
          board,
          actorId,
          pickupMoveDeclaration,
          lastMoveSource.id,
          event.actorTeamId!,
          knownTeamIds
        )
      : undefined;
  const destination = stepCell(step?.payload?.CellTo);
  const movementCheckLinked =
    rollType === 2 &&
    normal &&
    Boolean(owned) &&
    consistentGeometry &&
    step?.sourceTag === "PlayerStep" &&
    step.stepType === 1 &&
    step.payload?.IsEvaluation === 0 &&
    step.payload.Skill === 0 &&
    step.stepActorId === event.playerId &&
    step.actionId !== undefined &&
    step.actionId === event.actionId &&
    same(actorCell, stepCell(step.payload?.CellFrom)) &&
    Boolean(
      actorCell &&
      destination &&
      pitch(destination) &&
      distance(actorCell, destination) === 1 &&
      !occupied.has(key(destination))
    );
  const ordinaryMoveAvailability =
    movementCheckLinked && destination && actorId !== null
      ? ordinaryMovesAfterSuccess(board, actorId, destination)
      : undefined;
  if (ordinaryMoveAvailability)
    otherUsefulActivations = ordinaryMoveAvailability.unknownPlayerIds.length
      ? null
      : ordinaryMoveAvailability.knownAvailablePlayerIds.length;
  const knownNonCarrier =
    board.ball.possession === "not_held" ||
    (board.ball.possession === "held" && board.ball.carrierId !== actorId);
  const activeMoveContinuation =
    movementCheckLinked &&
    destination &&
    actorId !== null &&
    ordinaryMoveDeclaration &&
    knownNonCarrier &&
    activationId === ordinaryMoveDeclaration &&
    activationActionCode === 1
      ? activeMoveAfterDodge(
          board,
          actorId,
          destination,
          ordinaryMoveDeclaration
        )
      : undefined;
  const carrierCell = cell(board.ball.cell);
  let scoringAttempt: PreRollEvidence["scoringAttempt"];
  if (
    normal &&
    standardPitch &&
    board.pitchLayout !== "small" &&
    activationId &&
    activationActionCode === 1 &&
    actorId !== null &&
    actorId === board.activePlayerId &&
    actorTeam &&
    (board.activeTeamIndex === null || active === actorTeam) &&
    (actorTeam.explicitTeamId === null ||
      String(actorTeam.explicitTeamId) === event.actorTeamId) &&
    (event.actorTeamSource === "player_map" ||
      event.actorTeamSource === "explicit") &&
    event.actorTeamId !== undefined &&
    !event.attributionConflict &&
    board.ball.possession === "held" &&
    board.ball.carrierId === actorId &&
    consistentGeometry &&
    actorCell &&
    destination &&
    pitch(destination) &&
    distance(actorCell, destination) === 1 &&
    !occupied.has(key(destination)) &&
    step?.sourceTag === "PlayerStep" &&
    step.stepType === 1 &&
    step.actionId !== undefined &&
    step.actionId === event.actionId &&
    step.stepActorId === event.playerId &&
    step.payload?.IsEvaluation === 0 &&
    same(actorCell, stepCell(step.payload.CellFrom)) &&
    (rollType === 1 || rollType === 2) &&
    ((actorTeam.sideCode === 32 && destination.x === 25) ||
      (actorTeam.sideCode === 64 && destination.x === 0))
  ) {
    const counter = actorTeam.gameTurn;
    const actorTurn = counter !== null && counter > 0 ? counter : null;
    const remaining =
      actorTurn !== null &&
      endOfPeriod !== null &&
      actorTurn <= endOfPeriod &&
      actorTurn > endOfPeriod - board.turnsPerPeriod!
        ? endOfPeriod - actorTurn
        : null;
    scoringAttempt = {
      destination,
      sideCode: actorTeam.sideCode as 32 | 64,
      teamTurn: actorTurn,
      turnsRemaining: remaining,
      turnsPerPeriod:
        board.turnsPerPeriod !== null &&
        board.turnsPerPeriod >= 1 &&
        board.turnsPerPeriod <= 16
          ? board.turnsPerPeriod
          : null
    };
  }
  let teammateCarrierMove: PreRollEvidence["teammateCarrierMove"];
  if (
    movementCheckLinked &&
    actorCell &&
    destination &&
    carrierCell &&
    board.ball.possession === "held" &&
    board.ball.holderRosterIndex === active?.rosterIndex &&
    board.ball.carrierId !== actorId
  ) {
    const fromAdjacent = distance(actorCell, carrierCell) === 1;
    const toAdjacent = distance(destination, carrierCell) === 1;
    if (fromAdjacent !== toAdjacent)
      teammateCarrierMove = {
        carrierCell,
        destination,
        effect: toAdjacent ? "approach" : "leave"
      };
  }
  const suppressedTackleZones = board.teams.flatMap((t) =>
    t.players.flatMap((p) =>
      p.mentalEffect &&
      p.tackleZone === false &&
      p.pitchLocation === "on_pitch" &&
      p.id !== null
        ? [
            {
              playerId: String(p.id),
              rosterIndex: t.rosterIndex,
              teamId:
                t.explicitTeamId === null ? null : String(t.explicitTeamId),
              providerSkillId: p.mentalEffect.providerSkillId
            }
          ]
        : []
    )
  );
  return {
    activeMoveContinuation,
    pickupSuccessors,
    pickupMoveAvailability:
      pickupSuccessors && owned && actorId !== null
        ? ordinaryMovesAtPickup(board, actorId)
        : undefined,
    pickupSettlementKnown:
      rollType === 4 && consistentGeometry
        ? plainBounceSettlementKnown(board)
        : undefined,
    ordinaryMoveAvailability,
    suppressedTackleZones: suppressedTackleZones.length
      ? suppressedTackleZones
      : undefined,
    actorTackleZone:
      actor?.pitchLocation === "on_pitch" ? actor.tackleZone : undefined,
    actorRosterTeamId:
      actorTeam?.explicitTeamId == null
        ? undefined
        : String(actorTeam.explicitTeamId),
    actorTraits,
    targetTraits:
      actorObserved &&
      targetId !== actorId &&
      targetTeam?.explicitTeamId !== null
        ? (target?.traits ?? undefined)
        : undefined,
    checkpointAfter: checkpoint.afterSourceIndex,
    checkpointReplayStep: checkpoint.replayStep ?? undefined,
    phaseCode: board.phaseCode,
    period,
    activeTeamId,
    teamTurn,
    turnsRemaining,
    activationId,
    actorCell,
    actorStandUpSourceIndex:
      actorId !== null && board.activePlayerId === actorId
        ? standUpSourceIndex
        : undefined,
    actorMovementRemaining:
      actorCell &&
      board.activePlayerId === actorId &&
      actor?.movementRemaining !== null &&
      actor?.movementRemaining !== undefined &&
      Number.isInteger(actor.movementRemaining) &&
      actor.movementRemaining >= 0 &&
      actor.movementRemaining <= 16
        ? (actor?.movementRemaining ?? undefined)
        : undefined,
    actorPickupSourceId:
      actorId !== null && board.ball.carrierId === actorId
        ? pickupSourceId
        : undefined,
    scoringAttempt,
    teammateCarrierMove,
    carriedBallCell:
      board.ball.possession === "held" &&
      board.ball.carrierId === actorId &&
      same(cell(board.ball.cell), actorCell)
        ? cell(board.ball.cell)!
        : undefined,
    actorCarriesBall:
      board.ball.possession === "unknown"
        ? null
        : board.ball.possession === "held" && board.ball.carrierId === actorId,
    movementCheckLinked,
    otherUsefulActivations,
    pickupBounceExposure
  };
}

// Replay only verified transitions from ordered snapshots. Store compact
// evidence per roll, not a copy of the board at every source event.
export function reconstructReplayContext(
  replay: ReplayModel,
  confirmedLosses: readonly ConfirmedActivationLoss[] = findConfirmedActivationLosses(
    replay
  )
) {
  const result = new Map<string, PreRollEvidence>();
  const dodgeMovements = new Map<string, ObservedDodgeMovement>();
  const teamRerollMovements = new Map<string, ObservedTeamRerollMovement>();
  const combinedMovements = new Map<string, CombinedMovement>();
  const combinedByOutcome = findCombinedMovements(replay);
  const pickupsAfterMovement = new Map<string, ObservedPickupAfterMovement>();
  const pickupResolutions = new Map<
    string,
    {
      declarationSourceId: string;
      moveOutcomeSourceId: string;
      cell: Cell;
      movementRemaining: number | null;
      checkpointAfter: number;
    }
  >();
  const activationEnds = new Map<string, ActivationEnd>();
  const mentalEffectEnds = new Map<string, MentalEffectEnd>();
  const mentalSkillUses = new Map<string, 31 | 51>();
  const mentalTraitResults = new Map<
    string,
    {
      providerSkillId: 31 | 51;
      effectEndSourceId: string;
      skillSourceId: string;
      success: boolean;
    }
  >();
  if (replay.replayVersion !== "1-4-0-0")
    return {
      preRollEvidence: result,
      dodgeMovements,
      teamRerollMovements,
      combinedMovements,
      pickupsAfterMovement,
      pickupResolutions,
      activationEnds,
      mentalEffectEnds,
      mentalSkillUses,
      mentalTraitResults
    };
  const checkpoints = replay.boardCheckpoints ?? [];
  const initialOwnership = buildPlayerOwnershipIndex(replay);
  const replayTeamIds = replay.teams.map(t=>t.id);
  const epochs = checkpointClockEpochs(checkpoints);
  let activationEpoch: number | undefined;
  let activationCheckpointAfter: number | undefined;
  let standardPitch = false;
  let smallPitchObserved = false;
  let cursor = 0;
  let checkpoint: ReplayBoardCheckpoint | undefined;
  let board: ObservedBoard | null = null;
  let step: ReplayEvent | undefined;
  let activationId: string | null = null;
  let activationActionCode: number | undefined;
  let moveObserved = false;
  let moveOutcomeSourceIndex: number | undefined;
  let moveOutcomeSourceId: string | undefined;
  let plainDoMoveSourceIndex: number | undefined;
  let pickupGeometryTrusted = false;
  let standUpPending = false;
  let standUpSourceIndex: number | undefined;
  let qualifiedMoveTeamId: string | undefined;
  let pickupSourceId: string | undefined;
  let blockDeclarationActionId: string | undefined;
  let foulAppearanceActionId: string | undefined;
  let mentalActivationPending = false;
  let actorEffectEnd:
    | {
        sourceId: string;
        providerSkillId: 31 | 51;
        actorId: string;
        actionId: string;
        skillObserved: boolean;
        skillSourceId?: string;
        resolved: boolean;
      }
    | undefined;
  const lossesByConfirmation = new Map(
    confirmedLosses.map((loss) => [loss.followingActivationSourceId, loss])
  );
  const mentalEnds = new Map(
    findMentalActivationEnds(replay).map((end) => [end.sourceId, end])
  );
  let activeEnds = new Map<string, ActivationEnd>();
  let previousMove: { end: ActivationEnd; moved: boolean; deterministic?: boolean; waitCheckpoint?: ReplayBoardCheckpoint } | undefined;
  let actorDodgeMoveSourceId: string | undefined;
  let lastTeamMovement:
    | {
        sourceId: string;
        outcome: ReplayEvent;
        movement: ObservedTeamRerollMovement;
      }
    | undefined;
  let teamOffer:
    | {
        question: ReplayEvent;
        threshold: number;
        family: 1 | 2;
        check: RecordedZoneCheck;
        from: Cell;
        to: Cell;
        declarationSourceId: string;
        checkpointAfter: number;
        epoch: number | undefined;
      }
    | undefined;
  let pendingTeamMove:
    | {
        offer: NonNullable<typeof teamOffer>;
        board: ObservedBoard;
        choice: ReplayEvent;
        lastIndex: number;
        checkpointAfter: number;
        stage: "replacement" | "do_move" | "outcome";
        replacementSourceId?: string;
        doMoveSourceId?: string;
        zonePenalty?: ObservedTeamRerollMovement["zonePenalty"];
      }
    | undefined;
  let pendingPickup:
    | {
        board: ObservedBoard;
        original: ReplayEvent;
        threshold: number;
        lastIndex: number;
        stage: "skill" | "replacement";
        declarationSourceId: string;
        moveOutcomeSourceId: string;
        checkpointAfter: number;
        afterMovement?: {
          movementSourceId: string;
          check: RecordedZoneCheck;
          skillSourceId?: string;
        };
      }
    | undefined;
  let pendingDodge:
    | {
        board: ObservedBoard;
        original: ReplayEvent;
        threshold: number;
        from: Cell;
        to: Cell;
        declarationSourceId: string;
        checkpointAfter: number;
        lastIndex: number;
        stage: "skill" | "replacement" | "do_move" | "outcome";
        replacementSourceId?: string;
        doMoveSourceId?: string;
      }
    | undefined;
  let activeLosses = new Map<string, ConfirmedActivationLoss>();
  for (const turn of replay.turns)
    for (const originalEvent of turn.events) {
      let event=originalEvent;
      if (event.sourceIndex === undefined) continue;
      let frameChanged = false;
      while (
        cursor < checkpoints.length &&
        checkpoints[cursor]!.afterSourceIndex < event.sourceIndex
      ) {
        checkpoint = checkpoints[cursor++]!;
        if(previousMove && (previousMove.end.rosterCheckpointAfter !== undefined || previousMove.end.completionCheckpointAfter !== undefined)) {
          if(previousMove.waitCheckpoint !== checkpoint)previousMove=undefined;
          else previousMove.waitCheckpoint=undefined;
        } else if(previousMove)previousMove.deterministic=false;
        frameChanged = true;
        if (pendingDodge || pendingPickup || pendingTeamMove) {
          previousMove = undefined;
          activationId = null;
        }
        pendingDodge = undefined;
        pendingPickup = undefined;
        pendingTeamMove = undefined;
        lastTeamMovement = undefined;
        actorDodgeMoveSourceId = undefined;
        const next = checkpoint.board;
        if (checkpoint.kind === "initial")
          standardPitch = next?.pitchLayout === "standard";
        if (next?.pitchLayout === "small") {
          standardPitch = false;
          smallPitchObserved = true;
        }
        if (
          !board ||
          !next ||
          next.activePlayerId !== board.activePlayerId ||
          next.activeTeamIndex !== board.activeTeamIndex ||
          next.periodCode !== board.periodCode
        )
          activationId = null;
        board =
          next && next.teams.length === 2 && next.issues.length === 0
            ? applyObservedMentalEffects(next)
            : null;
        pickupGeometryTrusted = !!board;
        actorEffectEnd = undefined;
        mentalActivationPending = false;
        moveObserved = false;
        moveOutcomeSourceIndex = undefined;
        moveOutcomeSourceId = undefined;
        plainDoMoveSourceIndex = undefined;
        standUpPending = false;
        standUpSourceIndex = undefined;
        pickupSourceId = undefined;
        blockDeclarationActionId = undefined;
        foulAppearanceActionId = undefined;
      }
      const confirmed = event.id
        ? lossesByConfirmation.get(event.id)
        : undefined;
      if (confirmed) activeLosses.set(confirmed.actorId, confirmed);
      if (board && (frameChanged || confirmed)) {
        const reduced = applyKnownActivationLosses(board, activeLosses);
        board = reduced.board;
        activeLosses = reduced.losses;
      }
      const mentalEnd = event.id ? mentalEnds.get(event.id) : undefined;
      if (mentalEnd) {
        activeEnds.set(mentalEnd.actorId, mentalEnd);
        activationEnds.set(mentalEnd.sourceId, mentalEnd);
      }
      if (board && (frameChanged || mentalEnd)) {
        const reduced = applyActivationEnds(board, activeEnds);
        board = reduced.board;
        activeEnds = reduced.ends;
        if (previousMove && !sameActivationClock(board, previousMove.end))
          previousMove = undefined;
      }
      if (frameChanged && !board) {
        activeLosses.clear();
        activeEnds.clear();
        previousMove = undefined;
      }
      const combined = event.id ? combinedByOutcome.get(event.id) : undefined;
      if (combined) {
        const p = combined.proof,
          actor = Number(combined.step.playerId);
        combinedMovements.set(p.dodgeSourceId, p);
        // This receipt establishes a physical two-check result. It cannot
        // repair an earlier unresolved declaration, skill choice or clock.
        board = p.dodgeSucceeded
          ? changePlayer(
              applyObservedMentalEffects(combined.board),
              actor,
              (player) => ({ ...player, cell: p.to })
            )
          : null;
        if (board) board = { ...board, stable: null };
        if (board && p.carriedBallBefore === true)
          board = { ...board, ball: { ...board.ball, cell: p.to } };
        if (board && p.policy === "team_rush_then_dodge")
          board = {
            ...board,
            teams: board.teams.map((t) =>
              t.players.some((player) => player.id === actor)
                ? { ...t, rerolls: null }
                : t
            )
          };
        step = combined.step;
        activationId = null;
        activationActionCode = undefined;
        activationEpoch = undefined;
        activationCheckpointAfter = undefined;
        previousMove = undefined;
        actorDodgeMoveSourceId = undefined;
        pickupSourceId = undefined;
        qualifiedMoveTeamId = undefined;
        pendingDodge = undefined;
        pendingPickup = undefined;
        pendingTeamMove = undefined;
        teamOffer = undefined;
        lastTeamMovement = undefined;
        moveObserved = false;
        moveOutcomeSourceIndex = event.sourceIndex;
        moveOutcomeSourceId = undefined;
        plainDoMoveSourceIndex = undefined;
        pickupGeometryTrusted = false;
        continue;
      }
      if (teamOffer && teamOffer.epoch !== epochs.get(checkpoint!))
        teamOffer = undefined;
      if (pendingTeamMove) {
        const pending = pendingTeamMove,
          offer = pending.offer,
          p = event.payload;
        const sameChain =
          !!event.id &&
          sameMovementActor(offer.question, event) &&
          event.sourceIndex === pending.lastIndex + 1 &&
          event.actionId === pending.choice.actionId &&
          event.sequenceId === pending.choice.sequenceId;
        let accepted = false;
        if (
          sameChain &&
          pending.stage === "replacement" &&
          (offer.family === 1
            ? unmodifiedD6Check(event, 1, 2, true) === offer.threshold
            : JSON.stringify(recordedZoneD6Check(event, 2, 2, true)) ===
              JSON.stringify(offer.check))
        ) {
          pending.replacementSourceId = event.id;
          pending.stage = "do_move";
          accepted = true;
        } else if (
          sameChain &&
          pending.stage === "do_move" &&
          event.sourceTag === "ResultDoMove" &&
          (!p || Object.keys(p).length === 0)
        ) {
          pending.doMoveSourceId = event.id;
          pending.stage = "outcome";
          accepted = true;
        } else if (
          sameChain &&
          pending.stage === "outcome" &&
          successfulSingleCheckMoveOutcome(event, offer.family) &&
          event.id
        ) {
          const actor = Number(offer.question.playerId),
            owner = pending.board.teams.find((t) =>
              t.players.some((p) => p.id === actor)
            )!;
          const player = owner.players.find((p) => p.id === actor)!,
            budget = player.movementRemaining;
          const movementAfter =
            budget === null ? null : budget - (offer.family === 2 ? 1 : 0);
          board = changePlayer(pending.board, actor, (p) => ({
            ...p,
            cell: offer.to,
            movementRemaining: movementAfter
          }));
          const carriesBall =
            board.ball.possession === "unknown"
              ? null
              : board.ball.possession === "held" &&
                board.ball.carrierId === actor;
          if (carriesBall)
            board = { ...board, ball: { ...board.ball, cell: offer.to } };
          teamRerollMovements.set(pending.replacementSourceId!, {
            rollType: offer.family,
            gamerId: pending.choice.payload!.GamerId as 0 | 1,
            questionSourceId: offer.question.id!,
            decisionSourceId: pending.choice.id!,
            declarationSourceId: offer.declarationSourceId,
            doMoveSourceId: pending.doMoveSourceId!,
            outcomeSourceId: event.id,
            originalCheckpointAfter: offer.checkpointAfter,
            checkpointAfter: pending.checkpointAfter,
            from: offer.from,
            to: offer.to,
            movementBefore: budget,
            movementAfter,
            carriesBall,
            ...(pending.zonePenalty ? { zonePenalty: pending.zonePenalty } : {})
          });
          lastTeamMovement = {
            sourceId: pending.replacementSourceId!,
            outcome: event,
            movement: teamRerollMovements.get(pending.replacementSourceId!)!
          };
          // Re-establish completion provenance only when its original clock and
          // current roster are known. This does not invent playable stability.
          if (
            owner.explicitTeamId !== null &&
            owner.gameTurn !== null &&
            owner.gameTurn > 0
          )
            previousMove = {
              moved: true,
              end: {
                kind: "ordinary_move_completed",
                sourceId: offer.declarationSourceId,
                sourceIndex: offer.question.sourceIndex!,
                declarationSourceId: offer.declarationSourceId,
                actorId: String(actor),
                teamId: String(owner.explicitTeamId),
                rosterIndex: owner.rosterIndex,
                teamTurn: owner.gameTurn,
                periodCode: board.periodCode,
                actorCell: offer.to,
                followingPlayerId: "",
                checkpointAfter: pending.checkpointAfter,
                moveSourceId: event.id
              }
            };
          moveObserved = false;
          moveOutcomeSourceIndex = event.sourceIndex;
          moveOutcomeSourceId = undefined;
          pickupGeometryTrusted = false;
          pendingTeamMove = undefined;
          continue;
        }
        if (accepted) {
          pending.lastIndex = event.sourceIndex;
          continue;
        }
        pendingTeamMove = undefined;
        board = null;
        previousMove = undefined;
        activationId = null;
        activeEnds.clear();
        activeLosses.clear();
        actorDodgeMoveSourceId = undefined;
        pickupSourceId = undefined;
        actorEffectEnd = undefined;
        mentalActivationPending = false;
        pickupGeometryTrusted = false;
        continue;
      }
      if (
        teamOffer &&
        event.sourceTag !== "Carrier" &&
        event.sourceTag !== "PlayerStep" &&
        event.sourceTag !== "ResultTeamRerollUsage"
      )
        teamOffer = undefined;
      if (
        teamOffer &&
        ((event.sourceTag === "Carrier" && !event.checkpointCarrier) ||
          (event.sourceTag === "PlayerStep" &&
            (!sameMovementActor(teamOffer.question, event) ||
              event.payload?.IsEvaluation !== 0 ||
              event.payload.Skill !== 0 ||
              !same(stepCell(event.payload.CellFrom), teamOffer.from) ||
              !same(stepCell(event.payload.CellTo), teamOffer.to))))
      )
        teamOffer = undefined;
      if (pendingPickup) {
        const pending = pendingPickup,
          original = pending.original,
          p = event.payload;
        const sameChain =
          event.id &&
          event.sourceIndex === pending.lastIndex + 1 &&
          event.actionId === original.actionId &&
          event.sequenceId === original.sequenceId &&
          event.playerId === original.playerId &&
          event.stepActorId === original.stepActorId &&
          event.stepTargetId === original.stepTargetId &&
          event.targetId === original.targetId &&
          event.stepType === original.stepType &&
          event.stepTag === original.stepTag &&
          !event.attributionConflict &&
          event.actorTeamSource !== "turn_inferred" &&
          event.actorTeamId === original.actorTeamId &&
          (!event.teamId || event.teamId === original.actorTeamId);
        if (
          sameChain &&
          pending.stage === "skill" &&
          event.sourceTag === "ResultSkillUsage" &&
          p?.Skill === 61 &&
          p.Used === 1 &&
          String(p.PlayerId) === original.playerId &&
          Object.keys(p).every((k) => ["Skill", "Used", "PlayerId"].includes(k))
        ) {
          pending.stage = "replacement";
          if (pending.afterMovement)
            pending.afterMovement.skillSourceId = event.id;
          pending.lastIndex = event.sourceIndex;
          continue;
        }
        if (
          sameChain &&
          pending.stage === "replacement" &&
          (pending.afterMovement
            ? JSON.stringify(recordedZoneD6Check(event, 4, 2, true)) ===
              JSON.stringify(pending.afterMovement.check)
            : unmodifiedD6Check(event, 4, 2, true) === pending.threshold)
        ) {
          const actor = Number(original.playerId),
            owner = pending.board.teams.find((t) =>
              t.players.some((p) => p.id === actor)
            )!;
          const player = owner.players.find((p) => p.id === actor)!;
          const position = { x: player.cell.x!, y: player.cell.y! };
          board = {
            ...pending.board,
            ball: {
              cell: position,
              carrierId: actor,
              holderRosterIndex: owner.rosterIndex,
              isHeld: true,
              possession: "held"
            }
          };
          pickupSourceId = event.id;
          if (pending.afterMovement)
            pickupsAfterMovement.set(event.id!, {
              movementSourceId: pending.afterMovement.movementSourceId,
              originalSourceId: original.id!,
              skillSourceId: pending.afterMovement.skillSourceId!,
              declarationSourceId: pending.declarationSourceId,
              moveOutcomeSourceId: pending.moveOutcomeSourceId,
              cell: position,
              movementRemaining: player.movementRemaining,
              checkpointAfter: pending.checkpointAfter,
              check: pending.afterMovement.check
            });
          else
            pickupResolutions.set(event.id!, {
              declarationSourceId: pending.declarationSourceId,
              moveOutcomeSourceId: pending.moveOutcomeSourceId,
              cell: position,
              movementRemaining: player.movementRemaining,
              checkpointAfter: pending.checkpointAfter
            });
          pendingPickup = undefined;
          continue;
        }
        pendingPickup = undefined;
        board = null;
        previousMove = undefined;
        activationId = null;
        activeEnds.clear();
        activeLosses.clear();
        actorDodgeMoveSourceId = undefined;
        pickupSourceId = undefined;
        actorEffectEnd = undefined;
        mentalActivationPending = false;
        pickupGeometryTrusted = false;
        continue;
      }
      if (pendingDodge) {
        const pending = pendingDodge;
        const original = pending.original;
        const owner = observedActorRoster(
          pending.board,
          Number(original.playerId),
          original.actorTeamId!,
          replay.teams.map((t) => t.id)
        );
        const sameChain =
          event.id &&
          event.sourceIndex === pending.lastIndex + 1 &&
          event.actionId === original.actionId &&
          event.sequenceId === original.sequenceId &&
          event.playerId === original.playerId &&
          event.stepActorId === original.stepActorId &&
          event.stepTargetId === original.stepTargetId &&
          event.targetId === original.targetId &&
          event.stepType === original.stepType &&
          event.stepTag === original.stepTag &&
          !event.attributionConflict &&
          event.actorTeamSource !== "turn_inferred" &&
          !!owner &&
          event.actorTeamId === original.actorTeamId &&
          (!event.teamId || event.teamId === event.actorTeamId);
        const p = event.payload;
        let accepted = false;
        if (
          sameChain &&
          pending.stage === "skill" &&
          event.sourceTag === "ResultSkillUsage" &&
          p?.Skill === 7 &&
          p.Used === 1 &&
          String(p.PlayerId) === original.playerId &&
          Object.keys(p).every((k) => ["Skill", "Used", "PlayerId"].includes(k))
        ) {
          pending.stage = "replacement";
          accepted = true;
        } else if (
          sameChain &&
          pending.stage === "replacement" &&
          unmodifiedDodgeDie(event, 2, true) === pending.threshold
        ) {
          pending.replacementSourceId = event.id;
          pending.stage = "do_move";
          accepted = true;
        } else if (
          sameChain &&
          pending.stage === "do_move" &&
          event.sourceTag === "ResultDoMove" &&
          (!p || Object.keys(p).length === 0)
        ) {
          pending.doMoveSourceId = event.id;
          pending.stage = "outcome";
          accepted = true;
        } else if (
          sameChain &&
          pending.stage === "outcome" &&
          successfulDodgeMoveOutcome(event)
        ) {
          const actor = Number(original.playerId);
          const player = owner!.players.find((p) => p.id === actor)!;
          const before = player.movementRemaining;
          board = changePlayer(pending.board, actor, (p) => ({
            ...p,
            cell: pending.to,
            movementRemaining: before === null ? null : before - 1
          }));
          const carriesBall =
            board.ball.possession === "unknown"
              ? null
              : board.ball.possession === "held" &&
                board.ball.carrierId === actor;
          if (carriesBall)
            board = { ...board, ball: { ...board.ball, cell: pending.to } };
          dodgeMovements.set(pending.replacementSourceId!, {
            declarationSourceId: pending.declarationSourceId,
            doMoveSourceId: pending.doMoveSourceId!,
            outcomeSourceId: event.id!,
            from: pending.from,
            to: pending.to,
            movementBefore: before,
            movementAfter: before === null ? null : before - 1,
            carriesBall,
            checkpointAfter: pending.checkpointAfter
          });
          actorDodgeMoveSourceId = pending.replacementSourceId;
          if (previousMove) {
            previousMove.moved = true;
            previousMove.end.moveSourceId = event.id;
            previousMove.end.actorCell = pending.to;
          }
          moveObserved = false;
          moveOutcomeSourceIndex = event.sourceIndex;
          moveOutcomeSourceId = undefined;
          pendingDodge = undefined;
          continue;
        }
        if (accepted) {
          pending.lastIndex = event.sourceIndex;
          continue;
        }
        // A chain interruption discards the saved frame. A later matching die
        // or checkpoint cannot repair this unverified transition.
        pendingDodge = undefined;
        board = null;
        previousMove = undefined;
        activeEnds.clear();
        activeLosses.clear();
        activationId = null;
        actorDodgeMoveSourceId = undefined;
        pickupSourceId = undefined;
        actorEffectEnd = undefined;
        mentalActivationPending = false;
        continue;
      }
      if (event.type === "step" || event.sourceTag === "BallStep") {
        if(previousMove && (event.sourceTag !== "PlayerStep" || ![0,1,7].includes(event.stepType ?? -1) ||
          event.payload?.Skill !== 0 || event.payload.IsEvaluation !== 0))previousMove.deterministic=false;
        if(previousMove && (previousMove.end.rosterCheckpointAfter !== undefined || previousMove.end.completionCheckpointAfter !== undefined) &&
          (event.sourceTag !== "PlayerStep" || ![0,1,7].includes(event.stepType ?? -1) ||
            event.payload?.Skill !== 0 || event.payload.IsEvaluation !== 0)) {
          previousMove=undefined;activationId=null;activationActionCode=undefined;
        }
        if (
          event.sourceTag === "PlayerStep" &&
          event.stepType !== 0 &&
          (mentalActivationPending ||
            board?.teams.some((t) =>
              t.players.some(
                (p) => String(p.id) === event.stepActorId && p.mentalEffect
              )
            ))
        ) {
          board = null;
          activeEnds.clear();
          activeLosses.clear();
          previousMove = undefined;
          actorEffectEnd = undefined;
          mentalActivationPending = false;
          activationId = null;
        }
        blockDeclarationActionId = undefined;
        foulAppearanceActionId = undefined;
        if (event.sourceTag === "PlayerStep" && event.stepType === 0)
          actorEffectEnd = undefined;
        if (standUpPending) {
          board = null;
          activeLosses.clear();
          activeEnds.clear();
          previousMove = undefined;
          activationId = null;
        }
        standUpPending =
          event.sourceTag === "PlayerStep" && event.stepType === 7;
        if (
          previousMove &&
          event.sourceTag === "PlayerStep" &&
          event.stepType !== 0 &&
          event.stepActorId !== previousMove.end.actorId
        )
          previousMove = undefined;
        step = event;
        moveObserved = false;
        moveOutcomeSourceIndex = undefined;
        moveOutcomeSourceId = undefined;
        plainDoMoveSourceIndex = undefined;
        continue;
      }
      if (!board || !checkpoint) {
        activeLosses.clear();
        activeEnds.clear();
        previousMove = undefined;
        continue;
      }
      event=currentMoveActor(event,board,initialOwnership,replayTeamIds,activationActionCode === 1 && !!activationId);
      if(event.sourceIndex === undefined)continue;
      const currentRosterQualified = event !== originalEvent;
      const p = event.payload;
      if(preservesCurrentMoveEnd(event,board,checkpoint,checkpoints[cursor],previousMove,epochs)) {
        // Preserve only the candidate's source provenance through this verified
        // wait marker. The next iteration still replaces all observed state.
        if(previousMove) {
          previousMove.waitCheckpoint=checkpoints[cursor];
          previousMove.end.completionCheckpointAfter=checkpoints[cursor]!.afterSourceIndex;
        }
        activationId=null;
        activationActionCode=undefined;
        continue;
      }
      if(previousMove && (previousMove.end.rosterCheckpointAfter !== undefined || previousMove.end.completionCheckpointAfter !== undefined) &&
        event.sourceTag !== "ResultUseAction" && !(event.sourceTag === "Carrier" && event.checkpointCarrier) &&
        !isDeterministicMoveResult(event)) {
        previousMove=undefined;activationId=null;activationActionCode=undefined;
      }
      if(previousMove && event.sourceTag !== "ResultUseAction" &&
        !(event.sourceTag === "Carrier" && event.checkpointCarrier) && !isDeterministicMoveResult(event))previousMove.deterministic=false;
      if (teamOffer && event.sourceTag === "ResultTeamRerollUsage") {
        const offer = teamOffer;
        teamOffer = undefined;
        const actor = Number(offer.question.playerId),
          owner = observedActorRoster(
            board,
            actor,
            offer.question.actorTeamId!,
            replay.teams.map((t) => t.id)
          );
        const player = owner?.players.find((p) => p.id === actor);
        const markers = owner
          ? observedZoneMarkers(
              board,
              String(actor),
              owner.rosterIndex,
              offer.check,
              offer.to
            )
          : undefined;
        const players = board.teams.flatMap((t) => t.players),
          positions = players.filter((p) => p.pitchLocation === "on_pitch");
        if (
          event.id &&
          p?.Used === 1 &&
          p.GamerId === offer.question.payload?.GamerId &&
          Object.keys(p).every((k) => ["Used", "GamerId"].includes(k)) &&
          sameMovementActor(offer.question, event) &&
          activationId === offer.declarationSourceId &&
          activationActionCode === 1 &&
          board.activePlayerId === actor &&
          board.phaseCode === 5 &&
          owner?.rosterIndex === p.GamerId &&
          markers !== undefined &&
          (board.activeGamerId === null || board.activeGamerId === p.GamerId) &&
          !board.issues.length &&
          !smallPitchObserved &&
          player?.pitchLocation === "on_pitch" &&
          player.canAct !== false &&
          !player.mentalEffect &&
          (player.statusCode === null || player.statusCode === 0) &&
          (player.situationCode === null || player.situationCode === 0) &&
          same(cell(player.cell), offer.from) &&
          (player.movementRemaining === null ||
            (offer.family === 1
              ? player.movementRemaining === 0
              : Number.isInteger(player.movementRemaining) &&
                player.movementRemaining >= 1 &&
                player.movementRemaining <= 16)) &&
          step?.payload?.IsEvaluation === 0 &&
          step.payload.Skill === 0 &&
          same(stepCell(step.payload.CellFrom), offer.from) &&
          same(stepCell(step.payload.CellTo), offer.to) &&
          new Set(positions.map((p) => `${p.cell.x},${p.cell.y}`)).size ===
            positions.length &&
          players.every(
            (p) =>
              p.id !== null &&
              p.pitchLocation !== "unknown" &&
              (p.id === actor ||
                p.pitchLocation === "off_pitch" ||
                !same(cell(p.cell), offer.to))
          )
        ) {
          // The recorded spend invalidates the old observed count; no general
          // resource policy or later counter is substituted for it here.
          const saved = {
            ...board,
            teams: board.teams.map((t) =>
              t !== owner ? t : { ...t, rerolls: null }
            )
          };
          pendingTeamMove = {
            offer,
            board: saved,
            choice: event,
            lastIndex: event.sourceIndex,
            checkpointAfter: checkpoint.afterSourceIndex,
            stage: "replacement",
            ...(markers.length
              ? { zonePenalty: { baseTarget: offer.check.baseTarget, markers } }
              : {})
          };
          board = null;
          continue;
        }
      }
      if (
        event.id &&
        ([
          "ResultRoll",
          "QuestionTeamRerollUsage",
          "QuestionBlockDice",
          "ResultUseAction"
        ].includes(event.sourceTag) || currentRosterQualified)
      ) {
        result.set(
          event.id,
          summarize(
            board,
            checkpoint,
            event,
            step,
            activationId,
            activationActionCode,
            standardPitch,
            smallPitchObserved,
            standUpSourceIndex,
            pickupSourceId,
            previousMove &&
              previousMove.end.actorId === event.playerId &&
              activationEpoch === epochs.get(checkpoint)
              ? previousMove.end.declarationSourceId
              : undefined,
            activationActionCode === 1 &&
              activationCheckpointAfter === checkpoint.afterSourceIndex
              ? (activationId ?? undefined)
              : undefined,
            moveOutcomeSourceIndex !== undefined && moveOutcomeSourceId
              ? { id: moveOutcomeSourceId, index: moveOutcomeSourceIndex }
              : undefined,
            pickupGeometryTrusted,
            replay.teams.map((t) => t.id)
          )
        );
        const context = result.get(event.id)!;
        if (
          actorDodgeMoveSourceId &&
          activationId &&
          board.activePlayerId === id(event.playerId)
        )
          context.actorDodgeMoveSourceId = actorDodgeMoveSourceId;
        if (
          actorEffectEnd &&
          actorEffectEnd.actorId === event.playerId &&
          board.activePlayerId === id(event.playerId)
        )
          context.actorMentalEffectEnd = {
            sourceId: actorEffectEnd.sourceId,
            providerSkillId: actorEffectEnd.providerSkillId
          };
        const ended = [...activeLosses.values()]
          .filter(
            (loss) =>
              loss.teamId === context.actorRosterTeamId &&
              loss.teamTurn === context.teamTurn &&
              loss.followingSourceIndex <= event.sourceIndex!
          )
          .map((loss) => loss.rollSourceId);
        ended.push(
          ...[...activeEnds.values()]
            .filter(
              (end) =>
                end.teamId === context.actorRosterTeamId &&
                end.teamTurn === context.teamTurn &&
                end.sourceIndex <= event.sourceIndex!
            )
            .map((end) => end.sourceId)
        );
        if (ended.length) context.endedActivationSourceIds = ended;
      }
      if (
        lastTeamMovement &&
        event.sourceIndex === lastTeamMovement.outcome.sourceIndex! + 1 &&
        sameMovementActor(lastTeamMovement.outcome, event) &&
        event.actionId === lastTeamMovement.outcome.actionId &&
        event.sequenceId === lastTeamMovement.outcome.sequenceId &&
        board.phaseCode === 5 &&
        board.activePlayerId === Number(event.playerId) &&
        board.ball.carrierId === null &&
        board.ball.isHeld !== true &&
        same(cell(board.ball.cell), lastTeamMovement.movement.to)
      ) {
        const check = recordedZoneD6Check(event, 4, 1, false),
          owner = observedActorRoster(
            board,
            Number(event.playerId),
            event.actorTeamId!,
            replay.teams.map((t) => t.id)
          );
        const markers =
          check && owner
            ? observedZoneMarkers(
                board,
                event.playerId!,
                owner.rosterIndex,
                check,
                lastTeamMovement.movement.to
              )
            : undefined;
        if (
          check &&
          markers &&
          event.id &&
          JSON.stringify(check.markerPlayerIds) ===
            JSON.stringify(
              lastTeamMovement.movement.zonePenalty?.markers.map(
                (m) => m.playerId
              ) ?? []
            )
        ) {
          // The reached square is actual geometry. No stable availability,
          // loose-ball flag or failed-pickup alternative policy is inferred.
          pendingPickup = {
            board,
            original: event,
            threshold: check.threshold,
            lastIndex: event.sourceIndex,
            stage: "skill",
            declarationSourceId: lastTeamMovement.movement.declarationSourceId,
            moveOutcomeSourceId: lastTeamMovement.movement.outcomeSourceId,
            checkpointAfter: lastTeamMovement.movement.checkpointAfter,
            afterMovement: {
              movementSourceId: lastTeamMovement.sourceId,
              check
            }
          };
          lastTeamMovement = undefined;
          board = null;
          continue;
        }
      }
      if (
        [
          "QuestionTeamRerollUsage",
          "QuestionBlockDice",
          "ResultGainSpp"
        ].includes(event.sourceTag) ||
        (event.sourceTag === "ResultTeamRerollUsage" && p?.Used === 0)
      ) {
        if (event.sourceTag === "QuestionTeamRerollUsage") {
          teamOffer = undefined;
          const offerDie = failedMovementOffer(event),
            from = stepCell(step?.payload?.CellFrom),
            to = stepCell(step?.payload?.CellTo);
          if (
            offerDie &&
            event.id &&
            activationId &&
            activationActionCode === 1 &&
            activationCheckpointAfter === checkpoint.afterSourceIndex &&
            board.phaseCode === 5 &&
            board.stable === true &&
            sameMovementActor(event, event) &&
            step?.payload?.IsEvaluation === 0 &&
            step.payload.Skill === 0 &&
            board.activePlayerId === Number(event.playerId) &&
            from &&
            to &&
            pitch(to) &&
            distance(from, to) === 1 &&
            same(result.get(event.id)?.actorCell ?? null, from)
          )
            teamOffer = {
              question: event,
              threshold: offerDie.threshold,
              family: offerDie.family,
              check: {
                threshold: offerDie.threshold,
                baseTarget: offerDie.baseTarget,
                markerPlayerIds: offerDie.markerPlayerIds
              },
              from,
              to,
              declarationSourceId: activationId,
              checkpointAfter: checkpoint.afterSourceIndex,
              epoch: epochs.get(checkpoint)
            };
        }
        continue;
      }
      // The snapshot already describes both the known holder and absence of
      // one. Its repeated markers are evidence, not another transition.
      if (event.sourceTag === "Carrier" && event.checkpointCarrier) continue;
      const gateDie = (
        p?.Dice as { Die?: { DieType?: number; Value?: number } } | undefined
      )?.Die;
      if (
        event.sourceTag === "ResultRoll" &&
        event.rollType === 37 &&
        event.actionId === foulAppearanceActionId &&
        foulAppearanceActionId !== undefined &&
        p?.Status === 1 &&
        p.NewRoll === 1 &&
        p.Requirement === 2 &&
        p.Difficulty === 2 &&
        p.Outcome === 0 &&
        gateDie?.DieType === 0 &&
        gateDie.Value === 1 &&
        event.playerId === step?.stepActorId &&
        !event.attributionConflict
      ) {
        // Prefix evidence establishes the test, not its later policy or
        // availability result. Preserve only earlier confirmed losses.
        board = null;
        activationId = null;
        continue;
      }
      const blockActor = id(step?.stepActorId),
        blockTarget = id(step?.stepTargetId);
      const actorRoster = board.teams.find((t) =>
        t.players.some((p) => p.id === blockActor)
      );
      const targetRoster = board.teams.find((t) =>
        t.players.some((p) => p.id === blockTarget)
      );
      if (
        event.sourceTag === "ResultSkillUsage" &&
        event.payload?.Skill === 10 &&
        event.payload.Used === 1 &&
        step?.sourceTag === "PlayerStep" &&
        step.stepType === 0 &&
        blockDeclarationActionId !== undefined &&
        event.actionId === blockDeclarationActionId &&
        event.actionId === step.actionId &&
        event.playerId === step.stepTargetId &&
        String(event.payload.PlayerId) === event.playerId &&
        !event.attributionConflict &&
        actorRoster &&
        targetRoster &&
        actorRoster !== targetRoster &&
        actorRoster.rosterIndex === board.activeTeamIndex &&
        (event.actorTeamSource === "turn_inferred" ||
          !event.actorTeamId ||
          actorRoster.explicitTeamId === null ||
          event.actorTeamId !== String(actorRoster.explicitTeamId))
      ) {
        foulAppearanceActionId = event.actionId;
        continue;
      }
      const actor = id(event.stepActorId);
      const inStep =
        step?.actionId !== undefined && step.actionId === event.actionId;
      const stepActorMatches =
        actor !== null &&
        event.playerId === event.stepActorId &&
        !event.attributionConflict &&
        (!event.teamId ||
          !event.actorTeamId ||
          event.teamId === event.actorTeamId);
      const currentActorTeam = board.teams.find(
        (t) => t.rosterIndex === board!.activeTeamIndex
      );
      const currentActor = currentActorTeam?.players.find(
        (p) => p.id === actor
      );
      const effect = recordedMentalEffect(p?.Effect);
      if (
        event.sourceTag === "ResultEndPlayerEffect" &&
        mentalActivationPending &&
        event.id &&
        effect &&
        inStep &&
        stepActorMatches &&
        step?.sourceTag === "PlayerStep" &&
        step.stepType === 0 &&
        step.payload?.Skill === 0 &&
        step.payload.IsEvaluation === 0 &&
        activationId &&
        activationEpoch === epochs.get(checkpoint) &&
        actor === board.activePlayerId &&
        board.phaseCode === NORMAL_TURN &&
        board.stable === true &&
        currentActorTeam?.explicitTeamId != null &&
        event.actorTeamId === String(currentActorTeam.explicitTeamId) &&
        event.actorTeamSource !== "turn_inferred" &&
        currentActor?.pitchLocation === "on_pitch" &&
        same(cell(currentActor.cell), stepCell(step.payload.CellFrom)) &&
        currentActor?.mentalEffect?.providerSkillId ===
          effect.providerSkillId &&
        String(p?.PlayerId) === event.playerId &&
        event.actionId
      ) {
        board = changePlayer(board, actor!, (player) => ({
          ...player,
          mentalEffect: null,
          tackleZone: null
        }));
        actorEffectEnd = {
          sourceId: event.id,
          providerSkillId: effect.providerSkillId,
          actorId: event.playerId!,
          actionId: event.actionId,
          skillObserved: false,
          resolved: false
        };
        mentalEffectEnds.set(event.id, {
          playerId: event.playerId!,
          providerSkillId: effect.providerSkillId,
          declarationSourceId: activationId
        });
        continue;
      }
      if (
        actorEffectEnd &&
        !actorEffectEnd.resolved &&
        actorEffectEnd.actionId === event.actionId &&
        actorEffectEnd.actorId === event.playerId &&
        inStep &&
        stepActorMatches &&
        step?.stepType === 0
      ) {
        if (
          event.sourceTag === "ResultSkillUsage" &&
          event.id &&
          p?.Skill === actorEffectEnd.providerSkillId &&
          p.Used === 1 &&
          !actorEffectEnd.skillObserved &&
          String(p.PlayerId) === event.playerId
        ) {
          actorEffectEnd.skillObserved = true;
          actorEffectEnd.skillSourceId = event.id;
          mentalSkillUses.set(event.id, actorEffectEnd.providerSkillId);
          continue;
        }
        if (event.sourceTag === "ResultRoll" && actorEffectEnd.skillObserved) {
          const success = mentalTraitTest(
            p,
            actorEffectEnd.providerSkillId,
            1,
            1
          );
          if (success !== null && event.id && actorEffectEnd.skillSourceId) {
            mentalTraitResults.set(event.id, {
              providerSkillId: actorEffectEnd.providerSkillId,
              effectEndSourceId: actorEffectEnd.sourceId,
              skillSourceId: actorEffectEnd.skillSourceId,
              success
            });
            actorEffectEnd.resolved = true;
            mentalActivationPending = false;
            if (!success) {
              board = null;
              activationId = null;
              activeEnds.clear();
              activeLosses.clear();
              previousMove = undefined;
              actorEffectEnd = undefined;
            }
            continue;
          }
        }
      }
      if (
        event.sourceTag === "ResultUseAction" &&
        inStep &&
        step?.sourceTag === "PlayerStep" &&
        step.stepType === 0 &&
        stepActorMatches &&
        typeof event.actionCode === "number" &&
        event.actionCode >= 1 &&
        event.actionCode <= 6 &&
        board.phaseCode === NORMAL_TURN &&
        board.stable === true &&
        board.teams.some(
          (t) =>
            (t.rosterIndex === board!.activeTeamIndex ||
              (board!.activeTeamIndex === null &&
                event.actionCode === 1 &&
                event.actorTeamSource === "player_map")) &&
            t.players.some((p) => p.id === actor && p.canAct !== false)
        )
      ) {
        if (mentalActivationPending) {
          board = null;
          activationId = null;
          activeEnds.clear();
          activeLosses.clear();
          previousMove = undefined;
          actorEffectEnd = undefined;
          mentalActivationPending = false;
          continue;
        }
        const activeTeam = board.teams.find(
          (t) => t.rosterIndex === board!.activeTeamIndex
        );
        const currentPlayer = activeTeam?.players.find((p) => p.id === actor);
        const declarationOwned =
          activeTeam?.explicitTeamId != null &&
          !event.attributionConflict &&
          (!event.teamId ||
            event.teamId === String(activeTeam.explicitTeamId)) &&
          (!event.actorTeamId ||
            event.actorTeamSource === "turn_inferred" ||
            event.actorTeamId === String(activeTeam.explicitTeamId));
        if (activeEnds.has(String(actor))) {
          board = null;
          activeEnds.clear();
          activeLosses.clear();
          previousMove = undefined;
          activationId = null;
          continue;
        }
        if (
          declarationOwned &&
          event.actorTeamSource !== "turn_inferred" &&
          previousMove?.moved &&
          previousMove.end.actorId !== String(actor) &&
          event.id &&
          activeTeam &&
          currentPlayer?.pitchLocation === "on_pitch" &&
          currentPlayer.canAct === true &&
          same(cell(currentPlayer.cell), stepCell(step.payload?.CellFrom)) &&
          sameActivationClock(board, previousMove.end)
        ) {
          const oldPlayer = activeTeam.players.find(
            (p) => String(p.id) === previousMove!.end.actorId
          );
          if (
            oldPlayer?.pitchLocation === "on_pitch" &&
            same(cell(oldPlayer.cell), previousMove.end.actorCell)
          ) {
            const end: ActivationEnd = {
              ...previousMove.end,
              actorCell: cell(oldPlayer.cell)!,
              sourceId: event.id,
              sourceIndex: event.sourceIndex,
              followingPlayerId: String(actor),
              checkpointAfter: checkpoint.afterSourceIndex
            };
            activeEnds.set(end.actorId, end);
            activationEnds.set(end.sourceId, end);
            board = applyActivationEnds(board, activeEnds).board;
            // The declaration's pre-state can use this prefix-only confirmation.
            const context = result.get(event.id);
            if (context)
              context.endedActivationSourceIds = [
                ...(context.endedActivationSourceIds ?? []),
                end.sourceId
              ];
          }
        }
        previousMove = undefined;
        if (
          declarationOwned &&
          event.actorTeamSource !== "turn_inferred" &&
          event.actorTeamId === String(activeTeam?.explicitTeamId) &&
          event.actionCode === 1 &&
          event.id &&
          activeTeam?.explicitTeamId != null &&
          activeTeam.gameTurn != null &&
          activeTeam.gameTurn > 0 &&
          currentPlayer?.pitchLocation === "on_pitch" &&
          currentPlayer.canAct === true &&
          step.payload?.Skill === 0 &&
          step.payload.IsEvaluation === 0 &&
          same(cell(currentPlayer.cell), stepCell(step.payload.CellFrom))
        ) {
          previousMove = {
            moved: false,
            deterministic: true,
            end: {
              kind: "ordinary_move_completed",
              ...(currentRosterQualified ? {rosterCheckpointAfter:checkpoint.afterSourceIndex} : {}),
              sourceId: event.id,
              sourceIndex: event.sourceIndex,
              declarationSourceId: event.id,
              actorId: String(actor),
              teamId: String(activeTeam.explicitTeamId),
              rosterIndex: activeTeam.rosterIndex,
              teamTurn: activeTeam.gameTurn,
              periodCode: board.periodCode,
              actorCell: cell(currentPlayer.cell)!,
              followingPlayerId: "",
              checkpointAfter: checkpoint.afterSourceIndex
            }
          };
        }
        actorEffectEnd = undefined;
        mentalActivationPending = !!currentPlayer?.mentalEffect;
        board = { ...board, activePlayerId: actor };
        activationId = event.id ?? null;
        activationEpoch = epochs.get(checkpoint);
        activationCheckpointAfter = checkpoint.afterSourceIndex;
        activationActionCode = event.actionCode;
        const moveRoster =
          actor !== null && event.actorTeamId
            ? observedActorRoster(
                board,
                actor,
                event.actorTeamId,
                replay.teams.map((t) => t.id)
              )
            : undefined;
        const moveActor = moveRoster?.players.find((p) => p.id === actor);
        qualifiedMoveTeamId =
          event.actionCode === 1 &&
          event.actorTeamId &&
          event.actorTeamSource !== "turn_inferred" &&
          p?.Action === 1 &&
          (p.TeamId === undefined || String(p.TeamId) === event.actorTeamId) &&
          Object.keys(p).every((k) => ["Action", "TeamId"].includes(k)) &&
          step.payload?.Skill === 0 &&
          step.payload.IsEvaluation === 0 &&
          moveActor &&
          same(cell(moveActor.cell), stepCell(step.payload.CellFrom))
            ? event.actorTeamId
            : undefined;
        actorDodgeMoveSourceId = undefined;
        blockDeclarationActionId =
          event.actionCode === 2 ? event.actionId : undefined;
        standUpSourceIndex = undefined;
        pickupSourceId = undefined;
        continue;
      }
      if (mentalActivationPending) {
        board = null;
        activationId = null;
        activeEnds.clear();
        activeLosses.clear();
        previousMove = undefined;
        actorEffectEnd = undefined;
        mentalActivationPending = false;
        continue;
      }
      if (
        standUpPending &&
        event.sourceTag === "ResultNoRollSuccess" &&
        event.locator?.messageIndex === 0 &&
        inStep &&
        stepActorMatches &&
        actor === board.activePlayerId &&
        activationId &&
        activationActionCode === 1 &&
        board.phaseCode === NORMAL_TURN &&
        board.stable === true &&
        step?.payload?.IsEvaluation === 0 &&
        step.payload.Skill === 0 &&
        (step.stepTargetId === step.stepActorId || step.stepTargetId === "-1")
      ) {
        const active =
          event.actorTeamId && actor !== null
            ? observedActorRoster(
                board,
                actor,
                event.actorTeamId,
                replay.teams.map((t) => t.id)
              )
            : undefined;
        const player = active?.players.find((p) => p.id === actor);
        const budgetContinuityKnown =
          board.activeTeamIndex !== null && active?.explicitTeamId != null;
        const qualifiedUnknownSide =
          !budgetContinuityKnown &&
          qualifiedMoveTeamId === event.actorTeamId &&
          activationCheckpointAfter === checkpoint.afterSourceIndex &&
          step?.payload?.State === 3 &&
          Object.keys(step.payload).every((k) =>
            [
              "Probability",
              "PlayerId",
              "TargetId",
              "IsEvaluation",
              "StepType",
              "CellTo",
              "State",
              "CellFrom",
              "Skill"
            ].includes(k)
          ) &&
          (!p || Object.keys(p).length === 0);
        if (
          !board.issues.length &&
          !player?.mentalEffect &&
          player?.pitchLocation === "on_pitch" &&
          player.statusCode === PRONE &&
          player.canAct === true &&
          player.movementRemaining !== null &&
          player.movementRemaining >= 1 &&
          player.movementRemaining <= 16 &&
          (player.situationCode === null || player.situationCode === 0) &&
          same(cell(player.cell), stepCell(step.payload.CellFrom)) &&
          same(cell(player.cell), stepCell(step.payload.CellTo)) &&
          (budgetContinuityKnown || qualifiedUnknownSide) &&
          event.actorTeamSource !== "turn_inferred" &&
          board.ball.carrierId !== actor
        ) {
          // Known-side paired checkpoints already reflect this shape's cost.
          // Missing-side evidence proves the actual stand-up, but cannot prove
          // when its cost was charged. Never borrow the later turn-reset budget.
          board = changePlayer(board, actor, (p) => ({
            ...p,
            statusCode: STANDING,
            tackleZone: null,
            movementRemaining: budgetContinuityKnown
              ? p.movementRemaining
              : null
          }));
          standUpPending = false;
          standUpSourceIndex = event.sourceIndex;
          continue;
        }
      }
      if (standUpPending) {
        board = null;
        activeEnds.clear();
        activeLosses.clear();
        previousMove = undefined;
        activationId = null;
        standUpSourceIndex = undefined;
        continue;
      }
      const pickupCandidate = event.id
        ? result.get(event.id)?.pickupSuccessors
        : undefined;
      const failedPickupTarget = unmodifiedD6Check(event, 4, 1, false);
      if (pickupCandidate && failedPickupTarget && event.id) {
        const player = board.teams
          .flatMap((t) => t.players)
          .find((p) => String(p.id) === event.playerId)!;
        if (
          player.movementRemaining === null ||
          (Number.isInteger(player.movementRemaining) &&
            player.movementRemaining >= 0 &&
            player.movementRemaining <= 16)
        ) {
          pendingPickup = {
            board,
            original: event,
            threshold: failedPickupTarget,
            lastIndex: event.sourceIndex,
            stage: "skill",
            declarationSourceId: pickupCandidate.declarationSourceId,
            moveOutcomeSourceId: pickupCandidate.moveOutcomeSourceId,
            checkpointAfter: checkpoint.afterSourceIndex
          };
          board = null;
          continue;
        }
      }
      const failedDodgeTarget = unmodifiedDodgeDie(event, 1, false);
      const dodgeOwner =
        actor !== null && event.actorTeamId
          ? observedActorRoster(
              board,
              actor,
              event.actorTeamId,
              replay.teams.map((t) => t.id)
            )
          : undefined;
      const dodgeActor = dodgeOwner?.players.find((p) => p.id === actor);
      if (
        failedDodgeTarget &&
        event.id &&
        activationId &&
        ((previousMove && previousMove.end.actorId === event.playerId) ||
          (qualifiedMoveTeamId === event.actorTeamId &&
            activationCheckpointAfter === checkpoint.afterSourceIndex)) &&
        activationEpoch === epochs.get(checkpoint) &&
        activationActionCode === 1 &&
        actor === board.activePlayerId &&
        inStep &&
        stepActorMatches &&
        step?.sourceTag === "PlayerStep" &&
        step.stepType === 1 &&
        step.stepTargetId === "-1" &&
        step.payload?.Skill === 0 &&
        step.payload.IsEvaluation === 0 &&
        board.phaseCode === NORMAL_TURN &&
        board.stable === true &&
        !smallPitchObserved &&
        dodgeOwner &&
        event.actorTeamSource !== "turn_inferred" &&
        dodgeActor?.pitchLocation === "on_pitch" &&
        dodgeActor.canAct === true &&
        !dodgeActor.mentalEffect &&
        (dodgeActor.statusCode === null || dodgeActor.statusCode === 0) &&
        (dodgeActor.situationCode === null || dodgeActor.situationCode === 0) &&
        (dodgeActor.movementRemaining === null ||
          (Number.isInteger(dodgeActor.movementRemaining) &&
            dodgeActor.movementRemaining >= 1 &&
            dodgeActor.movementRemaining <= 16))
      ) {
        const from = stepCell(step.payload.CellFrom),
          to = stepCell(step.payload.CellTo);
        if (from && to && actualMoveGeometry(board, actor!, from, to)) {
          pendingDodge = {
            board,
            original: event,
            threshold: failedDodgeTarget,
            from,
            to,
            declarationSourceId: activationId,
            checkpointAfter: checkpoint.afterSourceIndex,
            lastIndex: event.sourceIndex,
            stage: "skill"
          };
          board = null;
          continue;
        }
      }
      if (
        event.sourceTag === "ResultRoll" &&
        inStep &&
        step?.stepType === 1 &&
        (event.rollType === 1 || event.rollType === 2) &&
        stepActorMatches &&
        verifiedMovementSuccess(event)
      )
        continue;
      if (
        event.sourceTag === "ResultRoll" &&
        event.rollType === 4 &&
        event.id &&
        inStep &&
        step?.sourceTag === "PlayerStep" &&
        step.stepType === 1 &&
        step.payload?.IsEvaluation === 0 &&
        stepActorMatches &&
        moveOutcomeSourceIndex === event.sourceIndex - 1 &&
        activationId &&
        activationActionCode === 1 &&
        actor === board.activePlayerId &&
        board.phaseCode === NORMAL_TURN &&
        board.stable === true &&
        (event.actorTeamSource === "player_map" ||
          event.actorTeamSource === "explicit") &&
        board.ball.possession !== "held" &&
        board.ball.carrierId === null &&
        (p?.Modifiers === undefined || p.Modifiers === "") &&
        p?.Requirement === p?.Difficulty &&
        verifiedMovementSuccess(event)
      ) {
        const destination = stepCell(step.payload.CellTo);
        const owner = board.teams.find((t) =>
          t.players.some((player) => player.id === actor)
        );
        if (owner && destination && same(cell(board.ball.cell), destination)) {
          board = {
            ...board,
            ball: {
              cell: destination,
              carrierId: actor,
              holderRosterIndex: owner.rosterIndex,
              isHeld: true,
              possession: "held"
            }
          };
          pickupSourceId = event.id;
          continue;
        }
      }
      if (
        event.sourceTag === "ResultDoMove" &&
        inStep &&
        step?.sourceTag === "PlayerStep" &&
        step.stepType === 1 &&
        stepActorMatches
      ) {
        moveObserved = true;
        if (p && Object.keys(p).length > 0) pickupGeometryTrusted = false;
        plainDoMoveSourceIndex =
          !p || Object.keys(p).length === 0 ? event.sourceIndex : undefined;
        continue;
      }
      if (
        event.sourceTag === "ResultMoveOutcome" &&
        moveObserved &&
        inStep &&
        stepActorMatches &&
        p?.Moved === 1 &&
        (p.TentacleUsed === 0 || p.TentacleUsed === undefined) &&
        (p.FumbleRooskieUsed === 0 || p.FumbleRooskieUsed === undefined)
      ) {
        const from = stepCell(step?.payload?.CellFrom),
          to = stepCell(step?.payload?.CellTo);
        const players = board.teams.flatMap((t) => t.players);
        const player = players.find((p) => p.id === actor);
        if (
          from &&
          to &&
          pitch(to) &&
          pitch(from) &&
          Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y)) === 1 &&
          player?.pitchLocation === "on_pitch" &&
          same(from, cell(player.cell)) &&
          players.every(
            (p) =>
              p.pitchLocation !== "unknown" &&
              (p.id === actor ||
                p.pitchLocation === "off_pitch" ||
                !same(to, cell(p.cell)))
          )
        ) {
          board = changePlayer(board, actor, (p) => ({
            ...p,
            cell: to,
            movementRemaining:
              p.movementRemaining === null
                ? null
                : Math.max(0, p.movementRemaining - 1)
          }));
          if (
            board.ball.possession === "held" &&
            board.ball.carrierId === actor
          )
            board = { ...board, ball: { ...board.ball, cell: to } };
          moveObserved = false;
          moveOutcomeSourceIndex = event.sourceIndex;
          if (!plainPickupMoveOutcome(event)) pickupGeometryTrusted = false;
          moveOutcomeSourceId =
            pickupGeometryTrusted &&
            plainPickupMoveOutcome(event) &&
            plainDoMoveSourceIndex === event.sourceIndex - 1
              ? event.id
              : undefined;
          plainDoMoveSourceIndex = undefined;
          if (
            previousMove &&
            previousMove.end.actorId === String(actor) &&
            activationActionCode === 1 &&
            event.id
          ) {
            previousMove.moved = true;
            previousMove.end.moveSourceId = event.id;
            previousMove.end.actorCell = to;
          }
          continue;
        }
      }
      actorDodgeMoveSourceId = undefined;
      // For unverified mutations do not fill the gap from a future snapshot.
      board = null;
      actorEffectEnd = undefined;
      mentalActivationPending = false;
      activeLosses.clear();
      activeEnds.clear();
      previousMove = undefined;
      blockDeclarationActionId = undefined;
      foulAppearanceActionId = undefined;
      activationId = null;
      standUpSourceIndex = undefined;
      pickupSourceId = undefined;
      moveOutcomeSourceId = undefined;
      plainDoMoveSourceIndex = undefined;
    }
  return {
    preRollEvidence: result,
    dodgeMovements,
    teamRerollMovements,
    combinedMovements,
    pickupsAfterMovement,
    pickupResolutions,
    activationEnds,
    mentalEffectEnds,
    mentalSkillUses,
    mentalTraitResults
  };
}

export function reconstructPreRollEvidence(
  replay: ReplayModel,
  confirmedLosses?: readonly ConfirmedActivationLoss[]
): Map<string, PreRollEvidence> {
  return reconstructReplayContext(replay, confirmedLosses).preRollEvidence;
}
