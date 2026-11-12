import type { ReplayEvent, ReplayModel } from "@/domain/replay/types";
import { verifyLonerTest } from "@/domain/replay/loner";
import { addDiceLink, type DiceLinks } from "./diceEvidence";
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | undefined =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Obj)
    : undefined;
function d6(p: Obj | undefined) {
  const d = obj(obj(p?.Dice)?.Die);
  return d?.DieType === 0 &&
    Number.isInteger(d.Value) &&
    Number(d.Value) >= 1 &&
    Number(d.Value) <= 6
    ? Number(d.Value)
    : undefined;
}
function face(v: unknown) {
  const d = obj(v);
  return d?.DieType === 2 &&
    Number.isInteger(d.Value) &&
    Number(d.Value) >= 0 &&
    Number(d.Value) <= 4
    ? Number(d.Value)
    : undefined;
}
const controls = new Set([
  "EventGamersAreReady",
  "EventStartActiveTimer",
  "EventRulesEngineStandBy",
  "EventActiveGamerChanged",
  "EventPauseActiveTimer",
  "EventActiveTimerChanged"
]);
function clockBySource(replay: ReplayModel) {
  const out = new Map<number, number>();
  let cursor = 0,
    epoch = 0,
    previous: string | undefined;
  const cps = replay.boardCheckpoints ?? [];
  for (const e of replay.turns.flatMap((t) => t.events)) {
    if (e.sourceIndex === undefined) continue;
    while (
      cursor < cps.length &&
      cps[cursor]!.afterSourceIndex < e.sourceIndex
    ) {
      const b = cps[cursor++]!.board;
      // Controllers can hand off a block/skill decision. This identity clock
      // does not claim controller continuity or restore playable board state.
      const signature = b
        ? JSON.stringify([
            b.phaseCode,
            b.periodCode,
            b.activeTeamIndex,
            b.teams.map((t) => [t.rosterIndex, t.explicitTeamId, t.gameTurn])
          ])
        : "unknown";
      if (signature !== previous) epoch++;
      previous = signature;
    }
    out.set(e.sourceIndex, epoch);
  }
  return out;
}
export function linkBlockDiceCopies(replay: ReplayModel, links: DiceLinks) {
  if (replay.replayVersion !== "1-4-0-0") return;
  const clocks = clockBySource(replay);
  let active:
    | {
        actor: string;
        target: string;
        pool: ReplayEvent;
        faces: number[];
        selected?: ReplayEvent;
        epoch: number | undefined;
        start: number;
      }
    | undefined;
  let ordinal = 0;
  for (const turn of replay.turns)
    for (const e of turn.events) {
      ordinal++;
      if (
        active &&
        (ordinal - active.start > 64 ||
          clocks.get(e.sourceIndex ?? -1) !== active.epoch)
      )
        active = undefined;
      if (e.checkpointCarrier || controls.has(e.sourceTag)) continue;
      const same =
        active &&
        e.stepTag === "PlayerStep" &&
        e.stepType === 6 &&
        e.stepActorId === active.actor &&
        e.stepTargetId === active.target &&
        !e.attributionConflict;
      if (
        e.sourceTag === "QuestionBlockDice" &&
        e.stepTag === "PlayerStep" &&
        e.stepType === 6 &&
        e.stepActorId &&
        e.stepTargetId &&
        !e.attributionConflict
      ) {
        const raw = obj(e.payload?.Dice)?.Die,
          faces = (Array.isArray(raw) ? raw : [raw]).map(face);
        if (
          e.id &&
          faces.length <= 3 &&
          faces.length > 0 &&
          faces.every((f) => f !== undefined)
        )
          active = {
            actor: e.stepActorId,
            target: e.stepTargetId,
            pool: e,
            faces: faces as number[],
            epoch: clocks.get(e.sourceIndex ?? -1),
            start: ordinal
          };
        else active = undefined;
        continue;
      }
      if (!same || !active) {
        active = undefined;
        continue;
      }
      if (e.sourceTag === "QuestionBlockSkillUsage") {
        const copy = obj(e.payload?.RollInfos),
          f = face(copy?.Die);
        if (copy?.RollType === 3 && f !== undefined && active.faces.includes(f))
          addDiceLink(
            links,
            e.id,
            ["RollInfos", "Die"],
            active.pool.id,
            ["Dice"],
            "summary"
          );
      } else if (e.sourceTag === "ResultBlockRoll") {
        const f = face(e.payload?.Die);
        if (f !== undefined && active.faces.includes(f)) active.selected = e;
        else active = undefined;
      } else if (e.sourceTag === "QuestionPushBack") {
        const copy = obj(e.payload?.BlockRoll),
          f = face(copy?.Die),
          selected = active.selected;
        if (
          copy?.RollType === 3 &&
          selected &&
          f === face(selected.payload?.Die) &&
          copy.Outcome === selected.payload?.Outcome
        )
          addDiceLink(
            links,
            e.id,
            ["BlockRoll", "Die"],
            selected.id,
            ["Die"],
            "summary"
          );
      } else if (
        e.sourceTag === "ResultSkillUsage" ||
        e.sourceTag === "QuestionSkillUsage"
      ) {
        // Sidestep changes the push destination, not the already selected die.
        // This bridge preserves only the copied symbol, never tactical state.
        if (
          ![7, 30, 56, 57, 68].includes(Number(e.payload?.Skill)) ||
          ![active.actor, active.target].includes(String(e.payload?.PlayerId))
        )
          active = undefined;
      } else if (
        ![
          "PlayerStep",
          "ResultPushBack",
          "QuestionFollowUp",
          "ResultFollowUp"
        ].includes(e.sourceTag)
      )
        active = undefined;
    }
}
export type TeamDiceIdentity = {
  question: ReplayEvent;
  choice: ReplayEvent;
  final: ReplayEvent;
  used: boolean;
  replacementRolled: boolean;
  originalDie: number;
  finalDie: number;
  directOriginal?: ReplayEvent;
  gate?: ReplayEvent;
  gateSkill?: ReplayEvent;
  gatePassed?: boolean;
};

