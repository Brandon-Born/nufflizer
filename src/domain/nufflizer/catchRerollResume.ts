import { lastBoardCheckpointBefore } from "@/domain/replay/boardState";
import type { ReplayEvent, ReplayModel } from "@/domain/replay/types";
import type { ReplayBoardCheckpoint } from "@/domain/replay/boardState";
import type { OwnershipTimeline } from "@/domain/replay/ownershipTimeline";
import { isInertReplayControl } from "@/domain/replay/inertControls";
import type { LuckEvent } from "./types";
import type { NumericQuestionOriginal } from "./numericQuestionOriginal";

type Receipt = NonNullable<LuckEvent["metadata"]["catchRerollResume"]>;
type Snapshot = Receipt["menu"];
export type CatchRerollResume = {
  question: ReplayEvent;
  choice: ReplayEvent;
  final: ReplayEvent;
  ready: ReplayEvent;
  timer: ReplayEvent;
  span: ReadonlySet<ReplayEvent>;
  receipt: Receipt;
};
const obj = (v: unknown): Record<string, unknown> | undefined =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
const fields = (v: unknown, keys: string[]) =>
  !!obj(v) && Object.keys(obj(v)!).every((k) => keys.includes(k));
function cell(v: unknown) {
  const c = obj(v);
  return c &&
    fields(c, ["X", "Y"]) &&
    Number.isInteger(c.X) &&
    Number.isInteger(c.Y) &&
    Number(c.X) >= 0 &&
    Number(c.X) <= 25 &&
    Number(c.Y) >= 0 &&
    Number(c.Y) <= 14
    ? { x: Number(c.X), y: Number(c.Y) }
    : undefined;
}
function header(
  e: ReplayEvent | undefined,
  state: 1 | 3,
  actor: string,
  at: { x: number; y: number }
) {
  const p = e?.payload;
  return (
    !!e?.id &&
    e.sourceTag === "PlayerStep" &&
    e.type === "step" &&
    e.stepTag === "PlayerStep" &&
    e.stepType === 4 &&
    e.playerId === actor &&
    e.stepActorId === actor &&
    e.targetId === "-1" &&
    e.stepTargetId === "-1" &&
    !e.attributionConflict &&
    !e.unclassifiedDice &&
    p?.State === state &&
    p.IsEvaluation === 0 &&
    p.Skill === 0 &&
    String(p.PlayerId) === actor &&
    p.TargetId === -1 &&
    p.StepType === 4 &&
    fields(p, [
      "Probability",
      "PlayerId",
      "TargetId",
      "IsEvaluation",
      "StepType",
      "CellFrom",
      "CellTo",
      "State",
      "Skill"
    ]) &&
    JSON.stringify(cell(p.CellFrom)) === JSON.stringify(at) &&
    JSON.stringify(cell(p.CellTo)) === JSON.stringify(at)
  );
}
function cachedDice(cp: ReplayBoardCheckpoint) {
  const p = cp.dicePayload;
  if (!p || !fields(p, ["LastWeatherRoll", "LastKickOffEventRoll"]))
    return false;
  return Object.values(p).every((value) => {
    const v = obj(value),
      dice = v?.Die;
    return (
      !!v &&
      fields(v, ["Die"]) &&
      Array.isArray(dice) &&
      dice.length === 2 &&
      dice.every(
        (d) => fields(d, ["Value"]) && /^[1-6]$/.test(String(obj(d)?.Value))
      )
    );
  });
}
function observation(
  cp: ReplayBoardCheckpoint | undefined,
  actor: string,
  teamId: string,
  at: { x: number; y: number }
): Snapshot | undefined {
  const b = cp?.board;
  if (
    !cp ||
    !b ||
    cp.status !== "observed" ||
    b.issues.length ||
    b.phaseCode !== 5 ||
    b.turnsPerPeriod === null ||
    b.turnsPerPeriod < 1 ||
    b.activeTeamIndex === null ||
    b.activeGamerId !== Number(teamId) ||
    !cp.replayStep ||
    cp.childIndex === null ||
    b.teams.length !== 2 ||
    b.teams.some(
      (t, i) =>
        t.rosterIndex !== i ||
        t.gameTurn === null ||
        t.gameTurn < 0 ||
        (t.explicitTeamId !== null &&
          t.explicitTeamId !== 0 &&
          t.explicitTeamId !== 1)
    )
  )
    return;
  const members = b.teams.flatMap((t) =>
    t.players.filter((p) => String(p.id) === actor).map((p) => ({ t, p }))
  );
  if (members.length !== 1) return;
  const { t, p } = members[0]!;
  if (
    t.explicitTeamId !== Number(teamId) ||
    t.rosterIndex !== b.activeTeamIndex ||
    p.pitchLocation !== "on_pitch" ||
    JSON.stringify(p.cell) !== JSON.stringify(at) ||
    t.rerolls === null ||
    t.rerolls < 1
  )
    return;
  return {
    checkpointAfter: cp.afterSourceIndex,
    replayStep: cp.replayStep,
    childIndex: cp.childIndex,
    phaseCode: 5,
    periodCode: b.periodCode,
    turnsPerPeriod: b.turnsPerPeriod,
    activeTeamIndex: b.activeTeamIndex as 0 | 1,
    activeGamerId: b.activeGamerId as 0 | 1,
    activePlayerId: b.activePlayerId,
    teamTurns: [b.teams[0]!.gameTurn!, b.teams[1]!.gameTurn!],
    teamIds: b.teams.map((t) => t.explicitTeamId) as [
      0 | 1 | null,
      0 | 1 | null
    ],
    teamRerolls: t.rerolls,
    actorCell: at,
    actorCanAct: p.canAct,
    actorTackleZone: p.tackleZone,
    actorStatus: p.statusCode,
    actorSituation: p.situationCode
  };
}
function controllerBeforeQuestion(
  replay: ReplayModel,
  events: readonly ReplayEvent[],
  q: ReplayEvent,
  menu: Snapshot
): Receipt["controller"] | undefined {
  const before = lastBoardCheckpointBefore(
      replay.boardCheckpoints ?? [],
      q.sourceIndex!
    ),
    b = before?.board;
  if (
    !before ||
    !b ||
    before.status !== "observed" ||
    b.issues.length ||
    before.afterSourceIndex >= q.sourceIndex! - 1 ||
    b.phaseCode !== 5 ||
    b.periodCode !== menu.periodCode ||
    b.turnsPerPeriod !== menu.turnsPerPeriod ||
    b.activeTeamIndex !== menu.activeTeamIndex ||
    JSON.stringify(b.teams.map((t) => t.gameTurn)) !==
      JSON.stringify(menu.teamTurns) ||
    JSON.stringify(b.teams.map((t) => t.explicitTeamId)) !==
      JSON.stringify(menu.teamIds) ||
    (b.activeGamerId !== null && b.activeGamerId !== 0 && b.activeGamerId !== 1)
  )
    return;
  let gamer = b.activeGamerId,
    changeSourceIndex: number | null = null;
  for (const e of events) {
    if (e.sourceIndex! <= before.afterSourceIndex) continue;
    if (e.sourceIndex! >= q.sourceIndex!) break;
    if (["EventEndTurn", "EventNewGamePhase"].includes(e.sourceTag)) return;
    if (e.sourceTag === "EventActiveGamerChanged") {
      const value = e.payload?.NewActiveGamer;
      if (
        !fields(e.payload, ["NewActiveGamer"]) ||
        !["0", "1"].includes(String(value)) ||
        e.attributionConflict
      )
        return;
      gamer = Number(value);
      changeSourceIndex = e.sourceIndex!;
    }
    if (e.sourceTag === "EventActiveTimerChanged") {
      const timer = obj(e.payload?.NewTimer);
      if (
        !isInertReplayControl(e) ||
        (timer?.Team !== undefined && Number(timer.Team) !== gamer)
      )
        return;
    }
    if (
      e.sourceTag === "EventRulesEngineStandBy" &&
      (!fields(e.payload, ["Phase", "ActiveGamer"]) ||
        Number(e.payload?.Phase) !== 5 ||
        (e.payload?.ActiveGamer !== undefined &&
          Number(e.payload.ActiveGamer) !== gamer))
    )
      return;
  }
  return gamer === menu.activeGamerId
    ? {
        beforeCheckpointAfter: before.afterSourceIndex,
        beforeGamerId: b.activeGamerId as 0 | 1 | null,
        changeSourceIndex
      }
    : undefined;
}
// This grammar is the observed stationary Catch wait, not permission to skip
// arbitrary timer/controller/turn messages. Qualification ends at the fresh
// result; no successful aftermath or later resource counter selects it.
export function findCatchRerollResumes(
  replay: ReplayModel,
  ordered: readonly ReplayEvent[],
  originals: ReadonlyMap<number, NumericQuestionOriginal>,
  owners: OwnershipTimeline
): ReadonlyMap<string, CatchRerollResume> {
  const found = new Map<string, CatchRerollResume>();
  if (replay.replayVersion !== "1-4-0-0") return found;
  const cps = replay.boardCheckpoints ?? [];
  const checkpoints = new Map<number, ReplayBoardCheckpoint[]>();
  for (const cp of cps) {
    const rows = checkpoints.get(cp.afterSourceIndex) ?? [];
    rows.push(cp);
    checkpoints.set(cp.afterSourceIndex, rows);
  }
  const events = replay.turns.flatMap((t) => t.events),
    indices = new Map(events.map((e, i) => [e, i]));
  for (const [oi, original] of originals) {
    const q = ordered[oi]!,
      i = indices.get(q);
    if (i === undefined) continue;
    const qs = events[i - 1],
      carrier1 = events[i + 1],
      ready = events[i + 2],
      timer = events[i + 3],
      carrier2 = events[i + 4],
      step = events[i + 5],
      choice = events[i + 6],
      final = events[i + 7];
    const at = cell(qs?.payload?.CellFrom),
      team = String(original.receipt.gamerId),
      actor = q.playerId;
    if (
      !q.id ||
      !actor ||
      original.roll.RollType !== 7 ||
      original.receipt.canUseTeamReroll !== true ||
      !at ||
      !header(qs, 1, actor, at) ||
      !header(step, 3, actor, at) ||
      !choice ||
      !final ||
      !ready ||
      !timer ||
      !carrier1 ||
      !carrier2 ||
      q.stepType !== 4 ||
      q.stepTag !== "PlayerStep" ||
      q.targetId !== "-1" ||
      q.locator?.messageIndex !== 0 ||
      q.actionId !== qs!.actionId ||
      q.sequenceId !== qs!.sequenceId ||
      q.locator?.replayStep !== qs!.locator?.replayStep ||
      q.locator?.childIndex !== qs!.locator?.childIndex ||
      q.locator?.stepIndex !== qs!.locator?.stepIndex ||
      step!.actionId === q.actionId ||
      step!.sequenceId === q.sequenceId ||
      choice.sourceTag !== "ResultTeamRerollUsage" ||
      choice.payload?.Used !== 1 ||
      choice.payload.GamerId !== original.receipt.gamerId ||
      !fields(choice.payload, ["GamerId", "Used"]) ||
      final.sourceTag !== "ResultRoll" ||
      final.rollType !== 7 ||
      !fields(final.payload, [
        "Status",
        "Requirement",
        "Modifiers",
        "Dice",
        "Difficulty",
        "RollType",
        "Outcome",
        "NewRoll"
      ]) ||
      !fields(final.payload?.Dice, ["Die"]) ||
      !fields(obj(final.payload?.Dice)?.Die, ["DieType", "Value"]) ||
      choice.actionId !== step!.actionId ||
      final.actionId !== step!.actionId ||
      choice.sequenceId !== step!.sequenceId ||
      final.sequenceId !== step!.sequenceId ||
      [choice, final].some(
        (e) =>
          e.playerId !== actor ||
          e.stepActorId !== actor ||
          e.stepTargetId !== "-1" ||
          e.targetId !== "-1" ||
          e.stepType !== 4 ||
          e.stepTag !== "PlayerStep" ||
          e.attributionConflict
      ) ||
      ready.sourceTag !== "EventGamersAreReady" ||
      timer.sourceTag !== "EventStartActiveTimer" ||
      !isInertReplayControl(ready) ||
      !isInertReplayControl(timer) ||
      [ready, timer].some(
        (e) =>
          e.actionId !== undefined ||
          e.stepTag !== undefined ||
          e.locator?.stepIndex !== undefined ||
          e.locator?.messageIndex !== undefined
      ) ||
      ready.unclassifiedDice ||
      timer.unclassifiedDice ||
      [carrier1, carrier2].some(
        (e) =>
          e.sourceTag !== "Carrier" ||
          !e.checkpointCarrier ||
          e.attributionConflict ||
          e.unclassifiedDice
      ) ||
      !fields(carrier1.payload, ["Carrier"]) ||
      !fields(carrier2.payload, ["Carrier"]) ||
      JSON.stringify(carrier1.payload) !== JSON.stringify(carrier2.payload) ||
      [qs!, q, carrier1, ready, timer, carrier2, step!, choice, final].some(
        (e, j) => !e.id || e.sourceIndex !== q.sourceIndex! + j - 1
      )
    )
      continue;
    const menuRows = checkpoints.get(q.sourceIndex!),
      resumeRows = checkpoints.get(timer.sourceIndex!);
    if (menuRows?.length !== 1 || resumeRows?.length !== 1) continue;
    const menuCp = menuRows[0]!,
      resumedCp = resumeRows[0]!;
    if (
      !cachedDice(menuCp) ||
      !cachedDice(resumedCp) ||
      JSON.stringify(menuCp.dicePayload) !==
        JSON.stringify(resumedCp.dicePayload)
    )
      continue;
    const menu = observation(menuCp, actor, team, at),
      resumed = observation(resumedCp, actor, team, at);
    if (
      !menu ||
      !resumed ||
      JSON.stringify(menuCp.board) !== JSON.stringify(resumedCp.board) ||
      q.locator?.replayStep !== menu.replayStep ||
      (q.locator?.childIndex ?? -2) + 1 !== menu.childIndex ||
      ready.locator?.replayStep !== menu.replayStep + 1 ||
      ready.locator?.childIndex !== 1 ||
      timer.locator?.replayStep !== menu.replayStep + 1 ||
      timer.locator?.childIndex !== 2 ||
      resumed.replayStep !== menu.replayStep + 1 ||
      resumed.childIndex !== 3 ||
      step!.locator?.replayStep !== menu.replayStep + 2 ||
      step!.locator?.childIndex !== 1 ||
      step!.locator?.stepIndex !== 0 ||
      [choice, final].some(
        (e, j) =>
          e.locator?.replayStep !== step!.locator?.replayStep ||
          e.locator?.childIndex !== 1 ||
          e.locator?.stepIndex !== 0 ||
          e.locator?.messageIndex !== j
      ) ||
      cps.some(
        (cp) =>
          cp.afterSourceIndex >= q.sourceIndex! &&
          cp.afterSourceIndex < final.sourceIndex! &&
          cp !== menuCp &&
          cp !== resumedCp
      )
    )
      continue;
    if (
      [q, choice, final].some((e) => {
        const p = owners.resolve(actor, e);
        return p.status !== "confirmed" || p.proof.teamId !== team;
      })
    )
      continue;
    const controller = controllerBeforeQuestion(replay, events, q, menu);
    if (!controller) continue;
    found.set(q.id, {
      question: q,
      choice,
      final,
      ready,
      timer,
      span: new Set(events.slice(i + 1, i + 8)),
      receipt: {
        controller,
        questionStepSourceIndex: qs!.sourceIndex!,
        continuationStepSourceIndex: step!.sourceIndex!,
        readySourceIndex: ready.sourceIndex!,
        timerSourceIndex: timer.sourceIndex!,
        menu,
        resumed
      }
    });
  }
  return found;
}

