import {
  lastBoardCheckpointBefore,
  type ReplayBoardCheckpoint
} from "@/domain/replay/boardState";
import type { ReplayEvent } from "@/domain/replay/types";
import type { LuckEvent, LuckReport } from "./types";

type MovementFall = NonNullable<LuckEvent["metadata"]["movementFall"]>;
type Aftermath = NonNullable<
  NonNullable<MovementFall["ballPath"]>["aftermath"]
>;

const NORMAL_TURN_CONTROLS = new Set([
  "EventFaceUpStunnedPlayers",
  "EventActiveGamerChanged",
  "EventPauseActiveTimer",
  "EventActiveTimerChanged",
  "EventRulesEngineStandBy"
]);
const MAX_CONTROLS = NORMAL_TURN_CONTROLS.size;

function matchingRosterIds(
  before: readonly (readonly (number | null)[])[],
  after: readonly (readonly (number | null)[])[]
) {
  return (
    before.length === 2 &&
    after.length === 2 &&
    before.every((ids, roster) => {
      const next = after[roster]!;
      return (
        ids.length > 0 &&
        ids.length === next.length &&
        new Set(ids).size === ids.length &&
        new Set(next).size === next.length &&
        ids.every((id) => id !== null && next.includes(id))
      );
    })
  );
}

export function observeRushFallAftermath(
  fall: MovementFall,
  checkpoints: readonly ReplayBoardCheckpoint[],
  raw: ReadonlyMap<number, ReplayEvent>
): Aftermath | undefined {
  const path = fall.ballPath;
  const turnover = raw.get(fall.turnoverSourceIndex);
  if (!path || turnover?.locator?.replayStep === undefined) return;
  const first = checkpoints.find(
    (cp) => cp.afterSourceIndex >= fall.turnoverSourceIndex
  );
  const board = first?.board;
  if (
    !first ||
    !board ||
    first.kind !== "board" ||
    first.replayStep !== turnover.locator.replayStep ||
    first.childIndex === null ||
    first.childIndex <= fall.turnoverChildIndex ||
    board.issues.length ||
    board.ball.carrierId !== null ||
    board.ball.isHeld === true ||
    board.activePlayerId !== null
  )
    return;

  const checkpointAfter = first.afterSourceIndex;
  const count = checkpointAfter - fall.turnoverSourceIndex;
  if (count < 1 || count > MAX_CONTROLS) return;
  const controls = Array.from({ length: count }, (_, i) =>
    raw.get(fall.turnoverSourceIndex + i + 1)
  );
  if (
    controls.some((event) => {
      const locator = event?.locator;
      return (
        !locator ||
        locator.replayStep !== first.replayStep ||
        locator.childIndex === undefined ||
        locator.childIndex <= fall.turnoverChildIndex ||
        locator.childIndex >= first.childIndex!
      );
    })
  )
    return;

  if (
    board.phaseCode === 7 &&
    count === 1 &&
    controls[0]?.sourceTag === "QuestionBribeUsage" &&
    board.ball.cell.x === -1 &&
    board.ball.cell.y === -1
  )
    return { status: "turn_transition", checkpointAfter };

  const landing = path.legs.at(-1)!.to;
  if (
    board.phaseCode !== 5 ||
    board.stable !== true ||
    controls.at(-1)?.sourceTag !== "EventRulesEngineStandBy" ||
    controls.some((event) => !NORMAL_TURN_CONTROLS.has(event!.sourceTag)) ||
    board.ball.cell.x !== landing.x ||
    board.ball.cell.y !== landing.y
  )
    return;
  const waiting = lastBoardCheckpointBefore(
    checkpoints,
    path.waitingCheckpointAfter + 1
  );
  if (
    !waiting?.board ||
    waiting.afterSourceIndex !== path.waitingCheckpointAfter ||
    waiting.board.periodCode === null ||
    waiting.board.periodCode !== board.periodCode ||
    !matchingRosterIds(
      waiting.board.teams.map((team) => team.players.map((p) => p.id)),
      board.teams.map((team) => team.players.map((p) => p.id))
    )
  )
    return;

  const exclusions: Extract<Aftermath, { status: "loose" }>["exclusions"] = [];
  for (const player of board.teams.flatMap((team) => team.players)) {
    const { x, y } = player.cell;
    if (x !== null && x !== landing.x)
      exclusions.push({ playerId: player.id!, axis: "x", coordinate: x });
    else if (y !== null && y !== landing.y)
      exclusions.push({ playerId: player.id!, axis: "y", coordinate: y });
    else return;
  }
  return { status: "loose", checkpointAfter, exclusions };
}

export function validReportedRushFallAftermath(
  fall: MovementFall,
  report: LuckReport
) {
  const path = fall.ballPath;
  const aftermath = path?.aftermath;
  if (!path || !aftermath) return true;
  const { clockSnapshots, endNotifications } = report.rerollResources.flow;
  const turnover = endNotifications.find(
    (row) => row.sourceIndex === fall.turnoverSourceIndex
  );
  const snapshot = clockSnapshots.find(
    (row) => row.source.checkpointAfter >= fall.turnoverSourceIndex
  );
  if (
    !turnover ||
    turnover.reasonCode !== 2 ||
    !snapshot?.clock ||
    snapshot.source.kind !== "board" ||
    snapshot.source.replayStep !== turnover.replayStep ||
    snapshot.source.childIndex === null ||
    snapshot.source.childIndex <= fall.turnoverChildIndex ||
    snapshot.source.checkpointAfter !== aftermath.checkpointAfter
  )
    return false;
  const count = aftermath.checkpointAfter - fall.turnoverSourceIndex;
  if (aftermath.status === "turn_transition")
    return count === 1 && snapshot.clock.phaseCode === 7;

  const waiting = clockSnapshots.find(
    (row) => row.source.checkpointAfter === path.waitingCheckpointAfter
  );
  const landing = path.legs.at(-1)!.to;
  const ids = new Set(snapshot.playerIds.flat());
  return (
    count >= 1 &&
    count <= MAX_CONTROLS &&
    snapshot.clock.phaseCode === 5 &&
    waiting?.clock?.periodCode != null &&
    waiting.clock.periodCode === snapshot.clock.periodCode &&
    matchingRosterIds(waiting.playerIds, snapshot.playerIds) &&
    ids.size === snapshot.playerIds[0].length + snapshot.playerIds[1].length &&
    aftermath.exclusions.length === ids.size &&
    aftermath.exclusions.every(
      ({ playerId, axis, coordinate }) =>
        ids.delete(playerId) && coordinate !== landing[axis]
    )
  );
}