function pitchCell(value: unknown) {
  const cell = obj(value);
  return cell &&
    Number.isInteger(cell.X) &&
    Number.isInteger(cell.Y) &&
    Number(cell.X) >= 0 &&
    Number(cell.X) <= 25 &&
    Number(cell.Y) >= 0 &&
    Number(cell.Y) <= 14
    ? [Number(cell.X), Number(cell.Y)]
    : undefined;
}

// Source7 casualty questions have explicit copied originals even though that
// damage source is outside the accepted treatment/resource policy. Retain only
// copy identity; this cannot authorize or apply an Apothecary treatment.
export function linkApothecaryDiceCopies(
  replay: ReplayModel,
  links: DiceLinks
) {
  if (replay.replayVersion !== "1-4-0-0") return;
  const events = replay.turns.flatMap((t) => t.events);
  const steps = new Map(
    events.filter((e) => e.type === "step").map((e) => [e.actionId, e])
  );
  const clocks = clockBySource(replay);
  const rollKey = (value: unknown) => {
    const r = obj(value),
      die = obj(obj(r?.Dice)?.Die);
    if (
      !r ||
      !die ||
      r.Status !== 1 ||
      r.Source !== 7 ||
      r.RollType !== 12 ||
      !Number.isInteger(r.Outcome) ||
      Number(r.Outcome) < 0 ||
      Number(r.Outcome) > 10 ||
      die.DieType !== 4 ||
      !Number.isInteger(die.Value) ||
      Number(die.Value) < 1 ||
      Number(die.Value) > 16 ||
      Object.keys(r).some(
        (k) =>
          ![
            "Status",
            "Source",
            "RollType",
            "Outcome",
            "Dice",
            "Modifiers"
          ].includes(k)
      )
    )
      return;
    return JSON.stringify([
      r.Status,
      r.Source,
      r.RollType,
      r.Dice,
      r.Modifiers ?? null
    ]);
  };
  const header = (e: ReplayEvent) => {
    const step = steps.get(e.actionId),
      p = step?.payload;
    const from = pitchCell(p?.CellFrom),
      to = pitchCell(p?.CellTo);
    if (
      !p ||
      !from ||
      JSON.stringify(from) !== JSON.stringify(to) ||
      e.stepTag !== "DamageStep" ||
      e.stepType !== 2 ||
      e.damageSource !== 7 ||
      p.IsEvaluation !== 0 ||
      p.Applied !== 1 ||
      !e.stepActorId ||
      e.stepActorId !== e.stepTargetId ||
      e.playerId !== e.stepActorId ||
      e.targetId !== e.stepActorId ||
      !e.actorTeamId ||
      e.actorTeamSource === "turn_inferred" ||
      e.attributionConflict
    )
      return;
    return JSON.stringify([e.stepActorId, e.actorTeamId, from]);
  };
  for (let i = 0; i < events.length; i++) {
    const q = events[i]!,
      key = header(q),
      original = rollKey(q.payload?.RollInfos);
    if (
      q.sourceTag !== "QuestionApothecaryCasualtyUsage" ||
      !q.id ||
      !key ||
      !original ||
      ![0, 1].includes(Number(q.payload?.GamerId)) ||
      String(q.payload?.GamerId) !== q.actorTeamId
    )
      continue;
    for (let j = i + 1; j < Math.min(events.length, i + 25); j++) {
      const e = events[j]!;
      if (clocks.get(e.sourceIndex ?? -1) !== clocks.get(q.sourceIndex ?? -1))
        break;
      if (
        e.checkpointCarrier ||
        ["EventGamersAreReady", "EventStartActiveTimer"].includes(e.sourceTag)
      )
        continue;
      if (e.type === "step" && header(e) === key) continue;
      if (
        e.sourceTag === "QuestionApothecaryCasualtyChoice" &&
        e.id &&
        header(e) === key &&
        e.actionId !== q.actionId &&
        e.payload?.GamerId === q.payload?.GamerId &&
        rollKey(e.payload?.OriginalRoll) === original
      )
        addDiceLink(
          links,
          e.id,
          ["OriginalRoll", "Dice"],
          q.id,
          ["RollInfos", "Dice"],
          "summary"
        );
      break;
    }
  }
}
// A transaction can identify observed dice without identifying the actor or
// proving a scoring policy. E.g. ThrowTeamMateStep retains opaque thrower/mate
// IDs here, rather than guessing an actor from the active team.
export function findTeamDiceIdentities(replay: ReplayModel) {
  const found: TeamDiceIdentity[] = [];
  if (replay.replayVersion !== "1-4-0-0") return found;
  const es = replay.turns.flatMap((t) => t.events),
    steps = new Map(
      es.filter((e) => e.type === "step").map((e) => [e.actionId, e])
    ),
    clocks = clockBySource(replay);
  const header = (e: ReplayEvent, retainedAccuracy = false) => {
    const p = steps.get(e.actionId)?.payload;
    if (!p || p.IsEvaluation !== 0 || Object.keys(p).length > 32) return;
    const fields = Object.entries(p)
      .filter(
        ([k]) =>
          !(
            retainedAccuracy
              ? ["Probability", "State", "FinalCell"]
              : ["Probability", "State", "CellTo"]
          ).includes(k)
      )
      .sort(([a], [b]) => a.localeCompare(b));
    const encoded = JSON.stringify(fields);
    return encoded.length <= 4096 ? encoded : undefined;
  };
  for (let i = 0; i < es.length; i++) {
    const q = es[i]!,
      original = obj(q.payload?.RollInfos),
      first = d6(original),
      retainedAccuracy =
        q.stepTag === "AccuracyStep" &&
        q.stepType === 17 &&
        original?.RollType === 45,
      key = header(q, retainedAccuracy),
      gamer = q.payload?.GamerId;
    if (
      q.sourceTag !== "QuestionTeamRerollUsage" ||
      !q.id ||
      first === undefined ||
      !original ||
      original.Status !== 1 ||
      original.NewRoll !== 1 ||
      !Number.isInteger(original.RollType) ||
      Number(original.RollType) < 1 ||
      !key ||
      !Number.isInteger(gamer) ||
      !([0, 1] as unknown[]).includes(gamer) ||
      q.attributionConflict
    )
      continue;
    const same = (e: ReplayEvent) =>
      e.stepTag === q.stepTag &&
      e.stepType === q.stepType &&
      e.stepActorId === q.stepActorId &&
      e.stepTargetId === q.stepTargetId &&
      !e.attributionConflict &&
      header(e, retainedAccuracy) === key;
    const next = (from: number) => {
      for (let j = from + 1; j < Math.min(es.length, from + 25); j++) {
        const e = es[j]!;
        if (e.checkpointCarrier || controls.has(e.sourceTag)) continue;
        if (e.type === "step" && same(e)) continue;
        return j;
      }
      return -1;
    };
    const ci = next(i);
    if (ci < 0) continue;
    const choice = es[ci]!;
    if (
      !choice.id ||
      !choice.payload ||
      !same(choice) ||
      choice.sourceTag !== "ResultTeamRerollUsage" ||
      choice.payload?.GamerId !== gamer ||
      (choice.payload.Used !== 0 && choice.payload.Used !== 1) ||
      Object.keys(choice.payload).some((k) => !["Used", "GamerId"].includes(k))
    )
      continue;
    const used = choice.payload.Used === 1;
    let fi = next(ci),
      gate: ReplayEvent | undefined,
      gateSkill: ReplayEvent | undefined,
      passed: boolean | undefined;
    if (fi < 0) continue;
    if (es[fi]!.sourceTag === "ResultSkillUsage") {
      gateSkill = es[fi]!;
      const gi = next(fi);
      if (gi < 0 || !same(gateSkill) || gateSkill.payload?.Used !== 1) continue;
      gate = es[gi]!;
      if (!same(gate) || gate.actionId !== choice.actionId) continue;
      const loner = verifyLonerTest(gateSkill, gate);
      if (used && loner) passed = loner.passed;
      else if (
        !used &&
        gateSkill.payload.Skill === 50 &&
        gate.rollType === 15 &&
        gate.payload?.Status === 1 &&
        gate.payload.NewRoll === 1 &&
        gate.payload.Requirement === 3 &&
        gate.payload.Difficulty === 3 &&
        d6(gate.payload) !== undefined &&
        gate.payload.Outcome === Number(d6(gate.payload)! >= 3)
      )
        passed = gate.payload.Outcome === 1;
      else continue;
      fi = next(gi);
      if (fi < 0) continue;
    }
    const final = es[fi]!,
      last = d6(final.payload),
      replacementRolled = passed ?? used;
    // This source-qualified retained result resolves FinalCell from the
    // declared target square to the actor's unchanged starting square. It is
    // not permission to ignore geometry on other accuracy or movement rolls.
    if (retainedAccuracy) {
      const before = steps.get(q.actionId)?.payload,
        after = steps.get(final.actionId)?.payload;
      const from = pitchCell(before?.CellFrom),
        to = pitchCell(before?.CellTo);
      if (
        used ||
        gate ||
        !from ||
        !to ||
        before?.State !== 1 ||
        after?.State !== 3 ||
        original.Requirement !== 2 ||
        original.Difficulty !== 2 ||
        (original.Modifiers !== undefined && original.Modifiers !== "") ||
        [before, after].some(
          (p) =>
            !p ||
            Object.keys(p).some(
              (k) =>
                ![
                  "FinalCell",
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
            )
        ) ||
        JSON.stringify(from) === JSON.stringify(to) ||
        JSON.stringify(pitchCell(before?.FinalCell)) !== JSON.stringify(to) ||
        JSON.stringify(pitchCell(after?.FinalCell)) !== JSON.stringify(from) ||
        original.Outcome !== 0 ||
        final.payload?.Outcome !== 0
      )
        continue;
    }
    if (
      !final.id ||
      !final.payload ||
      !same(final) ||
      final.sourceTag !== "ResultRoll" ||
      last === undefined ||
      final.payload?.RollType !== original.RollType ||
      JSON.stringify([
        final.payload.Requirement,
        final.payload.Difficulty,
        final.payload.Modifiers ?? null
      ]) !==
        JSON.stringify([
          original.Requirement,
          original.Difficulty,
          original.Modifiers ?? null
        ]) ||
      final.payload.Status !== (replacementRolled ? 2 : 1) ||
      final.payload.NewRoll !== (replacementRolled ? 1 : 0) ||
      (!replacementRolled && last !== first) ||
      clocks.get(q.sourceIndex ?? -1) !== clocks.get(final.sourceIndex ?? -1)
    )
      continue;
    const directOriginal = es
      .slice(Math.max(0, i - 16), i)
      .find(
        (e) =>
          e.sourceTag === "ResultRoll" &&
          e.actionId === q.actionId &&
          same(e) &&
          JSON.stringify(e.payload) === JSON.stringify(original)
      );
    found.push({
      question: q,
      choice,
      final,
      used,
      replacementRolled,
      originalDie: first,
      finalDie: last,
      directOriginal,
      gate,
      gateSkill,
      gatePassed: passed
    });
  }
  return found;
}
