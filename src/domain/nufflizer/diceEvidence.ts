import type { ReplayEvent, ReplayModel } from "@/domain/replay/types";
import { REPLAY_LIMITS } from "@/domain/replay/limits";
import { ReplayValidationError } from "@/lib/errors";
import type { LuckEvent } from "./types";
export type DicePath = (string | number)[];
export type DiceRecord = {
  id: string;
  parentOrdinal: number;
  parentSourceId?: string;
  parentSourceIndex?: number;
  parentSourceTag: string;
  locator?: ReplayEvent["locator"];
  parentEventId?: string;
  actionId?: string;
  stepTag?: string;
  stepType?: number;
  stepActorId?: string;
  stepTargetId?: string;
  damageSource?: number;
  status?: number;
  newRoll?: number;
  rollStatus?: number;
  freshDiceIndexes?: (number | null)[];
  path: DicePath;
  rollType?: number;
  dice: { value: number | null; dieType: number | null }[];
  quality: "complete" | "incomplete" | "malformed" | "not_applicable";
  disposition:
    "covered_roll" | "unscored_roll" | "summary" | "unresolved" | "nonrandom";
  eventId?: string;
  aliasOf?: string;
};
export type DiceAlias = { sourceId: string; path: DicePath };
export type DiceLinks = Map<
  string,
  { path: DicePath; target: DiceAlias; kind: "summary" | "policy_original" }[]