export function validReportedCatchRerollResume(
  e: LuckEvent,
  sources: ReadonlyMap<string, LuckEvent>,
  sourceCount: number
) {
  const m = e.metadata,
    r = m.catchRerollResume,
    q = sources.get(m.rerollQuestionId ?? "");
  if (!r)
    return !(
      e.scoringStatus === "scored" &&
      m.rerollResource === "team" &&
      m.rollType === 7 &&
      (m.locator?.replayStep ?? 0) >
        (q?.metadata.locator?.replayStep ?? Infinity) + 1
    );
  const qm = q?.metadata,
    choice = sources.get(m.rerollDecisionId ?? ""),
    menu = r.menu,
    resumed = r.resumed;
  const snapshot = (s: Snapshot) =>
    s.phaseCode === 5 &&
    s.activeGamerId === Number(e.teamId) &&
    s.teamIds[s.activeTeamIndex] === Number(e.teamId) &&
    new Set(s.teamIds.filter((id) => id !== null)).size ===
      s.teamIds.filter((id) => id !== null).length &&
    s.activeTeamIndex === menu.activeTeamIndex &&
    s.teamRerolls >= 1 &&
    s.turnsPerPeriod >= 1;
  const same =
    JSON.stringify({
      ...menu,
      checkpointAfter: 0,
      replayStep: 0,
      childIndex: 0
    }) ===
    JSON.stringify({
      ...resumed,
      checkpointAfter: 0,
      replayStep: 0,
      childIndex: 0
    });
  const qi = qm?.sourceIndex;
  return (
    !!q &&
    !!choice &&
    qi !== undefined &&
    m.sourceIndex !== undefined &&
    m.sourceIndex <= sourceCount &&
    e.scoringStatus === "scored" &&
    e.type === "ball_handling" &&
    m.sourceTag === "ResultRoll" &&
    m.rollType === 7 &&
    m.stepType === 4 &&
    m.targetId === "-1" &&
    !!m.rerollDraws &&
    m.probabilityPolicy === "two_attempt" &&
    m.rerollResource === "team" &&
    m.teamRerollsSpent === 1 &&
    m.rerollUsed === true &&
    !m.numericOriginal &&
    !m.rerollOriginalId &&
    !m.lonerGate &&
    !m.proGate &&
    !m.preRoll &&
    !e.contextualImpact &&
    !e.contextualBounds &&
    !e.possessionBounds &&
    !e.catchPossessionBounds &&
    qm!.sourceTag === "QuestionTeamRerollUsage" &&
    q.scoringStatus === "excluded" &&
    qm!.isRollCandidate === false &&
    q.playerId === e.playerId &&
    q.teamId === e.teamId &&
    qm!.stepType === 4 &&
    qm!.targetId === "-1" &&
    qm!.rerollOffer?.canUseTeamReroll === true &&
    qm!.rerollOffer.gamerId === Number(e.teamId) &&
    qm!.rerollOffer.decisionSourceId === choice.metadata.sourceId &&
    choice.metadata.teamRerollDecision?.used === true &&
    choice.metadata.teamRerollDecision.gamerId === Number(e.teamId) &&
    choice.metadata.actionId === m.actionId &&
    choice.metadata.sequenceId === m.sequenceId &&
    qm!.actionId !== m.actionId &&
    qm!.sequenceId !== m.sequenceId &&
    r.controller.beforeCheckpointAfter < r.questionStepSourceIndex &&
    (r.controller.changeSourceIndex === null
      ? r.controller.beforeGamerId === menu.activeGamerId
      : r.controller.changeSourceIndex > r.controller.beforeCheckpointAfter &&
        r.controller.changeSourceIndex < r.questionStepSourceIndex) &&
    r.questionStepSourceIndex === qi - 1 &&
    r.readySourceIndex === qi + 2 &&
    r.timerSourceIndex === qi + 3 &&
    r.continuationStepSourceIndex === qi + 5 &&
    choice.metadata.sourceIndex === qi + 6 &&
    m.sourceIndex === qi + 7 &&
    menu.checkpointAfter === qi &&
    menu.replayStep === qm!.locator?.replayStep &&
    menu.childIndex === (qm!.locator?.childIndex ?? -2) + 1 &&
    qm!.locator?.messageIndex === 0 &&
    resumed.checkpointAfter === r.timerSourceIndex &&
    resumed.replayStep === menu.replayStep + 1 &&
    resumed.childIndex === 3 &&
    m.locator?.replayStep === menu.replayStep + 2 &&
    m.locator.childIndex === 1 &&
    m.locator.stepIndex === 0 &&
    m.locator.messageIndex === 1 &&
    choice.metadata.locator?.replayStep === m.locator.replayStep &&
    choice.metadata.locator.childIndex === 1 &&
    choice.metadata.locator.stepIndex === 0 &&
    choice.metadata.locator.messageIndex === 0 &&
    snapshot(menu) &&
    snapshot(resumed) &&
    same
  );
}
