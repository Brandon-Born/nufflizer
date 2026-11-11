import { lastBoardCheckpointBefore, type ObservedBoard } from "./boardState";
import { buildPlayerOwnershipIndex } from "./attribution";
import type { ReplayEvent, ReplayModel } from "./types";

export type ActivationEnd = {
  kind: "ordinary_move_completed" | "bone_head" | "really_stupid";
  sourceId: string;
  sourceIndex: number;
  declarationSourceId: string;
  actorId: string;
  teamId: string;
  rosterIndex: number;
  teamTurn: number;
  periodCode: number | null;
  actorCell: { x: number; y: number };
  followingPlayerId: string;
  checkpointAfter: number;
  moveSourceId?: string;
  skillSourceId?: string;
  rollSourceId?: string;
  effectSourceId?: string;
  questionSourceId?: string;
  decisionSourceId?: string;
  lonerSourceId?: string;
  lonerSkillSourceId?: string;
  policy?: "fresh_final" | "kept_original" | "team_loner_replacement";
};

export function sameActivationClock(board: ObservedBoard, end: ActivationEnd) {
  const team = board.teams.find((t) => t.rosterIndex === end.rosterIndex);
  return (
    board.stable === true &&
    board.phaseCode === 5 &&
    board.activeTeamIndex === end.rosterIndex &&
    board.periodCode === end.periodCode &&
    String(team?.explicitTeamId) === end.teamId &&
    team?.gameTurn === end.teamTurn
  );
}

export function applyActivationEnds(
  board: ObservedBoard,
  ends: ReadonlyMap<string, ActivationEnd>
) {
  let current = board;
  const remaining = new Map<string, ActivationEnd>();
  for (const [id, end] of ends) {
    const team = current.teams.find((t) => t.rosterIndex === end.rosterIndex);
    const actor = team?.players.find((p) => String(p.id) === end.actorId);
    if (
      !sameActivationClock(current, end) ||
      !actor ||
      actor.pitchLocation !== "on_pitch" ||
      actor.cell.x !== end.actorCell.x ||
      actor.cell.y !== end.actorCell.y ||
      (end.kind !== "ordinary_move_completed" &&
        (actor.canAct === true || actor.tackleZone === true))
    )
      continue;
    remaining.set(id, end);
    current = {
      ...current,
      teams: current.teams.map((t) =>
        t !== team
          ? t
          : {
              ...t,
              players: t.players.map((p) =>
                p !== actor
                  ? p
                  : {
                      ...p,
                      canAct: false,
                      tackleZone:
                        end.kind === "ordinary_move_completed"
                          ? p.tackleZone
                          : false
                    }
              )
            }
      )
    };
  }
  return { board: current, ends: remaining };
}

function face(p: Record<string, unknown> | undefined) {
  const d = (
    p?.Dice as { Die?: { DieType?: unknown; Value?: unknown } } | undefined
  )?.Die;
  return d?.DieType === 0 &&
    typeof d.Value === "number" &&
    Number.isInteger(d.Value) &&
    d.Value >= 1 &&
    d.Value <= 6
    ? d.Value
    : undefined;
}
function failed(
  p: Record<string, unknown> | undefined,
  type: number,
  status: number,
  fresh: number
) {
  const f = face(p);
  if (
    p?.RollType !== type ||
    p.Status !== status ||
    p.NewRoll !== fresh ||
    p.Outcome !== 0 ||
    f === undefined
  )
    return false;
  if (type === 33)
    return (
      p.Requirement === 2 &&
      p.Difficulty === 2 &&
      f === 1 &&
      (p.Modifiers === undefined || p.Modifiers === "")
    );
  if (
    p.Requirement !== 4 ||
    (p.Difficulty !== 2 && p.Difficulty !== 4) ||
    f >= p.Difficulty
  )
    return false;
  if (p.Difficulty === 4)
    return p.Modifiers === undefined || p.Modifiers === "";
  const mod = (
    p.Modifiers as { Modifier?: Record<string, unknown> } | undefined
  )?.Modifier;
  return (
    mod?.ModifierType === 17 &&
    mod.Value === 2 &&
    mod.Skill === -1 &&
    mod.Effect === -1 &&
    typeof mod.PlayerId === "number"
  );
}
function sameStep(a: ReplayEvent, b: ReplayEvent) {
  return (
    a.stepActorId === b.stepActorId &&
    a.stepTargetId === b.stepTargetId &&
    JSON.stringify(a.payload?.CellFrom) ===
      JSON.stringify(b.payload?.CellFrom) &&
    JSON.stringify(a.payload?.CellTo) === JSON.stringify(b.payload?.CellTo) &&
    a.payload?.Skill === 0 &&
    b.payload?.Skill === 0 &&
    a.payload.IsEvaluation === 0 &&
    b.payload.IsEvaluation === 0 &&
    a.stepType === 0 &&
    b.stepType === 0
  );
}

