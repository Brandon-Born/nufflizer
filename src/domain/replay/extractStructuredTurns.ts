import { XMLParser } from "fast-xml-parser";
import {
  observeBoardCheckpoint,
  type ReplayBoardCheckpoint
} from "./boardState";
import { z } from "zod";
import {
  ACTION_CODE_MAP,
  END_TURN_REASON_MAP,
  ROLL_TYPE_MAP,
  STEP_TYPE_MAP,
  labelForCode
} from "./mappings";
import { labelForRollType } from "./rollTypeContracts";
import type { ReplayEvent, ReplayTurn, ReplayUnknownCode } from "./types";
import {
  SAFE_XML_OPTIONS,
  createSafeXmlParser,
  projectReplayBoards,
  type ValidatedXml,
  type XmlProjection
} from "./safeXml";
import { REPLAY_LIMITS } from "./limits";
import { ReplayValidationError } from "@/lib/errors";

type RecordLike = Record<string, unknown>;
type OrderedNode = { [key: string]: OrderedNode[] | unknown };
const code = z.number().int().min(-1).max(1_000_000);
const RollSchema = z
  .object({
    RollType: code,
    Difficulty: code.optional(),
    Requirement: code.optional(),
    Outcome: code.optional(),
    Dice: z
      .object({
        Die: z.union([
          z
            .object({
              Value: z.number().int().min(0).max(100),
              DieType: code.optional()
            })
            .passthrough(),
          z
            .array(
              z
                .object({
                  Value: z.number().int().min(0).max(100),
                  DieType: code.optional()
                })
                .passthrough()
            )
            .min(1)
            .max(6)
        ])
      })
      .passthrough()
  })
  .passthrough();
function record(value: unknown): RecordLike {
  return typeof value === "object" && value !== null
    ? (value as RecordLike)
    : {};
}
function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : undefined;
}
function str(value: unknown): string | undefined {
  return value === undefined || value === "" ? undefined : String(value);
}
function children(node: OrderedNode, tag: string): OrderedNode[] {
  return Array.isArray(node[tag]) ? (node[tag] as OrderedNode[]) : [];
}
function tagOf(node: OrderedNode): string {
  return (
    Object.keys(node).find((key) => key !== ":@" && !key.startsWith("?")) ?? ""
  );
}
function textOf(nodes: OrderedNode[]): string {
  return nodes
    .map((n) => (n["#text"] === undefined ? "" : String(n["#text"])))
    .join("")
    .trim();
}
function find(nodes: OrderedNode[], tag: string): OrderedNode[] {
  return nodes.flatMap((node) => {
    const key = tagOf(node);
    return key === tag ? [node] : find(children(node, key), tag);
  });
}
function field(nodes: OrderedNode[], tag: string): string {
  const node = find(nodes, tag)[0];
  return node ? textOf(children(node, tag)) : "";
}
const cellProjection = { X: true, Y: true } as const;
const boardProjection = {
  Period: true,
  CurrentPhase: true,
  TurnsPerPeriod: true,
  UseSmallPitch: true,
  PitchZones: {
    PitchZone: {
      ZoneType: true,
      BottomLeft: cellProjection,
      TopRight: cellProjection
    }
  },
  IsStable: true,
  ActiveTeam: true,
  ActiveGamer: true,
  ActivePlayer: true,
  ListTeams: {
    TeamState: {
      Data: { TeamId: true },
      GameTurn: true,
      Touchdown: true,
      RerollNumber: true,
      Side: true,
      ListPitchPlayers: {
        PlayerState: {
          Id: true,
          Data: {
            Id: true,
            TeamId: true,
            IdPlayerTypes: true,
            InnateSkills: true,
            AcquiredSkills: true
          },
          Cell: cellProjection,
          CanAct: true,
          TackleZone: true,
          Effects: true,
          Status: true,
          Situation: true,
          MovePoint: true
        }
      }
    }
  },
  Ball: { Cell: cellProjection, Carrier: true, IsHeld: true },
  Bomb: { Carrier: true }
} as const satisfies XmlProjection;

function asObject(
  nodes: OrderedNode[],
  projection?: XmlProjection
): RecordLike {
  const out: RecordLike = Object.create(null) as RecordLike;
  for (const node of nodes) {
    const tag = tagOf(node);
    if (!tag || tag === "#text" || tag === "#comment") continue;
    if (projection && !Object.hasOwn(projection, tag)) continue;
    const inner = children(node, tag);
    const fieldProjection = projection?.[tag];
    const value = inner.some((n) => !tagOf(n).startsWith("#"))
      ? asObject(inner, fieldProjection === true ? undefined : fieldProjection)
      : textOf(inner);
    const previous = out[tag];
    if (Array.isArray(previous)) previous.push(value);
    else if (tag in out) out[tag] = [previous, value];
    else out[tag] = value;
  }
  return out;
}

