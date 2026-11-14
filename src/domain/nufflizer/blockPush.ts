import type { ReplayEvent, ReplayModel } from "@/domain/replay/types";
import { lastBoardCheckpointBefore } from "@/domain/replay/boardState";
import {
  findPushTraitEvidence,
  type CurrentTraitEvidence
} from "@/domain/replay/traitContinuity";
import type { OwnershipTimeline } from "@/domain/replay/ownershipTimeline";
import type { ObservedBlockConsequence } from "./blockConsequences";
import type { LuckEvent } from "./types";
import {
  enumeratePushSuccessors,
  pushPositionChanges,
  type PushCell,
  type PushPlayer,
  onPushPitch
} from "./pushSuccessors";

// Independently named intrinsic skills without ordinary push/follow changes.
// Grab, Sidestep, Stand Firm, Fend, Frenzy, Root, Strip Ball and unknown skills
// need their own policies; a recorded menu alone cannot fill current skills.
const passive = new Set([
  6, 7, 10, 13, 15, 19, 26, 27, 30, 38, 44, 50, 57, 59, 61, 63, 68, 75, 81, 1008
]);
export function ordinaryPushPolicy(p: CurrentTraitEvidence | undefined) {
  const t = p?.traits;
  return (
    !!p &&
    t?.dataPlayerId === Number(p.playerId) &&
    t.playerTypeId !== null &&
    t.innateSkills !== null &&
    t.acquiredSkills !== null &&
    [...t.innateSkills, ...t.acquiredSkills].every((s) => passive.has(s))
  );
}
function obj(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}
function cell(v: unknown): PushCell | undefined {
  const c = obj(v);
  return c &&
    Object.keys(c).every((k) => k === "X" || k === "Y") &&
    Number.isSafeInteger(c.X) &&
    Number.isSafeInteger(c.Y)
    ? { x: Number(c.X), y: Number(c.Y) }
    : undefined;
}
const equal = (a: PushCell | undefined, b: PushCell | undefined) =>
  !!a && !!b && a.x === b.x && a.y === b.y;
const setOf = (cs: readonly PushCell[]) =>
  cs
    .map((c) => `${c.x},${c.y}`)
    .sort()
    .join(";");
function offered(event: ReplayEvent) {
  const p = event.payload,
    c = obj(p?.CellTo),
    list = c?.Cell;
  if (
    !p ||
    Object.keys(p).some(
      (k) => !["GamerId", "CellFrom", "CellTo", "BlockRoll"].includes(k)
    ) ||
    !c ||
    Object.keys(c).join() !== "Cell"
  )
    return;
  const xs = Array.isArray(list) ? list : [list],
    cs = xs.map(cell);
  if (
    xs.length < 1 ||
    xs.length > 8 ||
    cs.some((c) => !c) ||
    new Set(cs.map((c) => `${c!.x},${c!.y}`)).size !== xs.length
  )
    return;
  return {
    gamerId: p.GamerId,
    from: cell(p.CellFrom),
    cells: cs as PushCell[]
  };
}
const continuation = new Set([
  "QuestionBlockDice",
  "QuestionBlockSkillUsage",
  "ResultSkillUsage",
  "ResultBlockRoll",
  "QuestionPushBack"
]);