>;
function obj(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function integer(value: unknown, min = 0, max = 1_000_000): number | undefined {
  if (typeof value === "string" && /^-?\d{1,9}$/.test(value))
    value = Number(value);
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= min &&
    value <= max
    ? value
    : undefined;
}
const pathKey = (path: DicePath) => JSON.stringify(path);
const rawKey = (source: string, path: DicePath) =>
  JSON.stringify([source, path]);
export function addDiceLink(
  links: DiceLinks,
  source: string | undefined,
  path: DicePath,
  target: string | undefined,
  targetPath: DicePath,
  kind: "summary" | "policy_original"
) {
  if (!source || !target) return;
  const list = links.get(source) ?? [];
  list.push({ path, target: { sourceId: target, path: targetPath }, kind });
  links.set(source, list);
}
// A dice field is evidence, not a universal freshness/status convention. This
// walk also retains selected-die fields, whose identity is reconciled later.
export function inventoryDiceRecords(replay: ReplayModel) {
  const records: DiceRecord[] = [],
    rawByRecord = new Map<string, ReplayEvent>();
  let visited = 0,
    ordinal = 0;
  const append = (
    raw: ReplayEvent,
    parentOrdinal: number,
    path: DicePath,
    entries: unknown,
    rollType: number | undefined,
    flags: Record<string, unknown>
  ) => {
    if (path.length > REPLAY_LIMITS.xmlDepth * 2)
      throw new ReplayValidationError(
        "Replay dice-evidence path limit exceeded."
      );
    if (records.length >= REPLAY_LIMITS.events)
      throw new ReplayValidationError(
        "Replay dice-evidence record limit exceeded."
      );
    const faces = Array.isArray(entries) ? entries : [entries];
    if (faces.length > 6)
      throw new ReplayValidationError(
        "Replay dice-evidence group exceeds six dice."
      );
    let malformed = !faces.length,
      incomplete = false;
    const dice = faces.map((value) => {
      const d = obj(value),
        v = integer(d?.Value, 0, 100),
        t = integer(d?.DieType);
      if (!d || v === undefined) malformed = true;
      if (d?.DieType === undefined) incomplete = true;
      else if (t === undefined) malformed = true;
      // These numeric namespaces already have admitted D6/block bounds. Other
      // die types are retained without deriving sides from the observed face.
      if ((t === 0 && (v === 0 || (v ?? 0) > 6)) || (t === 2 && (v ?? 0) > 4))
        malformed = true;
      return { value: v ?? null, dieType: t ?? null };
    });
    const placeholder =
      replay.replayVersion === "1-4-0-0" &&
      raw.sourceTag === "QuestionPushBack" &&
      rollType === 0 &&
      pathKey(path) === pathKey(["BlockRoll", "Die"]) &&
      dice.length === 1 &&
      dice[0]!.value === 0 &&
      dice[0]!.dieType === 0;
    let freshDiceIndexes: (number | null)[] | undefined;
    if (Object.hasOwn(flags, "RolledDiceIndexes")) {
      const container = obj(flags.RolledDiceIndexes),
        values = container?.RolledDiceIndexesItem;
      const list =
        flags.RolledDiceIndexes === ""
          ? []
          : Array.isArray(values)
            ? values
            : [values];
      if (list.length > 6)
        throw new ReplayValidationError(
          "Replay fresh-dice index limit exceeded."
        );
      freshDiceIndexes = list.map((v) => integer(v, 0, 5) ?? null);
      if (freshDiceIndexes.some((v) => v === null)) malformed = true;
    }
    const id = `dice-${records.length}`;
    records.push({
      id,
      parentOrdinal,
      parentSourceId: raw.id,
      parentSourceIndex: raw.sourceIndex,
      parentSourceTag: raw.sourceTag,
      locator: raw.locator,
      actionId: raw.actionId,
      stepTag: raw.stepTag,
      stepType: raw.stepType,
      stepActorId: raw.stepActorId,
      stepTargetId: raw.stepTargetId,
      damageSource: raw.damageSource,
      status: integer(flags.Status),
      newRoll: integer(flags.NewRoll),
      rollStatus: integer(flags.RollStatus),
      freshDiceIndexes,
      path,
      rollType,
      dice,
      quality: placeholder
        ? "not_applicable"
        : malformed
          ? "malformed"
          : incomplete
            ? "incomplete"
            : "complete",
      disposition: placeholder ? "nonrandom" : "unresolved"
    });
    rawByRecord.set(id, raw);
  };
  for (const turn of replay.turns)
    for (const raw of turn.events) {
      const parentOrdinal = ordinal++;
      const walk = (
        value: unknown,
        path: DicePath,
        inheritedType: number | undefined
      ) => {
        if (
          ++visited > REPLAY_LIMITS.xmlNodes ||
          path.length > REPLAY_LIMITS.xmlDepth * 2
        )
          throw new ReplayValidationError(
            "Replay dice-evidence work limit exceeded."
          );
        if (Array.isArray(value)) {
          for (let i = 0; i < value.length; i++)
            walk(value[i], path.concat(i), inheritedType);
          return;
        }
        const node = obj(value);
        if (!node) return;
        const rollType = integer(node.RollType) ?? inheritedType;
        for (const [key, child] of Object.entries(node)) {
          if (key.length > 128)
            throw new ReplayValidationError(
              "Replay dice-evidence field name exceeds its limit."
            );
          if (key === "Dice") {
            const containers = Array.isArray(child) ? child : [child];
            for (let i = 0; i < containers.length; i++) {
              const container = obj(containers[i]),
                location = path.concat(
                  key,
                  ...(Array.isArray(child) ? [i] : [])
                );
              append(
                raw,
                parentOrdinal,
                location,
                container?.Die,
                rollType,
                node
              );
              if (container)
                for (const [k, v] of Object.entries(container))
                  if (k !== "Die") walk(v, location.concat(k), rollType);
            }
          } else if (key === "Die") {
            const container = obj(child);
            if (container && Object.hasOwn(container, "Die"))
              append(
                raw,
                parentOrdinal,
                path.concat(key),
                container.Die,
                rollType,
                node
              );
            else
              append(
                raw,
                parentOrdinal,
                path.concat(key),
                child,
                rollType,
                node
              );
          } else walk(child, path.concat(key), rollType);
        }
      };
      walk(raw.payload, [], integer(raw.rollType));
    }
  return { records, rawByRecord };
}
const direct = (path: DicePath) =>
  path.length === 1 && (path[0] === "Dice" || path[0] === "Die");
const knownNested = (raw: ReplayEvent, path: DicePath) => {
  const p = pathKey(path);
  return (
    raw.locator?.stepIndex === undefined &&
    ((raw.sourceTag === "EventFanFactor" &&
      [pathKey(["HomeRoll", "Dice"]), pathKey(["AwayRoll", "Dice"])].includes(
        p
      )) ||
      ([
        "EventBrilliantCoaching",
        "EventCheeringFans",
        "EventOfficiousRef",
        "EventPitchInvasion"
      ].includes(raw.sourceTag) &&
        path.length === 5 &&
        path[0] === "RollOff" &&
        path[1] === "Rolls" &&
        path[2] === "ResultRoll" &&
        typeof path[3] === "number" &&
        path[4] === "Dice") ||
      (raw.sourceTag === "EventOfficiousRef" &&
        p === pathKey(["PlayerResults", "ResultOfficiousRef", "Die"])) ||
      (["EventBlitz", "EventQuickSnap", "EventQuestionSolidDefence"].includes(
        raw.sourceTag
      ) &&
        p === pathKey(["Result", "Die"])))
  );
};
function nestedEvent(
  record: DiceRecord,
  raw: ReplayEvent,
  turn: number,
  replay: ReplayModel
): LuckEvent {
  const role =
    raw.sourceTag === "EventFanFactor" && record.path[0] === "HomeRoll"
      ? 0
      : raw.sourceTag === "EventFanFactor" && record.path[0] === "AwayRoll"
        ? 1
        : undefined;
  const team =
    role !== undefined &&
    replay.replayVersion === "1-4-0-0" &&
    replay.teams.length === 2
      ? replay.teams[role]
      : undefined;
  const distinct =
    replay.replayVersion === "1-4-0-0" &&
    knownNested(raw, record.path) &&
    record.quality !== "malformed";
  const name =
    (
      {
        EventFanFactor: "fan-factor",
        EventBrilliantCoaching: "coaching roll-off",
        EventCheeringFans: "cheering roll-off",
        EventOfficiousRef:
          record.path[0] === "PlayerResults"
            ? "referee-player"
            : "referee roll-off",
        EventPitchInvasion: "pitch-invasion roll-off",
        EventBlitz: "Blitz count",
        EventQuickSnap: "quick-snap count",
        EventQuestionSolidDefence: "solid-defence count"
      } as Record<string, string>
    )[raw.sourceTag] ?? "nested";
  return {
    id: `nested-${record.id}`,
    turn,
    teamId: team?.id ?? "unresolved",
    teamName: team?.name ?? "Unresolved",
    type: "unknown",
    probabilitySuccess: null,
    actualSuccess: null,
    delta: 0,
    weightedDelta: 0,
    label: `Recorded ${name} dice (not scored)`,
    tags: [],
    scoringStatus: "excluded",
    statusReason:
      record.quality === "malformed"
        ? "excluded: malformed observed dice evidence"
        : distinct
          ? "excluded: observed nested roll has no accepted probability/value contract"
          : "excluded: nested dice outcome identity is unresolved",
    explainability: {
      target: "Unknown outcome distribution",
      weight: 0,
      inputsSummary: `Recorded dice at ${record.path.join(".")}; no success, die size or favorable value is inferred.`
    },
    metadata: {
      sourceTag: raw.sourceTag,
      sourceId: `nested-${record.id}`,
      sourceIndex: raw.sourceIndex,
      locator: raw.locator,
      rollType: record.rollType,
      isRollCandidate: true,
      diceEvidenceId: record.id,
      dice: record.dice.every((d) => d.value !== null)
        ? record.dice.map((d) => d.value!)
        : undefined,
      dieTypes: record.dice.every((d) => d.dieType !== null)
        ? record.dice.map((d) => d.dieType!)
        : undefined
    }
  };
}
export function summarizeDiceRecords(records: readonly DiceRecord[]) {
  const n = (kind: DiceRecord["disposition"]) =>
    records.filter((r) => r.disposition === kind).length;
  const coveredCount = n("covered_roll"),
    unscoredCount = n("unscored_roll"),
    summaryCount = n("summary"),
    unresolvedCount = n("unresolved"),
    denominator = coveredCount + unscoredCount + unresolvedCount;
  return {
    recordCount: records.length,
    coveredCount,
    unscoredCount,
    summaryCount,
    nonrandomCount: n("nonrandom"),
    unresolvedCount,
    malformedCount: records.filter((r) => r.quality === "malformed").length,
    scoredRate: denominator ? coveredCount / denominator : 0
  };
}
// Reconcile before aggregation. Existing probability/value events stay intact;
// each additional unsupported dice group becomes visible, without a fake score.
export function reconcileDiceEvidence(
  replay: ReplayModel,
  events: LuckEvent[],
  normalized: ReadonlyMap<ReplayEvent, LuckEvent>,
  links: DiceLinks
) {
  const { records, rawByRecord } = inventoryDiceRecords(replay),
    bySource = new Map<string, DiceRecord>(),
    byRaw = new Map<ReplayEvent, DiceRecord[]>();
  const eventById = new Map(events.map((e) => [e.id, e])),
    eventBySource = new Map(
      events.flatMap((e) =>
        e.metadata.sourceId ? [[e.metadata.sourceId, e] as const] : []
      )
    );
  for (const r of records) {
    const raw = rawByRecord.get(r.id)!;
    if (raw.id) bySource.set(rawKey(raw.id, r.path), r);
    const list = byRaw.get(raw) ?? [];
    list.push(r);
    byRaw.set(raw, list);
    r.parentEventId = normalized.get(raw)?.id;
  }
  const targetRecord = (source: string, path: DicePath) =>
    bySource.get(rawKey(source, path));
  const primary = (source: string) =>
    targetRecord(source, ["Dice"]) ??
    targetRecord(source, ["Die"]) ??
    targetRecord(source, ["NewRoll", "Dice"]) ??
    targetRecord(source, ["RollInfos", "Dice"]);
  const eventForRawRecord = (r: DiceRecord) =>
    normalized.get(rawByRecord.get(r.id)!);
  const selectedPools = new Map<string, string>();
  for (const e of events)
    if (e.metadata.block?.selectedSourceId && e.metadata.block.pool.sourceId)
      selectedPools.set(
        e.metadata.block.selectedSourceId,
        e.metadata.block.pool.sourceId
      );
  for (const turn of replay.turns)
    for (const raw of turn.events) {
      for (const r of byRaw.get(raw) ?? []) {
        const parent = normalized.get(raw),
          p = pathKey(r.path);
        const explicit = links
          .get(raw.id ?? "")
          ?.find((l) => pathKey(l.path) === p);
        if (explicit) {
          const target = targetRecord(
            explicit.target.sourceId,
            explicit.target.path
          );
          if (target) {
            if (explicit.kind === "summary") r.aliasOf = target.id;
            else {
              const e = eventForRawRecord(target);
              if (e) r.eventId = e.id;
            }
          }
        }
        if (r.disposition === "nonrandom") continue;
        if (
          !r.aliasOf &&
          !r.eventId &&
          direct(r.path) &&
          parent &&
          (parent.metadata.isRollCandidate ||
            parent.metadata.mergedRerollAnchorId)
        ) {
          const blockTarget = selectedPools.get(raw.id ?? "");
          if (blockTarget) {
            const target = primary(blockTarget);
            if (target) r.aliasOf = target.id;
          } else if (parent.metadata.mergedRerollAnchorId) {
            const anchor=eventBySource.get(parent.metadata.mergedRerollAnchorId);
            const target=primary(parent.metadata.mergedRerollAnchorId);
            if(r.status===1 && r.newRoll===0 && target &&
               raw.actionId===anchor?.metadata.actionId &&
               JSON.stringify(r.dice)===JSON.stringify(target.dice))
              r.aliasOf=target.id;
            else r.eventId=anchor?.id;
          } else r.eventId = parent.id;
        }
        if (
          !r.aliasOf &&
          !r.eventId &&
          [
            "QuestionKORecovery",
            "QuestionApothecaryCasualtyUsage",
            "QuestionApothecaryCasualtyChoice"
          ].includes(raw.sourceTag) &&
          parent &&
          parent.metadata.isRollCandidate &&
          (raw.sourceTag === "QuestionApothecaryCasualtyChoice"
            ? p === pathKey(["NewRoll", "Dice"])
            : p === pathKey(["RollInfos", "Dice"]))
        ) {
          const duplicate = parent.metadata.embeddedDamageOriginalId;
          if (duplicate) {
            const target = primary(duplicate);
            if (target) r.aliasOf = target.id;
          } else r.eventId = parent.id;
        }
      }
    }
  const added = new Map<ReplayEvent, LuckEvent[]>(),
    turnByRaw = new Map(
      replay.turns.flatMap((t) =>
        t.events.map((e) => [e, t.turnNumber] as const)
      )
    );
  let addedCount = 0;
  for (const r of records) {
    if (r.disposition === "nonrandom") continue;
    if (r.aliasOf) {
      r.disposition = "summary";
      continue;
    }
    let event = r.eventId ? eventById.get(r.eventId) : undefined;
    if (!event) {
      const raw = rawByRecord.get(r.id)!,
        turn = turnByRaw.get(raw)!;
      if (events.length + addedCount >= REPLAY_LIMITS.events)
        throw new ReplayValidationError(
          "Replay expanded evidence event limit exceeded."
        );
      event = nestedEvent(r, raw, turn, replay);
      addedCount++;
      r.eventId = event.id;
      eventById.set(event.id, event);
      const list = added.get(raw) ?? [];
      list.push(event);
      added.set(raw, list);
    }
    const raw = rawByRecord.get(r.id)!;
    r.disposition =
      event.scoringStatus === "scored"
        ? "covered_roll"
        : r.quality !== "malformed" &&
            (direct(r.path) ||
              (event.metadata.isRollCandidate === true &&
                event === normalized.get(raw)) ||
              knownNested(raw, r.path) ||
              links
                .get(raw.id ?? "")
                ?.some(
                  (l) =>
                    pathKey(l.path) === pathKey(r.path) &&
                    l.kind === "policy_original"
                ))
          ? "unscored_roll"
          : "unresolved";
  }
  const represented = new Set(
    records.flatMap((r) => (r.eventId ? [r.eventId] : []))
  );
  for (const [raw, parent] of normalized)
    if (
      parent.scoringStatus === "excluded" &&
      parent.metadata.isRollCandidate &&
      !represented.has(parent.id) &&
      byRaw.get(raw)?.length
    ) {
      parent.metadata.isRollCandidate = false;
      parent.statusReason =
        "excluded: source dice are represented by linked or expanded evidence";
    }
  // Stable source order, including multiple observations from one parent.
  const ordered: LuckEvent[] = [];
  for (const turn of replay.turns)
    for (const raw of turn.events) {
      const e = normalized.get(raw);
      if (e) ordered.push(e);
      for (const extra of added.get(raw) ?? []) ordered.push(extra);
    }
  events.length = 0;
  for (const e of ordered) events.push(e);
  return records;
}