export function extractStructuredTurnsFromReplayXml(
  xml: ValidatedXml,
  replayVersion?: string,
  projectSnapshots = false
): {
  turns: ReplayTurn[];
  unknownCodes: ReplayUnknownCode[];
  boardCheckpoints: ReplayBoardCheckpoint[];
} {
  const tree = new XMLParser({
    ...SAFE_XML_OPTIONS,
    preserveOrder: true
  }).parse(
    projectSnapshots ? projectReplayBoards(xml, boardProjection) : xml
  ) as OrderedNode[];
  const turns: ReplayTurn[] = [];
  const boardCheckpoints: ReplayBoardCheckpoint[] = [];
  let replayStep = 0;
  const unknown = new Map<string, ReplayUnknownCode>();
  let sequence = 0;
  let eventCount = 0;
  let embeddedBytes = 0;
  const parseMessageXml = createSafeXmlParser();
  let activeGamer: string | undefined;
  const newTurn = (): ReplayTurn => ({
    turnNumber: turns.length + 1,
    gamerId: activeGamer,
    possibleTurnover: false,
    events: [],
    actionTexts: [],
    eventCount: 0,
    raw: {}
  });
  let turn = newTurn();
  function register(
    category: ReplayUnknownCode["category"],
    value: number | undefined,
    map: Record<number, string>
  ) {
    if (value === undefined || value in map) return;
    const key = `${category}:${value}`;
    const entry = unknown.get(key) ?? { category, code: value, occurrences: 0 };
    entry.occurrences++;
    unknown.set(key, entry);
  }
  function push(event: ReplayEvent) {
    if (++eventCount > REPLAY_LIMITS.events)
      throw new ReplayValidationError(
        "Replay exceeds the event processing limit."
      );
    turn.events.push({
      ...event,
      id: `source-${eventCount}`,
      sourceIndex: eventCount,
      sequenceId: event.sequenceId ?? `sequence-${sequence}`
    });
  }
  function decode(encoded: string): { tag: string; payload: RecordLike } {
    if (Buffer.byteLength(encoded) > REPLAY_LIMITS.messageBytes * 2)
      throw new ReplayValidationError(
        "Embedded message exceeds the encoded size limit."
      );
    let value = encoded.replace(/\s/g, "");
    for (let i = 0; i < 2; i++) {
      if (
        Buffer.byteLength(value) > REPLAY_LIMITS.messageBytes * 2 ||
        value.length % 4 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
      ) {
        throw new ReplayValidationError(
          "Invalid embedded message base64 or message size."
        );
      }
      value = Buffer.from(value, "base64").toString("utf8");
    }
    embeddedBytes += Buffer.byteLength(value);
    if (embeddedBytes > REPLAY_LIMITS.embeddedTotalBytes)
      throw new ReplayValidationError(
        "Embedded messages exceed the total processing limit."
      );
    const parsed = parseMessageXml(value, REPLAY_LIMITS.messageBytes);
    const keys = Object.keys(parsed).filter((key) => !key.startsWith("?"));
    if (keys.length !== 1)
      throw new ReplayValidationError(
        "Embedded message must have one document element."
      );
    const tag = keys[0]!;
    const payload = record(parsed[tag]);
    for (const key of [
      "PlayerId",
      "TargetId",
      "TeamId",
      "GamerId",
      "StepType",
      "RollType",
      "Outcome",
      "Status",
      "Requirement",
      "Difficulty"
    ]) {
      if (key in payload && !code.safeParse(payload[key]).success)
        throw new ReplayValidationError(`Invalid numeric ${key} in ${tag}.`);
    }
    if (tag === "ResultRoll" && !RollSchema.safeParse(payload).success)
      throw new ReplayValidationError(
        "Invalid ResultRoll: bounded dice and numeric roll fields are required."
      );
    return { tag, payload };
  }
  function sequenceEvents(
    nodes: OrderedNode[],
    replayStep: number | undefined,
    childIndex: number
  ) {
    sequence++;
    for (const [stepIndex, stepNode] of find(nodes, "StepResult").entries()) {
      const stepNodes = children(stepNode, "StepResult");
      const stepContainer = find(stepNodes, "Step")[0];
      const data = stepContainer
        ? field(children(stepContainer, "Step"), "MessageData")
        : "";
      const step = data
        ? decode(data)
        : { tag: "UnknownStep", payload: {} as RecordLike };
      const p = step.payload;
      const context = {
        sequenceId: `sequence-${sequence}`,
        actionId: `sequence-${sequence}-step-${stepIndex}`,
        stepTag: step.tag,
        stepActorId: str(p.PlayerId),
        stepTargetId: str(p.TargetId),
        damageSource: step.tag === "DamageStep" ? num(p.Source) : undefined,
        locator: {
          replayStep,
          childIndex: replayStep === undefined ? undefined : childIndex,
          stepIndex
        },
        stepType: num(p.StepType),
        playerId: str(p.PlayerId),
        targetId: str(p.TargetId),
        teamId: str(p.TeamId),
        gamerId: str(p.GamerId)
      };
      register("step", context.stepType, STEP_TYPE_MAP);
      push({
        type: step.tag === "BallStep" ? "ball_state" : "step",
        sourceTag: step.tag,
        payload: p,
        ...context
      });
      for (const [messageIndex, message] of find(
        stepNodes,
        "StringMessage"
      ).entries()) {
        const { tag, payload } = decode(
          field(children(message, "StringMessage"), "MessageData")
        );
        const playerId = str(
          payload.PlayerId ?? payload.PushedPlayerId ?? p.PlayerId
        );
        // ResultUseAction.TeamId is zero for actors on both rosters in all
        // 6,342 corpus emissions (UI-096/097 also independently show away
        // actors). Preserve the raw field, but do not treat it as ownership.
        const teamId =
          tag === "ResultUseAction"
            ? undefined
            : str(payload.TeamId ?? p.TeamId);
        const actionCode = num(payload.Action);
        const rollType = num(payload.RollType);
        register("action", actionCode, ACTION_CODE_MAP);
        register("roll", rollType, ROLL_TYPE_MAP);
        const type: ReplayEvent["type"] =
          tag === "ResultRoll"
            ? "roll"
            : /Reroll/.test(tag)
              ? "reroll"
              : /Block|PushBack/.test(tag)
                ? "block"
                : /Injury|Casualty|Removal/.test(tag)
                  ? "casualty"
                  : tag === "ResultUseAction" && actionCode === 3
                    ? "blitz"
                    : tag === "ResultUseAction" && actionCode === 6
                      ? "foul"
                      : /Foul/.test(tag)
                        ? "foul"
                        : tag === "ResultTouchBack"
                          ? "ball_state"
                          : "unknown";
        push({
          ...context,
          locator: { ...context.locator, messageIndex },
          type,
          sourceTag: tag,
          playerId,
          targetId: str(payload.TargetId ?? p.TargetId),
          teamId,
          actorTeamId: teamId,
          actorTeamSource: teamId ? "explicit" : undefined,
          gamerId: str(payload.GamerId ?? p.GamerId),
          stepLabel: labelForCode(STEP_TYPE_MAP, context.stepType, "step"),
          actionCode,
          actionLabel: labelForCode(ACTION_CODE_MAP, actionCode, "action"),
          rollType,
          rollLabel: labelForRollType(
            tag,
            rollType,
            labelForCode(ROLL_TYPE_MAP, rollType, "roll")
          ),
          payload
        });
      }
    }
  }
  function finish() {
    turn.eventCount = turn.events.length;
    turn.actionTexts = Array.from(
      new Set(
        turn.events
          .flatMap((event) => [
            event.type,
            event.sourceTag,
            event.actionLabel,
            event.stepLabel
          ])
          .filter((x): x is string => Boolean(x))
          .map((x) => x.toLowerCase())
      )
    );
    turns.push(turn);
    turn = newTurn();
  }
  function retainCarrier(
    nodes: OrderedNode[],
    carrierObject?: ReplayEvent["carrierObject"],
    checkpointCarrier = false
  ) {
    const carrier = textOf(nodes);
    const playerId = /^\d+$/.test(carrier) ? carrier : undefined;
    if (carrierObject === "ball") turn.ballCarrierPlayerId = playerId;
    push({
      type: "ball_state",
      sourceTag: "Carrier",
      playerId,
      carrierObject,
      checkpointCarrier,
      payload: { Carrier: carrier }
    });
  }
  function walk(
    nodes: OrderedNode[],
    directReplayStep?: number,
    joinedNotification = false
  ) {
    let childIndex = -1;
    for (const node of nodes) {
      const tag = tagOf(node);
      const inner = children(node, tag);
      if (!tag.startsWith("#")) childIndex++;
      if (tag === "ReplayStep") {
        walk(inner, ++replayStep);
        continue;
      }
      if (tag === "NotificationGameJoined") {
        walk(inner, undefined, true);
        continue;
      }
      if (
        (tag === "BoardState" && directReplayStep !== undefined) ||
        (tag === "InitialBoardState" && joinedNotification)
      ) {
        if (boardCheckpoints.length >= REPLAY_LIMITS.events)
          throw new ReplayValidationError(
            "Replay exceeds the board checkpoint limit."
          );
        boardCheckpoints.push(
          observeBoardCheckpoint(
            asObject(inner, boardProjection),
            replayVersion,
            {
              kind: tag === "InitialBoardState" ? "initial" : "board",
              afterSourceIndex: eventCount,
              replayStep: directReplayStep ?? null,
              childIndex: directReplayStep === undefined ? null : childIndex
            }
          )
        );
        // Retain the ordered legacy carrier markers without traversing the
        // entire roster, statistics and appearance data at every snapshot.
        // A new snapshot with no Ball/Carrier no longer establishes a holder.
        turn.ballCarrierPlayerId = undefined;
        for (const ballNode of inner) {
          const ballTag = tagOf(ballNode);
          if (ballTag === "Ball" || ballTag === "Bomb")
            for (const node of children(ballNode, ballTag))
              if (tagOf(node) === "Carrier")
                retainCarrier(
                  children(node, "Carrier"),
                  ballTag === "Ball" ? "ball" : "bomb",
                  true
                );
        }
        continue;
      }
      if (tag === "EventExecuteSequence") {
        sequenceEvents(inner, directReplayStep, childIndex);
        continue;
      }
      if (tag === "EventActiveGamerChanged") {
        activeGamer = field(inner, "NewActiveGamer");
        turn.gamerId = activeGamer;
        push({
          type: "unknown",
          sourceTag: tag,
          locator:
            directReplayStep === undefined
              ? undefined
              : { replayStep: directReplayStep, childIndex },
          gamerId: activeGamer,
          payload: asObject(inner)
        });
        continue;
      }
      if (tag === "Carrier") {
        retainCarrier(inner);
        continue;
      }
      if (tag === "EventEndTurn") {
        turn.endTurnReason = Number(field(inner, "Reason"));
        turn.endTurnReasonLabel = labelForCode(
          END_TURN_REASON_MAP,
          turn.endTurnReason,
          "end_turn_reason"
        );
        register("end_turn_reason", turn.endTurnReason, END_TURN_REASON_MAP);
        // Only the verified turnover reason marks a turnover; phase boundaries do not.
        turn.possibleTurnover = turn.endTurnReason === 2;
        push({
          type: turn.possibleTurnover ? "turnover" : "unknown",
          sourceTag: tag,
          locator:
            directReplayStep === undefined
              ? undefined
              : { replayStep: directReplayStep, childIndex },
          reasonCode: turn.endTurnReason,
          payload: asObject(inner)
        });
        finish();
        continue;
      }
      const directMessage =
        directReplayStep !== undefined &&
        (tag.startsWith("Question") || tag.startsWith("Result"));
      if (tag.startsWith("Event") || directMessage) {
        const payload = asObject(inner);
        // Direct roll messages use string fields and can omit DieType and
        // Outcome. Their locators distinguish them from encoded steps.
        const roll =
          tag === "EventRoll" || tag === "ResultRoll" ? payload : undefined;
        const rollType =
          roll &&
          typeof roll.RollType === "string" &&
          /^\d{1,6}$/.test(roll.RollType)
            ? Number(roll.RollType)
            : undefined;
        if (rollType !== undefined) register("roll", rollType, ROLL_TYPE_MAP);
        push({
          type: rollType === undefined ? "unknown" : "roll",
          sourceTag: tag,
          playerId:
            tag === "EventBuyMercenary" || tag === "EventRemoveMercenary"
              ? str(payload.MercenaryId)
              : roll ||
                  tag === "QuestionBribeUsage" ||
                  tag === "ResultPlayerRemoval" ||
                  tag === "ResultPlayerSentOff" ||
                  tag === "EventEndPlayerEffect" ||
                  tag === "EventAddPlayerEffect"
                ? str(payload.PlayerId)
                : undefined,
          teamId: roll ? str(roll.TeamId) : undefined,
          rollType,
          rollLabel: labelForCode(ROLL_TYPE_MAP, rollType, "roll"),
          locator:
            directReplayStep === undefined
              ? undefined
              : { replayStep: directReplayStep, childIndex },
          payload
        });
        continue;
      }
      walk(inner);
    }
  }
  walk(tree);
  if (turn.events.length) finish();
  return {
    turns,
    boardCheckpoints,
    unknownCodes: [...unknown.values()].sort(
      (a, b) => b.occurrences - a.occurrences
    )
  };
}