export function attachBlockPush(
  replay: ReplayModel,
  sources: ReadonlyMap<string, LuckEvent>,
  facts: readonly ObservedBlockConsequence[],
  owners: OwnershipTimeline
) {
  if (replay.replayVersion !== "1-4-0-0") return;
  const es = replay.turns.flatMap((t) => t.events),
    indices = new Map(es.map((e, i) => [e.id, i])),
    knowledge = findPushTraitEvidence(replay, owners);
  for (const event of es) {
    if (event.sourceTag !== "QuestionPushBack" || !event.id) continue;
    const info = offered(event),
      row = sources.get(event.id);
    if (
      row &&
      info?.from &&
      onPushPitch(info.from) &&
      (info.gamerId === 0 || info.gamerId === 1) &&
      info.cells.every(
        (c) =>
          c.x >= -1 &&
          c.x <= 26 &&
          c.y >= -1 &&
          c.y <= 15 &&
          Math.max(
            Math.abs(c.x - info.from!.x),
            Math.abs(c.y - info.from!.y)
          ) === 1
      )
    )
      row.metadata.pushQuestion = {
        from: info.from,
        offered: info.cells,
        gamerId: info.gamerId
      };
  }
  const checkpoints = replay.boardCheckpoints ?? [];
  // Pitch dimensions are match configuration, not omitted physical state.
  // Keep the actual source pointer; an explicit incompatible/partial refresh
  // invalidates it. No snapshot field is filled or changed.
  const completeRoster = new Map<(typeof checkpoints)[number], boolean>();
  const registered = new Set(
    Array.from(owners.initial.teamToPlayers.values()).flatMap((ids) =>
      Array.from(ids)
    )
  );
  let registryCursor = 0;
  for (const cp of checkpoints) {
    while (
      registryCursor < es.length &&
      (es[registryCursor]!.sourceIndex ?? Infinity) <= cp.afterSourceIndex
    ) {
      const e = es[registryCursor++]!,
        id = e.payload?.MercenaryId;
      if (typeof id === "number" && Number.isSafeInteger(id) && id >= 0) {
        if (e.sourceTag === "EventRemoveMercenary")
          registered.delete(String(id));
        if (e.sourceTag === "EventBuyMercenary") registered.add(String(id));
      }
    }
    const present = new Set(
      cp.board?.teams.flatMap((t) =>
        t.players.flatMap((p) => (p.id === null ? [] : [String(p.id)]))
      ) ?? []
    );
    for (const id of present) registered.add(id);
    completeRoster.set(
      cp,
      registered.size <= 128 &&
        Array.from(registered).every((id) => present.has(id))
    );
  }
  const layout = new Map<(typeof checkpoints)[number], number>();
  let pitchSource: number | undefined;
  for (const cp of checkpoints) {
    if (
      cp.board?.pitchLayout === "standard" &&
      cp.board.standardPitchCompatible
    )
      pitchSource = cp.afterSourceIndex;
    else if (cp.board?.pitchLayoutObserved && !cp.board.standardPitchCompatible)
      pitchSource = undefined;
    if (pitchSource !== undefined) layout.set(cp, pitchSource);
  }
  for (const fact of facts) {
    const pool = sources.get(fact.poolSourceId),
      block = pool?.metadata.block;
    if (
      !pool ||
      !block ||
      !["push", "defender_pushed_down"].includes(fact.outcome)
    )
      continue;
    const start = indices.get(fact.poolSourceId),
      end = indices.get(fact.finalSourceId);
    if (start === undefined || end === undefined) continue;
    const questions = es
        .slice(start + 1, end)
        .filter((e) => e.sourceTag === "QuestionPushBack"),
      q = questions[0];
    if (!q?.id || q.sourceIndex === undefined) continue;
    const status = (
      reason: Extract<
        NonNullable<LuckEvent["metadata"]["blockPush"]>,
        { status: "unsupported" }
      >["reason"]
    ) => {
      pool.metadata.blockPush = {
        status: "unsupported",
        questionSourceId: q.id!,
        reason
      };
    };
    const cp = lastBoardCheckpointBefore(checkpoints, q.sourceIndex),
      board = cp?.board,
      k = knowledge.get(q.id);
    if (
      !cp ||
      !board ||
      board.phaseCode !== 5 ||
      board.issues.length ||
      !layout.has(cp) ||
      !completeRoster.get(cp) ||
      !k ||
      k.checkpointAfter !== cp.afterSourceIndex
    ) {
      status("missing_current_state");
      continue;
    }
    const observed = board.teams.flatMap((t) =>
        t.players.map((p) => ({ p, t }))
      ),
      known = knowledge.get(q.id)!.players;
    const players: PushPlayer[] = [];
    let complete = true;
    for (const { p, t } of observed) {
      if (p.id === null || p.pitchLocation === "unknown") {
        complete = false;
        break;
      }
      if (p.pitchLocation === "off_pitch") continue;
      const id = String(p.id),
        proof = owners.resolve(id, q),
        trait = known.find((x) => x.playerId === id);
      if (
        proof.status !== "confirmed" ||
        p.cell.x === null ||
        p.cell.y === null ||
        (t.explicitTeamId !== null &&
          String(t.explicitTeamId) !== proof.proof.teamId)
      ) {
        complete = false;
        break;
      }
      players.push({
        id,
        teamId: proof.proof.teamId,
        cell: { x: p.cell.x, y: p.cell.y },
        ordinaryPolicy: ordinaryPushPolicy(trait)
      });
    }
    if (!complete) {
      status("missing_current_state");
      continue;
    }
    const a = players.find((p) => p.id === block.attackerId),
      d = players.find((p) => p.id === block.defenderId),
      choice = offered(q);
    if (
      !a ||
      !d ||
      !choice?.from ||
      !equal(d.cell, choice.from) ||
      a.teamId !== pool.teamId ||
      d.teamId !== block.defenderTeamId ||
      (choice.gamerId !== 0 && choice.gamerId !== 1) ||
      String(choice.gamerId) !== a.teamId
    ) {
      status("source_choice_mismatch");
      continue;
    }
    if (
      [a, d].some((p) => {
        const proof = known.find((t) => t.playerId === p.id);
        return (
          !proof ||
          proof.tackleZone !== true ||
          (proof.statusCode !== null && proof.statusCode !== 0)
        );
      })
    ) {
      status("unknown_push_policy");
      continue;
    }
    let low = 0,
      high = es.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if ((es[mid]!.sourceIndex ?? Infinity) <= cp.afterSourceIndex)
        low = mid + 1;
      else high = mid;
    }
    const questionIndex = indices.get(q.id)!;
    const before =
      questionIndex - low > 256 ? [] : es.slice(low, questionIndex);
    if (
      questionIndex - low > 256 ||
      before.some(
        (e) =>
          !(e.sourceTag === "Carrier" && e.checkpointCarrier) &&
          !(
            e.sourceTag === "PlayerStep" &&
            e.stepType === 6 &&
            e.stepActorId === a.id &&
            e.stepTargetId === d.id &&
            e.payload?.Skill === 0 &&
            e.payload.IsEvaluation === 0 &&
            equal(cell(e.payload.CellFrom), a.cell)
          ) &&
          !(
            continuation.has(e.sourceTag) &&
            e.stepTag === "PlayerStep" &&
            e.stepType === 6 &&
            e.stepActorId === a.id &&
            e.stepTargetId === d.id &&
            !e.attributionConflict
          )
      )
    ) {
      status("unverified_source_order");
      continue;
    }
    const problem = { attackerId: a.id, defenderId: d.id, players },
      solution = enumeratePushSuccessors(problem);
    if (solution.status === "unsupported") {
      status(
        solution.reason === "invalid_board"
          ? "missing_current_state"
          : solution.reason
      );
      continue;
    }
    if (setOf(solution.destinations) !== setOf(choice.cells)) {
      status("source_choice_mismatch");
      continue;
    }
    const final = es[end]!,
      container = obj(final.payload?.Pushbacks),
      rawPushes = container?.ResultPushBack;
    if (
      !container ||
      Object.keys(container).some((k) => k !== "ResultPushBack")
    ) {
      status("unverified_push_chain");
      continue;
    }
    const pushes = (Array.isArray(rawPushes) ? rawPushes : [rawPushes]).map(
      (v) => {
        const p = obj(v);
        return {
          valid:
            !!p &&
            Object.keys(p).every((k) =>
              ["PushedPlayerId", "CellFrom", "CellTo", "Resolution"].includes(k)
            ),
          playerId: p?.PushedPlayerId,
          from: cell(p?.CellFrom),
          to: cell(p?.CellTo),
          resolution: p?.Resolution
        };
      }
    );
    const selected = solution.branches.find(
      (b) =>
        b.follow === (final.payload?.Follow === 1) &&
        b.moves.length === pushes.length &&
        b.moves.every((m) =>
          pushes.some(
            (p) =>
              p.valid &&
              String(p.playerId) === m.playerId &&
              p.resolution === 3 &&
              equal(p.from, m.from) &&
              equal(p.to, m.to)
          )
        )
    );
    const actual = es
      .slice(indices.get(q.id)! + 1, end)
      .filter((e) => e.sourceTag === "ResultPushBack");
    if (
      !selected ||
      actual.length !== pushes.length ||
      !actual.every((e) => {
        const p = obj(e.payload);
        return (
          p &&
          Object.keys(p).every((k) =>
            ["PushedPlayerId", "CellFrom", "CellTo", "Resolution"].includes(k)
          ) &&
          selected.moves.some(
            (m) =>
              String(p?.PushedPlayerId) === m.playerId &&
              p?.Resolution === 3 &&
              equal(cell(p?.CellFrom), m.from) &&
              equal(cell(p?.CellTo), m.to)
          )
        );
      })
    ) {
      status("unverified_push_chain");
      continue;
    }
    const seenSubjects = new Set<string>();
    let questionsValid = true;
    for (const question of questions) {
      const info = offered(question),
        part = selected.moves.findIndex((m) => equal(m.from, info?.from)),
        rawBlock = obj(question.payload?.BlockRoll),
        die = obj(rawBlock?.Die);
      if (
        !info ||
        part < 0 ||
        seenSubjects.has(selected.moves[part]!.playerId) ||
        String(info.gamerId) !== a.teamId ||
        !rawBlock ||
        Object.keys(rawBlock).some(
          (k) =>
            ![
              "Assists",
              "Die",
              "NewRoll",
              "Outcome",
              "RollStatus",
              "RollType",
              "StModifiers"
            ].includes(k)
        ) ||
        !die ||
        Object.keys(die).some((k) => k !== "DieType" && k !== "Value") ||
        ![0, 1].includes(rawBlock.NewRoll as number) ||
        rawBlock.RollStatus !== es[start]!.payload?.RollStatus ||
        die.DieType !== 2 ||
        die.Value !== block.selectedFace ||
        rawBlock?.RollType !== 3 ||
        rawBlock.Outcome !== block.finalOutcome
      ) {
        questionsValid = false;
        break;
      }
      seenSubjects.add(selected.moves[part]!.playerId);
      const options = solution.branches
        .filter((b) =>
          selected.moves
            .slice(0, part)
            .every((m, i) => JSON.stringify(b.moves[i]) === JSON.stringify(m))
        )
        .flatMap((b) => (b.moves[part] ? [b.moves[part]!.to] : []));
      const unique = Array.from(
        new Map(options.map((c) => [`${c.x},${c.y}`, c])).values()
      );
      if (setOf(unique) !== setOf(info.cells)) {
        questionsValid = false;
        break;
      }
    }
    if (!questionsValid) {
      status("unverified_push_chain");
      continue;
    }
    for (const question of questions) {
      const r = sources.get(question.id!),
        info = offered(question)!;
      if (r)
        r.metadata.pushQuestion = {
          from: info.from!,
          offered: info.cells,
          gamerId: info.gamerId as 0 | 1
        };
    }
    for (const e of actual) {
      const p = e.payload!,
        r = sources.get(e.id!);
      if (r)
        r.metadata.pushResult = {
          playerId: String(p.PushedPlayerId),
          from: cell(p.CellFrom)!,
          to: cell(p.CellTo)!,
          resolution: 3
        };
    }
    const finalReport = sources.get(fact.finalSourceId);
    if (!finalReport) continue;
    finalReport.metadata.pushAppliedFollow = final.payload!.Follow === 1;
    pool.metadata.blockPush = {
      status: "modeled",
      questionSourceId: q.id,
      questionSourceIds: questions.map((q) => q.id!),
      checkpointAfter: cp.afterSourceIndex,
      pitchCheckpointAfter: layout.get(cp)!,
      policy: "ordinary_push_positions",
      players,
      traitEvidence: known.filter((t) =>
        players.some((p) => p.id === t.playerId && p.ordinaryPolicy)
      ),
      destinations: solution.destinations,
      branches: solution.branches.map((b) => ({
        ...b,
        positions: pushPositionChanges(problem, b)
      })),
      selectedBranch: solution.branches.indexOf(selected),
      resultSourceIds: actual.map((e) => e.id!)
    };
  }
}