// UI-007/026 establish distinct terminal reroll emissions. Demo10/9/1
// corroborate effect44 and the next stable board, without treating omission as
// a general false flag. No effect lifetime across turns is inferred here.
export function findMentalActivationEnds(replay: ReplayModel): ActivationEnd[] {
  if (replay.replayVersion !== "1-4-0-0") return [];
  const result: ActivationEnd[] = [];
  const owners = buildPlayerOwnershipIndex(replay).playerToTeam;
  for (const turn of replay.turns) {
    const events = turn.events.filter(
      (e) => !(e.sourceTag === "Carrier" && e.checkpointCarrier)
    );
    for (let i = 0; i < events.length; i++) {
      const effect = events[i]!;
      const raw = effect.payload?.Effect as Record<string, unknown> | undefined;
      const provider = raw?.ProviderId;
      if (
        effect.sourceTag !== "ResultAddPlayerEffect" ||
        !effect.id ||
        raw?.EffectId !== 44 ||
        raw.ProviderType !== 4 ||
        (provider !== 31 && provider !== 51) ||
        JSON.stringify(
          (raw.Durations as { DurationsItem?: unknown } | undefined)
            ?.DurationsItem
        ) !== "[6,1]"
      )
        continue;
      const type = provider === 31 ? 33 : 34;
      const roll = events[i - 1];
      if (!roll || roll.sourceTag !== "ResultRoll" || !roll.id) continue;
      let originalStep: ReplayEvent | undefined,
        declaration: ReplayEvent | undefined,
        skill: ReplayEvent | undefined;
      let question: ReplayEvent | undefined,
        decision: ReplayEvent | undefined,
        loner: ReplayEvent | undefined,
        lonerSkill: ReplayEvent | undefined;
      let policy: ActivationEnd["policy"];
      if (failed(roll.payload, type, 1, 1)) {
        [originalStep, declaration, skill] = events.slice(i - 4, i - 1);
        policy = "fresh_final";
      } else {
        const replacement = failed(roll.payload, type, 2, 1);
        if (!replacement && !failed(roll.payload, type, 1, 0)) continue;
        const continuation = events[i - (replacement ? 5 : 3)];
        decision = events[i - (replacement ? 4 : 2)];
        if (
          !continuation ||
          continuation.sourceTag !== "PlayerStep" ||
          decision?.sourceTag !== "ResultTeamRerollUsage"
        )
          continue;
        const start = i - (replacement ? 9 : 7);
        [originalStep, declaration, skill, question] = events.slice(
          start,
          start + 4
        );
        if (
          !originalStep ||
          !sameStep(originalStep, continuation) ||
          question?.sourceTag !== "QuestionTeamRerollUsage" ||
          !failed(
            question.payload?.RollInfos as Record<string, unknown>,
            type,
            1,
            1
          ) ||
          question.payload?.CanUseProReroll !== 0 ||
          question.payload?.StarSpecialRule !== -1 ||
          question.payload?.CanUseTeamReroll !== 1 ||
          decision.payload?.Used !== Number(replacement) ||
          decision.gamerId !== question.gamerId ||
          decision.actionId !== roll.actionId
        )
          continue;
        const original = question.payload?.RollInfos as Record<string, unknown>;
        if (
          ["Requirement", "Difficulty", "RollType", "Modifiers"].some(
            (field) =>
              JSON.stringify(original[field]) !==
              JSON.stringify(roll.payload?.[field])
          )
        )
          continue;
        if (replacement) {
          lonerSkill = events[i - 3];
          loner = events[i - 2];
          if (
            lonerSkill?.sourceTag !== "ResultSkillUsage" ||
            lonerSkill.payload?.Skill !== 44 ||
            lonerSkill.payload.Used !== 1 ||
            lonerSkill.playerId !== roll.playerId ||
            lonerSkill.actionId !== roll.actionId ||
            loner?.rollType !== 71 ||
            loner.sourceTag !== "ResultRoll" ||
            loner.actionId !== roll.actionId ||
            loner.payload?.Status !== 1 ||
            loner.payload.NewRoll !== 1 ||
            loner.payload.Outcome !== 1 ||
            loner.payload.Requirement !== 4 ||
            loner.payload.Difficulty !== 4 ||
            loner.playerId !== roll.playerId ||
            (loner.payload.Modifiers !== undefined &&
              loner.payload.Modifiers !== "") ||
            (face(loner.payload) ?? 0) < 4
          )
            continue;
        } else if (
          JSON.stringify(question.payload?.RollInfos) !==
          JSON.stringify({ ...roll.payload, NewRoll: 1 })
        )
          continue;
        policy = replacement ? "team_loner_replacement" : "kept_original";
      }
      if (
        originalStep?.sourceTag !== "PlayerStep" ||
        originalStep.stepType !== 0 ||
        originalStep.payload?.Skill !== 0 ||
        originalStep.payload.IsEvaluation !== 0 ||
        declaration?.sourceTag !== "ResultUseAction" ||
        !declaration.id ||
        (declaration.actionCode ?? 0) < 1 ||
        (declaration.actionCode ?? 0) > 6 ||
        skill?.sourceTag !== "ResultSkillUsage" ||
        !skill.id ||
        skill.payload?.Skill !== provider ||
        skill.payload.Used !== 1 ||
        skill.playerId !== roll.playerId ||
        effect.playerId !== roll.playerId ||
        declaration.playerId !== roll.playerId ||
        originalStep.stepActorId !== roll.playerId ||
        roll.stepActorId !== roll.playerId ||
        effect.stepActorId !== roll.playerId ||
        (policy === "fresh_final" && roll.actionId !== declaration.actionId) ||
        skill.actionId !== declaration.actionId ||
        originalStep.actionId !== declaration.actionId ||
        effect.actionId !== roll.actionId ||
        effect.sourceIndex === undefined
      )
        continue;
      const nextStep = events[i + 1],
        following = events[i + 2];
      if (
        nextStep?.sourceTag !== "PlayerStep" ||
        nextStep.stepType !== 0 ||
        nextStep.payload?.Skill !== 0 ||
        nextStep.payload.IsEvaluation !== 0 ||
        following?.sourceTag !== "ResultUseAction" ||
        !following.id ||
        following.sourceIndex === undefined ||
        following.playerId === roll.playerId ||
        following.playerId !== nextStep.stepActorId ||
        following.actionId !== nextStep.actionId ||
        (following.actionCode ?? 0) < 1 ||
        (following.actionCode ?? 0) > 6
      )
        continue;
      const before = lastBoardCheckpointBefore(
        replay.boardCheckpoints ?? [],
        declaration.sourceIndex ?? -1
      );
      const after = lastBoardCheckpointBefore(
        replay.boardCheckpoints ?? [],
        following.sourceIndex
      );
      const a = before?.board,
        b = after?.board;
      if (
        !a ||
        !b ||
        a.issues.length ||
        b.issues.length ||
        a.stable !== true ||
        b.stable !== true ||
        a.phaseCode !== 5 ||
        b.phaseCode !== 5 ||
        a.periodCode !== b.periodCode ||
        after!.afterSourceIndex < effect.sourceIndex
      )
        continue;
      const team = a.teams.find((t) =>
        t.players.some((p) => String(p.id) === roll.playerId)
      );
      const later = b.teams.find((t) => t.rosterIndex === team?.rosterIndex);
      const actor = team?.players.find((p) => String(p.id) === roll.playerId);
      const final = later?.players.find((p) => String(p.id) === roll.playerId);
      const peer = later?.players.find(
        (p) => String(p.id) === following.playerId
      );
      const from = originalStep.payload.CellFrom as
        { X?: number; Y?: number } | undefined;
      const peerFrom = nextStep.payload.CellFrom as
        { X?: number; Y?: number } | undefined;
      if (
        !team ||
        team.explicitTeamId === null ||
        team.rosterIndex !== a.activeTeamIndex ||
        later?.rosterIndex !== b.activeTeamIndex ||
        later.explicitTeamId !== team.explicitTeamId ||
        team.gameTurn === null ||
        team.gameTurn < 1 ||
        later.gameTurn !== team.gameTurn ||
        actor?.canAct !== true ||
        final?.canAct === true ||
        final?.tackleZone === true ||
        actor?.pitchLocation !== "on_pitch" ||
        final?.pitchLocation !== "on_pitch" ||
        actor.cell.x !== from?.X ||
        actor.cell.y !== from?.Y ||
        final.cell.x !== actor.cell.x ||
        final.cell.y !== actor.cell.y ||
        peer?.canAct !== true ||
        peer.cell.x !== peerFrom?.X ||
        peer.cell.y !== peerFrom?.Y
      )
        continue;
      if (declaration.actionCode === 2) {
        const target = a.teams
          .filter((t) => t !== team)
          .flatMap((t) => t.players)
          .find((p) => String(p.id) === originalStep.stepTargetId);
        const to = originalStep.payload.CellTo as
          { X?: number; Y?: number } | undefined;
        if (
          target?.pitchLocation !== "on_pitch" ||
          target.cell.x !== to?.X ||
          target.cell.y !== to?.Y ||
          Math.max(
            Math.abs(actor.cell.x! - target.cell.x!),
            Math.abs(actor.cell.y! - target.cell.y!)
          ) !== 1
        )
          continue;
      }
      const teamId = String(team.explicitTeamId);
      const chain = [
        originalStep,
        declaration,
        skill,
        question,
        decision,
        lonerSkill,
        loner,
        roll,
        effect,
        following
      ].filter((e): e is ReplayEvent => !!e);
      if (
        chain.some(
          (e) =>
            e.attributionConflict ||
            (e.teamId && e.teamId !== teamId) ||
            (e.actorTeamId &&
              e.actorTeamSource !== "turn_inferred" &&
              e.actorTeamId !== teamId) ||
            (e.playerId &&
              owners.has(e.playerId) &&
              owners.get(e.playerId) !== teamId)
        ) ||
        (question && question.gamerId !== teamId)
      )
        continue;
      result.push({
        kind: provider === 31 ? "bone_head" : "really_stupid",
        sourceId: following.id,
        sourceIndex: following.sourceIndex,
        declarationSourceId: declaration.id,
        actorId: roll.playerId!,
        teamId,
        rosterIndex: team.rosterIndex,
        teamTurn: team.gameTurn,
        periodCode: a.periodCode,
        actorCell: { x: actor.cell.x!, y: actor.cell.y! },
        followingPlayerId: following.playerId!,
        checkpointAfter: after!.afterSourceIndex,
        skillSourceId: skill.id,
        rollSourceId: roll.id,
        effectSourceId: effect.id,
        questionSourceId: question?.id,
        decisionSourceId: decision?.id,
        lonerSourceId: loner?.id,
        lonerSkillSourceId: lonerSkill?.id,
        policy
      });
    }
  }
  return result;
}
