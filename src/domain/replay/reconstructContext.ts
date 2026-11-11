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
  endedActivationSourceIds?: string[];
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
  standUpSourceIndex: number | undefined,
  pickupSourceId: string | undefined
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
      // These count ordinary standing movement opportunities only. Unknown
      // posture/availability cannot be interpreted as a spent activation.
      if (
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
  const destination = stepCell(step?.payload?.CellTo);
  const movementCheckLinked =
    rollType === 2 &&
    normal &&
    Boolean(owned) &&
    consistentGeometry &&
    step?.sourceTag === "PlayerStep" &&
    step.stepType === 1 &&
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
  return {
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
      standUpSourceIndex !== undefined &&
      actorCell &&
      board.activePlayerId === actorId
        ? (actor?.movementRemaining ?? undefined)
        : undefined,
    actorPickupSourceId:
      actorId !== null && board.ball.carrierId === actorId
        ? pickupSourceId
        : undefined,
    scoringAttempt,
    teammateCarrierMove,
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
  const activationEnds = new Map<string, ActivationEnd>();
  if (replay.replayVersion !== "1-4-0-0")
    return { preRollEvidence: result, activationEnds };
  const checkpoints = replay.boardCheckpoints ?? [];
  let standardPitch = false;
  let cursor = 0;
  let checkpoint: ReplayBoardCheckpoint | undefined;
  let board: ObservedBoard | null = null;
  let step: ReplayEvent | undefined;
  let activationId: string | null = null;
  let activationActionCode: number | undefined;
  let moveObserved = false;
  let moveOutcomeSourceIndex: number | undefined;
  let standUpPending = false;
  let standUpSourceIndex: number | undefined;
  let pickupSourceId: string | undefined;
  let blockDeclarationActionId: string | undefined;
  let foulAppearanceActionId: string | undefined;
  const lossesByConfirmation = new Map(
    confirmedLosses.map((loss) => [loss.followingActivationSourceId, loss])
  );
  const mentalEnds = new Map(
    findMentalActivationEnds(replay).map((end) => [end.sourceId, end])
  );
  let activeEnds = new Map<string, ActivationEnd>();
  let previousMove: { end: ActivationEnd; moved: boolean } | undefined;
  let activeLosses = new Map<string, ConfirmedActivationLoss>();
  for (const turn of replay.turns)
    for (const event of turn.events) {
      if (event.sourceIndex === undefined) continue;
      let frameChanged = false;
      while (
        cursor < checkpoints.length &&
        checkpoints[cursor]!.afterSourceIndex < event.sourceIndex
      ) {
        checkpoint = checkpoints[cursor++]!;
        frameChanged = true;
        const next = checkpoint.board;
        if (checkpoint.kind === "initial")
          standardPitch = next?.pitchLayout === "standard";
        if (next?.pitchLayout === "small") standardPitch = false;
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
            ? next
            : null;
        moveObserved = false;
        moveOutcomeSourceIndex = undefined;
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
      if (event.type === "step" || event.sourceTag === "BallStep") {
        blockDeclarationActionId = undefined;
        foulAppearanceActionId = undefined;
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
        continue;
      }
      if (!board || !checkpoint) {
        activeLosses.clear();
        activeEnds.clear();
        previousMove = undefined;
        continue;
      }
      const p = event.payload;
      if (
        event.id &&
        [
          "ResultRoll",
          "QuestionTeamRerollUsage",
          "QuestionBlockDice",
          "ResultUseAction"
        ].includes(event.sourceTag)
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
            standUpSourceIndex,
            pickupSourceId
          )
        );
        const context = result.get(event.id)!;
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
        [
          "QuestionTeamRerollUsage",
          "QuestionBlockDice",
          "ResultGainSpp"
        ].includes(event.sourceTag) ||
        (event.sourceTag === "ResultTeamRerollUsage" && p?.Used === 0)
      )
        continue;
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
            end: {
              kind: "ordinary_move_completed",
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
        board = { ...board, activePlayerId: actor };
        activationId = event.id ?? null;
        activationActionCode = event.actionCode;
        blockDeclarationActionId =
          event.actionCode === 2 ? event.actionId : undefined;
        standUpSourceIndex = undefined;
        pickupSourceId = undefined;
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
        const active = board.teams.find(
          (t) => t.rosterIndex === board!.activeTeamIndex
        );
        const player = active?.players.find((p) => p.id === actor);
        if (
          player?.pitchLocation === "on_pitch" &&
          player.statusCode === PRONE &&
          player.canAct === true &&
          player.movementRemaining !== null &&
          player.movementRemaining >= 1 &&
          player.movementRemaining <= 16 &&
          (player.situationCode === null || player.situationCode === 0) &&
          same(cell(player.cell), stepCell(step.payload.CellFrom)) &&
          same(cell(player.cell), stepCell(step.payload.CellTo)) &&
          active?.explicitTeamId != null &&
          event.actorTeamId === String(active.explicitTeamId) &&
          event.actorTeamSource !== "turn_inferred" &&
          board.ball.carrierId !== actor
        ) {
          // In this replay shape the checkpoint already reflects the stand-up
          // movement cost. Adjacent real checkpoints retain the same budget.
          board = changePlayer(board, actor, (p) => ({
            ...p,
            statusCode: STANDING,
            tackleZone: null
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
      // For unverified mutations do not fill the gap from a future snapshot.
      board = null;
      activeLosses.clear();
      activeEnds.clear();
      previousMove = undefined;
      blockDeclarationActionId = undefined;
      foulAppearanceActionId = undefined;
      activationId = null;
      standUpSourceIndex = undefined;
      pickupSourceId = undefined;
    }
  return { preRollEvidence: result, activationEnds };
}

export function reconstructPreRollEvidence(
  replay: ReplayModel,
  confirmedLosses?: readonly ConfirmedActivationLoss[]
): Map<string, PreRollEvidence> {
  return reconstructReplayContext(replay, confirmedLosses).preRollEvidence;
}