export function validReportedBlockPush(
  pool: LuckEvent,
  sources: ReadonlyMap<string, LuckEvent>,
  teams: ReadonlySet<string>
) {
  const m = pool.metadata.blockPush,
    block = pool.metadata.block;
  if (
    !m ||
    !block ||
    !["push", "defender_pushed_down"].includes(
      pool.metadata.blockResolution?.outcome ?? ""
    )
  )
    return false;
  const q = sources.get(m.questionSourceId),
    final = sources.get(block.finalSourceId ?? "");
  if (
    !q ||
    !final ||
    q.metadata.sourceTag !== "QuestionPushBack" ||
    (q.metadata.sourceIndex ?? -1) <= (pool.metadata.sourceIndex ?? Infinity) ||
    (q.metadata.sourceIndex ?? Infinity) >= (final.metadata.sourceIndex ?? -1)
  )
    return false;
  if (m.status === "unsupported") return true;
  if (
    m.checkpointAfter >= (q.metadata.sourceIndex ?? -1) ||
    m.pitchCheckpointAfter > m.checkpointAfter ||
    new Set(m.traitEvidence.map((p) => p.playerId)).size !==
      m.traitEvidence.length ||
    m.players.some((p) => !teams.has(p.teamId))
  )
    return false;
  const proof = new Map(m.traitEvidence.map((p) => [p.playerId, p]));
  if (
    m.traitEvidence.some(
      (p) =>
        !p.onPitch ||
        p.observedCheckpointAfter > p.currentCheckpointAfter ||
        p.currentCheckpointAfter !== m.checkpointAfter ||
        p.prayersCheckpointAfter > p.currentCheckpointAfter ||
        !m.players.some((x) => x.id === p.playerId && x.teamId === p.teamId)
    ) ||
    m.players.some(
      (p) => p.ordinaryPolicy !== ordinaryPushPolicy(proof.get(p.id))
    )
  )
    return false;
  if (
    [block.attackerId, block.defenderId].some((id) => {
      const p = proof.get(id);
      return (
        !p ||
        p.tackleZone !== true ||
        (p.statusCode !== null && p.statusCode !== 0)
      );
    })
  )
    return false;
  const problem = {
      attackerId: block.attackerId,
      defenderId: block.defenderId,
      players: m.players
    },
    solution = enumeratePushSuccessors(problem);
  if (
    solution.status !== "supported" ||
    JSON.stringify(m.destinations) !== JSON.stringify(solution.destinations) ||
    JSON.stringify(m.branches) !==
      JSON.stringify(
        solution.branches.map((b) => ({
          ...b,
          positions: pushPositionChanges(problem, b)
        }))
      )
  )
    return false;
  const selected = m.branches[m.selectedBranch];
  if (
    !selected ||
    selected.follow !== final.metadata.pushAppliedFollow ||
    m.resultSourceIds.length !== selected.moves.length ||
    m.questionSourceIds[0] !== m.questionSourceId ||
    new Set(m.questionSourceIds).size !== m.questionSourceIds.length ||
    new Set(m.resultSourceIds).size !== m.resultSourceIds.length
  )
    return false;
  const seen = new Set<string>();
  for (const id of m.questionSourceIds) {
    const event = sources.get(id),
      info = event?.metadata.pushQuestion,
      part = selected.moves.findIndex((p) => equal(p.from, info?.from));
    if (
      !event ||
      !info ||
      part < 0 ||
      seen.has(selected.moves[part]!.playerId) ||
      String(info.gamerId) !== pool.teamId ||
      event.metadata.sourceTag !== "QuestionPushBack" ||
      (event.metadata.sourceIndex ?? -1) <=
        (pool.metadata.sourceIndex ?? Infinity) ||
      (event.metadata.sourceIndex ?? Infinity) >=
        (final.metadata.sourceIndex ?? -1)
    )
      return false;
    seen.add(selected.moves[part]!.playerId);
    const options = solution.branches
      .filter((b) =>
        selected.moves
          .slice(0, part)
          .every((p, i) => JSON.stringify(b.moves[i]) === JSON.stringify(p))
      )
      .flatMap((b) => (b.moves[part] ? [b.moves[part]!.to] : []));
    if (
      setOf(info.offered) !==
      setOf(
        Array.from(new Map(options.map((c) => [`${c.x},${c.y}`, c])).values())
      )
    )
      return false;
  }
  const results = m.resultSourceIds.map((id) => sources.get(id));
  return (
    results.every(
      (e) =>
        e?.metadata.sourceTag === "ResultPushBack" &&
        e.metadata.pushResult &&
        (e.metadata.sourceIndex ?? -1) > (q.metadata.sourceIndex ?? Infinity) &&
        (e.metadata.sourceIndex ?? Infinity) <
          (final.metadata.sourceIndex ?? -1)
    ) &&
    selected.moves.every(
      (move) =>
        results.filter(
          (r) =>
            r?.metadata.pushResult?.playerId === move.playerId &&
            equal(r.metadata.pushResult.from, move.from) &&
            equal(r.metadata.pushResult.to, move.to)
        ).length === 1
    )
  );
}
